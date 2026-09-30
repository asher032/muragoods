'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ECONOMIC_KEYS as SERVER_ECONOMIC_KEYS, ECONOMIC_LABELS } from '@/app/lib/economy-owner';
import type { EconomyConfig } from './useEconomyData';

// ── ⚙️ Economy Configuration ────────────────────────────────────────────
// Economic values (currency, rewards, cooldowns, prices, probabilities) are
// OWNER-ONLY, and the controls are actually disabled for everyone else rather
// than merely hidden.
//
// The disabled state is a courtesy, not the control. The API independently
// refuses a non-owner economic write and returns OWNER_ONLY with the exact list
// of rejected fields, and the bot re-checks the caller independently. A
// non-owner who forges the request still gets a 403.
//
// A server admin may still change operational settings; those are not economic
// values and are not in the owner-only set.

type FieldKind = 'text' | 'number' | 'boolean';

interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  hint?: string;
  /** Expected range, quoted back verbatim when validation fails. */
  expected?: string;
}

const GROUPS: Array<{ title: string; blurb: string; fields: FieldDef[] }> = [
  {
    title: 'Currency',
    blurb: 'The name and symbol members see everywhere.',
    fields: [
      { key: 'currencyName', label: 'Currency name', kind: 'text', expected: '1–20 characters' },
      { key: 'currencySymbol', label: 'Currency symbol', kind: 'text', expected: '1–8 characters' },
      { key: 'startBalance', label: 'Starting balance', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'bankCapacity', label: 'Base bank capacity', kind: 'number', min: 0, max: 100000000, expected: '0 – 100,000,000' },
    ],
  },
  {
    title: 'Rewards',
    blurb: 'Timed rewards. All are paid by the same server-side reward service.',
    fields: [
      { key: 'dailyAmount', label: 'Daily reward', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'weeklyAmount', label: 'Weekly reward', kind: 'number', min: 0, max: 500000, expected: '0 – 500,000' },
      { key: 'monthlyAmount', label: 'Monthly reward', kind: 'number', min: 0, max: 2000000, expected: '0 – 2,000,000' },
    ],
  },
  {
    title: 'Work & activity',
    blurb: 'Work income is the economy’s baseline — the shop is priced around it.',
    fields: [
      { key: 'workMin', label: 'Work minimum payout', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'workMax', label: 'Work maximum payout', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'begMin', label: 'Beg minimum', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'begMax', label: 'Beg maximum', kind: 'number', min: 0, max: 100000, expected: '0 – 100,000' },
      { key: 'jobFailRate', label: 'Job failure rate', kind: 'number', min: 0.05, max: 0.9, expected: '0.05 – 0.9', hint: 'Fraction, not a percentage' },
    ],
  },
  {
    title: 'Cooldowns',
    blurb: 'Seconds between uses.',
    fields: [
      { key: 'workCooldownSec', label: 'Work cooldown', kind: 'number', min: 60, max: 86400, expected: '60 – 86,400' },
      { key: 'begCooldownSec', label: 'Beg cooldown', kind: 'number', min: 30, max: 86400, expected: '30 – 86,400' },
      { key: 'crimeCooldownSec', label: 'Crime cooldown', kind: 'number', min: 60, max: 86400, expected: '60 – 86,400' },
      { key: 'activityCooldownSec', label: 'Activity cooldown', kind: 'number', min: 30, max: 86400, expected: '30 – 86,400' },
      { key: 'robCooldownSec', label: 'Rob cooldown', kind: 'number', min: 60, max: 86400, expected: '60 – 86,400' },
      { key: 'gambleCooldownSec', label: 'Gambling cooldown', kind: 'number', min: 0, max: 86400, expected: '0 – 86,400' },
    ],
  },
  {
    title: 'Gambling & lottery',
    blurb: 'Risk limits and ticket pricing.',
    fields: [
      { key: 'gambleMax', label: 'Maximum bet', kind: 'number', min: 10, max: 1000000, expected: '10 – 1,000,000' },
      { key: 'robMinTarget', label: 'Rob minimum target balance', kind: 'number', min: 0, max: 1000000, expected: '0 – 1,000,000' },
      { key: 'lotteryTicketPrice', label: 'Lottery ticket price', kind: 'number', min: 1, max: 100000, expected: '1 – 100,000' },
      { key: 'lotteryMaxTickets', label: 'Max tickets per round', kind: 'number', min: 1, max: 1000, expected: '1 – 1,000' },
    ],
  },
];

/** Mirrors the server's owner-only set. Kept in sync deliberately: the server
 *  re-checks independently, so a drift here could only ever over-restrict the
 *  UI, never under-protect the economy. */
const OWNER_ONLY = new Set(SERVER_ECONOMIC_KEYS);

export interface ValidationIssue {
  field: string;
  label: string;
  current: string;
  expected: string;
  reason: string;
  fix: string;
}

export function EconomyConfigPanel({ config, guildId, actorId, onSaved }: {
  config: EconomyConfig | null;
  guildId: string;
  actorId: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [ownerOnly, setOwnerOnly] = useState(false);

  const value = (key: string) => {
    if (key in draft) return draft[key];
    const raw = (config as Record<string, unknown> | null)?.[key];
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const set = (key: string, next: string) => {
    setDraft((d) => ({ ...d, [key]: next }));
    setIssues((list) => list.filter((i) => i.field !== key));
  };

  const dirty = useMemo(() => Object.keys(draft), [draft]);

  /**
   * Client-side pre-check that names the exact field, its current value, the
   * accepted range, why it failed and what to do about it. The server remains
   * the authority; this exists so a mistake is explained instead of producing
   * a blanket "1 setting failed validation".
   */
  function validate(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const found: ValidationIssue[] = [];
    for (const group of GROUPS) {
      for (const field of group.fields) {
        if (!(field.key in draft)) continue;
        const raw = draft[field.key];
        if (field.kind === 'number') {
          if (raw.trim() === '') continue;
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            found.push({
              field: field.key, label: field.label, current: raw,
              expected: field.expected ?? 'a number',
              reason: 'This value is not a number.',
              fix: `Enter a number between ${field.expected ?? 'the allowed range'}.`,
            });
            continue;
          }
          if (field.min !== undefined && field.max !== undefined && (n < field.min || n > field.max)) {
            found.push({
              field: field.key, label: field.label, current: String(n),
              expected: field.expected ?? `${field.min} – ${field.max}`,
              reason: `${n} is outside the allowed range ${field.min} – ${field.max}.`,
              fix: `Choose a value between ${field.min} and ${field.max}.`,
            });
            continue;
          }
          out[field.key] = field.key === 'jobFailRate' ? n : Math.floor(n);
        } else {
          const trimmed = raw.trim();
          if (field.key === 'currencyName' && (trimmed.length < 1 || trimmed.length > 20)) {
            found.push({
              field: field.key, label: field.label, current: trimmed || '(empty)',
              expected: field.expected ?? '1–20 characters',
              reason: trimmed.length === 0 ? 'The currency name cannot be empty.' : `That name is ${trimmed.length} characters.`,
              fix: 'Enter a name between 1 and 20 characters.',
            });
            continue;
          }
          if (field.key === 'currencySymbol' && (trimmed.length < 1 || trimmed.length > 8)) {
            found.push({
              field: field.key, label: field.label, current: trimmed || '(empty)',
              expected: field.expected ?? '1–8 characters',
              reason: trimmed.length === 0 ? 'The currency symbol cannot be empty.' : `That symbol is ${trimmed.length} characters.`,
              fix: 'Enter 1–8 characters (an emoji such as 🪙 counts as one).',
            });
            continue;
          }
          out[field.key] = trimmed;
        }
      }
    }
    setIssues(found);
    return found.length ? null : out;
  }

  const save = async () => {
    setNotice(null);
    setOwnerOnly(false);
    const payload = validate();
    if (!payload) return;
    if (Object.keys(payload).length === 0) {
      setNotice({ tone: 'err', text: 'Nothing to save — no values were changed.' });
      return;
    }
    setSaving(true);
    const resp = await apiFetch<{
      success?: boolean; error?: string; code?: string; rejected?: string[];
    }>('/api/dashboard/economy/config', {
      method: 'PATCH',
      body: { guildId, actorId, config: payload },
    });
    setSaving(false);

    if (resp.ok && resp.data.success) {
      setDraft({});
      setNotice({ tone: 'ok', text: `Saved ${Object.keys(payload).length} setting(s).` });
      await onSaved();
      return;
    }
    // OWNER_ONLY comes back with the specific rejected fields, so name them
    // rather than showing one generic refusal.
    if (resp.ok && resp.data.code === 'OWNER_ONLY') {
      setOwnerOnly(true);
      const rejected = resp.data.rejected ?? [];
      setIssues(rejected.map((key) => {
        const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === key);
        return {
          field: key,
          label: field?.label ?? ECONOMIC_LABELS[key] ?? key,
          current: value(key) || '(empty)',
          expected: field?.expected ?? 'owner-authorised value',
          reason: 'Economic values can only be changed by the Murabot owner.',
          fix: 'Ask the owner to make this change, or leave the current value in place.',
        };
      }));
      return;
    }
    setNotice({
      tone: 'err',
      text: resp.ok ? resp.data.error || 'Could not save configuration.' : resp.error,
    });
  };

  const anyEconomic = dirty.some((k) => OWNER_ONLY.has(k));

  return (
    <div>
      {anyEconomic && (
        <div className="cc-card" style={{ padding: '12px 16px', marginBottom: 12, borderLeft: '3px solid #fbbf24' }}>
          <strong style={{ color: '#fbbf24', fontSize: 13 }}>🔒 Owner Only</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
            The settings below define economic value. Only the Murabot owner can change them. If you
            are the owner, save normally — the API verifies this server-side and will refuse the write
            if you are not.
          </p>
        </div>
      )}

      {notice && (
        <div
          className={`cc-alert ${notice.tone === 'ok' ? 'cc-alert-success' : 'cc-alert-error'}`}
          style={{ marginBottom: 12 }}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {/* A failure names the setting, its value, what is accepted, why and how
          to fix it. "1 setting failed validation" is never shown alone. */}
      {issues.length > 0 && (
        <div className="cc-alert cc-alert-error" style={{ marginBottom: 14 }} role="alert">
          <strong>⚠️ Not saved — {issues.length} setting{issues.length === 1 ? '' : 's'} need attention</strong>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {issues.map((issue) => (
              <div key={issue.field} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{issue.label}</div>
                <dl style={{ margin: '6px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12 }}>
                  <dt style={{ color: 'var(--cc-text-faint)' }}>Current value</dt>
                  <dd style={{ margin: 0, color: '#fff', fontFamily: 'ui-monospace, monospace' }}>{issue.current}</dd>
                  <dt style={{ color: 'var(--cc-text-faint)' }}>Expected value</dt>
                  <dd style={{ margin: 0, color: '#fff' }}>{issue.expected}</dd>
                  <dt style={{ color: 'var(--cc-text-faint)' }}>Reason</dt>
                  <dd style={{ margin: 0, color: 'var(--cc-text-dim)' }}>{issue.reason}</dd>
                  <dt style={{ color: 'var(--cc-text-faint)' }}>How to fix it</dt>
                  <dd style={{ margin: 0, color: 'var(--cc-text-dim)' }}>{issue.fix}</dd>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 18 }}>
          <div className="cc-section-label" style={{ marginBottom: 2 }}>
            {OWNER_ONLY.has(group.fields[0]?.key ?? '') ? '🔒 ' : ''}{group.title}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{group.blurb}</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {group.fields.map((field) => {
              const locked = OWNER_ONLY.has(field.key);
              return (
                <div key={field.key} className="cc-card" style={{ padding: '10px 14px' }}>
                  <label
                    htmlFor={`eco-${field.key}`}
                    style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4 }}
                  >
                    {field.label}{locked ? ' · 🔒 Owner Only' : ''}
                  </label>
                  <input
                    id={`eco-${field.key}`}
                    type={field.kind === 'number' ? 'number' : 'text'}
                    value={value(field.key)}
                    step={field.key === 'jobFailRate' ? '0.05' : '1'}
                    onChange={(e) => set(field.key, e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--cc-bg)', color: locked ? 'var(--cc-text-faint)' : '#fff',
                      border: '1px solid var(--cc-border, #2a2a3a)', borderRadius: 6,
                      padding: '6px 8px', fontSize: 13,
                      opacity: locked ? 0.75 : 1,
                    }}
                  />
                  {field.hint && (
                    <div style={{ fontSize: 10.5, color: 'var(--cc-text-faint)', marginTop: 3 }}>{field.hint}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="cc-btn" style={{ fontSize: 12.5 }} disabled={saving || dirty.length === 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="cc-btn"
          style={{ fontSize: 12.5 }}
          disabled={saving || dirty.length === 0}
          onClick={() => { setDraft({}); setIssues([]); setNotice(null); }}
        >
          Discard
        </button>
        {dirty.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
            {dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {ownerOnly && (
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
          The server refused the write. This check runs in the API and again in Murabot, so it holds
          even if this page is bypassed entirely.
        </p>
      )}
    </div>
  );
}
