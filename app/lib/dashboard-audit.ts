import type { Document, UpdateFilter } from 'mongodb';
import { discordConfigCollection } from '@/app/lib/discord-config';

// Config audit trail — stored as a capped embedded array on the guild's
// config document (guild_config.config_audit, last 100 entries) so bot and
// dashboard read the same store. Every entry records who changed what with
// before/after values.

export interface AuditFieldChange {
  section: string;
  field: string;
  before: unknown;
  after: unknown;
}

function shortValue(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
  return String(v).slice(0, 200);
}

/** Compare the incoming update against the existing doc; returns field-level diffs. */
export function diffConfigUpdate(
  existing: Record<string, unknown> | null,
  update: Record<string, unknown>,
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const [section, newVal] of Object.entries(update)) {
    if (newVal === null || typeof newVal !== 'object') {
      const before = existing ? (existing as Record<string, unknown>)[section] : undefined;
      if (JSON.stringify(before) !== JSON.stringify(newVal)) {
        changes.push({ section: '', field: section, before: shortValue(before), after: shortValue(newVal) });
      }
      continue;
    }
    const oldSection = (existing?.[section] ?? {}) as Record<string, unknown>;
    for (const [field, after] of Object.entries(newVal as Record<string, unknown>)) {
      const before = oldSection[field];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ section, field, before: shortValue(before), after: shortValue(after) });
      }
    }
  }
  return changes.slice(0, 40);
}

export async function auditConfigChange(
  guildId: string,
  actor: string,
  summary: string,
  changes: AuditFieldChange[] = [],
) {
  const collection = await discordConfigCollection();
  const entry = {
    actor: actor.slice(0, 100),
    summary: summary.slice(0, 500),
    changes,
    at: new Date().toISOString(),
  };
  const pushUpdate: UpdateFilter<Document> = {
    $push: { config_audit: { $each: [entry], $slice: -100 } },
  } as unknown as UpdateFilter<Document>;
  await collection.updateOne(
    { guildId },
    { ...pushUpdate, $set: { updatedAt: new Date() } } as UpdateFilter<Document>,
    { upsert: true },
  );
  return entry;
}
