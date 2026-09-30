'use client';

import { useCallback, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  ECONOMY_ERROR_CODES,
  ECONOMY_FIELDS,
  OWNER_ONLY_ECONOMY_KEYS as SERVER_ECONOMIC_KEYS,
  ECONOMY_FIELD_BY_KEY,
  type EconomyField,
  type EconomyFieldError,
} from '@/app/lib/economy-schema';
import EconomyLogChannelSelect from './EconomyLogChannelSelect';
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

// Field definitions are NOT repeated here. They come from the shared schema
// the server validates against, so a control cannot exist for a setting the
// API would reject, and a new setting appears here automatically.

const FIELD_BY_KEY: ReadonlyMap<string, EconomyField> = new Map(
  ECONOMY_FIELDS.map((f) => [f.key, f]),
);

function rangeText(field: EconomyField): string {
  if (field.kind === 'int' || field.kind === 'number') {
    return `${field.min} – ${Number(field.max).toLocaleString()}`;
  }
  if (field.kind === 'text') {
    return field.key === 'currencyName' ? '1–20 characters' : field.key === 'currencySymbol' ? '1–8 characters' : 'text';
  }
  return field.kind;
}

/** Presentation grouping. Membership is by key so the schema stays the truth. */
const GROUPS: Array<{ title: string; blurb: string; keys: string[] }> = [
  {
    title: 'Currency',
    blurb: 'The name and symbol members see everywhere.',
    keys: ['currencyName', 'currencySymbol', 'startBalance', 'bankCapacity'],
  },
  {
    title: 'Rewards',
    blurb: 'Timed rewards, all paid by the same server-side reward service.',
    keys: ['dailyAmount', 'weeklyAmount', 'monthlyAmount'],
  },
  {
    title: 'Work & activity',
    blurb: 'Work income is the economy’s baseline — the shop is priced around it.',
    keys: ['workMin', 'workMax', 'begMin', 'begMax', 'jobFailRate'],
  },
  {
    title: 'Cooldowns',
    blurb: 'Seconds between uses.',
    keys: ['gambleCooldownSec', 'workCooldownSec', 'begCooldownSec', 'crimeCooldownSec', 'activityCooldownSec', 'robCooldownSec'],
  },
  {
    title: 'Gambling & lottery',
    blurb: 'Risk limits and ticket pricing.',
    keys: ['gambleMax', 'robMinTarget', 'lotteryTicketPrice', 'lotteryMaxTickets', 'jobCooldownSec'],
  },
];

/**
 * The owner-only set comes from the schema itself, so adding a setting cannot
 * make it admin-editable by forgetting to update a second list. The server
 * enforces this independently — a mismatch here could only ever over-restrict
 * the UI, never under-protect the economy.
 */
const OWNER_ONLY = SERVER_ECONOMIC_KEYS;
const LABEL_BY_KEY = ECONOMY_FIELD_BY_KEY;

export interface ValidationIssue {
  field: string;
  label: string;
  current: string;
  expected: string;
  reason: string;
  fix: string;
}

/**
 * Turn a server error code into an actionable instruction.
 *
 * The server states the FACT ("missing Send Messages"); this adds the FIX
 * ("open the channel's permission overwrites"). Without it the operator knows
 * something is wrong but not what to do next.
 */
function remediationFor(error: EconomyFieldError): string {
  switch (error.code) {
    case ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND:
      return 'Open the dropdown and select a channel that still exists on this server.';
    case ECONOMY_ERROR_CODES.CHANNEL_ACCESS_DENIED:
      return 'Check the channel’s permission overwrites in Discord — Murabot must be able to view it.';
    case ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION:
      return `In Discord: right-click the channel → Edit Channel → Permissions, and allow Murabot to ${String(error.missingPermission ?? 'use it')}. Then save again.`;
    case ECONOMY_ERROR_CODES.CHANNEL_NOT_TEXT_CAPABLE:
      return 'Select a text channel — voice channels and categories cannot receive messages.';
    case ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD:
      return 'Invite Murabot to this server first, then save again.';
    case ECONOMY_ERROR_CODES.OWNER_ONLY:
      return 'Ask the Murabot owner to make this change, or leave the current value in place.';
    case ECONOMY_ERROR_CODES.OUT_OF_RANGE:
    case ECONOMY_ERROR_CODES.INVALID_NUMBER:
      return `Enter a value within ${error.expected ?? 'the allowed range'}.`;
    case ECONOMY_ERROR_CODES.CROSS_FIELD_INVALID:
      return error.expected ?? 'Adjust the value so the pair is consistent.';
    case ECONOMY_ERROR_CODES.DISCORD_RATE_LIMITED:
    case ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE:
    case ECONOMY_ERROR_CODES.DATABASE_ERROR:
      return 'This was a temporary problem, not a problem with your settings. Try saving again in a moment — your existing configuration is unchanged.';
    default:
      return 'Correct the value and save again.';
  }
}

export function EconomyConfigPanel({ config, guildId, actorId, isOwner, onSaved }: {
  config: EconomyConfig | null;
  guildId: string;
  actorId: string | null;
  /** Whether the signed-in account may change economic values. */
  isOwner: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const value = (key: string) => {
    if (key in draft) return draft[key];
    const raw = (config as Record<string, unknown> | null)?.[key];
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const reportChannelIssue = useCallback((error: EconomyFieldError | null) => {
    setIssues((list) => {
      const without = list.filter((i) => i.field !== 'logChannelId');
      if (!error) return without;
      const mapped: ValidationIssue = {
        field: 'logChannelId',
        label: error.label || 'Economy Log Channel',
        current: error.current ?? '(empty)',
        expected: error.expected ?? 'A usable text channel',
        reason: error.message,
        fix: remediationFor(error),
      };
      // Keep the list stable so a re-render does not reorder the form.
      return [...without, mapped];
    });
  }, []);

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
  /**
   * Client pre-check, derived from the SAME schema the server validates
   * against, so the two cannot disagree. It exists to give instant feedback
   * on an obviously-bad value; the server's structured `errors[]` is the
   * authority and always wins.
   */
  function validate(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const found: ValidationIssue[] = [];
    for (const [key, raw] of Object.entries(draft)) {
      const field = FIELD_BY_KEY.get(key);
      if (!field) continue; // server rejects unknown keys authoritatively
      if (field.kind === 'int' || field.kind === 'number') {
        if (raw.trim() === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          found.push({
            field: key, label: field.label, current: raw, expected: rangeText(field),
            reason: `${field.label} must be a number.`,
            fix: `Enter a number between ${field.min} and ${field.max}.`,
          });
          continue;
        }
        if (field.kind === 'int' && !Number.isInteger(n)) {
          found.push({
            field: key, label: field.label, current: raw, expected: 'A whole number',
            reason: `${field.label} must be a whole number.`,
            fix: `Remove the decimal — whole numbers only (${field.min} – ${field.max}).`,
          });
          continue;
        }
        if (field.min !== undefined && field.max !== undefined && (n < field.min || n > field.max)) {
          found.push({
            field: key, label: field.label, current: String(n), expected: rangeText(field),
            reason: `${n} is outside the allowed range ${field.min} – ${field.max}.`,
            fix: `Choose a value between ${field.min} and ${field.max}.`,
          });
          continue;
        }
        out[key] = n;
      } else if (field.kind === 'text') {
        const text = raw.trim();
        if (text === '' && field.allowEmpty) { out[key] = ''; continue; }
        const maxLen = key === 'currencyName' ? 20 : key === 'currencySymbol' ? 8 : 100;
        if (text === '' || text.length > maxLen) {
          found.push({
            field: key, label: field.label, current: text || '(empty)', expected: rangeText(field),
            reason: text === ''
              ? `${field.label} cannot be empty.`
              : `${field.label} is ${text.length} characters; the limit is ${maxLen}.`,
            fix: `Enter 1–${maxLen} characters.`,
          });
          continue;
        }
        out[key] = text;
      } else if (field.kind === 'channel') {
        const id = raw.trim();
        if (id === '' || /^\d{5,25}$/.test(id)) out[key] = id;
      }
      // A channel the server has already ruled unusable must not be submitted
      // even if the selector is somehow holding a stale value.
    }
    setIssues(found);
    return found.length ? null : out;
  }

  const save = async () => {
    setNotice(null);
    const payload = validate();
    if (!payload) return;
    if (Object.keys(payload).length === 0) {
      setNotice({ tone: 'err', text: 'Nothing to save — no values were changed.' });
      return;
    }
    setSaving(true);
    const resp = await apiFetch<{
      success?: boolean; error?: string; code?: string;
      errors?: EconomyFieldError[]; warnings?: EconomyFieldError[];
    }>('/api/dashboard/config', {
      method: 'PATCH',
      body: { guildId, actorId, config: { economy: payload } },
    });
    setSaving(false);

    if (resp.ok && resp.data.success) {
      setDraft({});
      // Advice (e.g. a weekly reward below the daily one) is reported, but it
      // never blocks the save — so it rides along with the success message.
      const advice = (resp.data.warnings ?? []).map((w) => `• ${w.message}`);
      setNotice({
        tone: 'ok',
        text: ['✓ Economy settings saved successfully.', ...advice].join('\n'),
      });
      await onSaved();
      return;
    }

    // Structured per-field errors from the server. These are the truth — the
    // client pre-check only catches what it can see locally, and the server
    // is the only side that knows the live channel and permission state.
    const body = resp.ok ? resp.data : null;
    const serverErrors = body?.errors;
    if (serverErrors && serverErrors.length > 0) {
      setIssues(serverErrors.map((e) => ({
        field: e.field,
        label: e.label || LABEL_BY_KEY.get(e.field)?.label || e.field,
        current: e.current ?? value(e.field) ?? '(empty)',
        expected: e.expected ?? '—',
        reason: e.message,
        fix: remediationFor(e),
      })));
      setNotice({
        tone: 'err',
        text: serverErrors.length === 1
          ? '✕ Could not save Economy settings — 1 setting needs attention. Nothing was saved.'
          : `✕ Could not save Economy settings — ${serverErrors.length} settings need attention. Nothing was saved.`,
      });
      return;
    }
    // The owner check could not be completed, or was refused outright. The API
    // returns the specific rejected fields in `errors[]`, which the branch
    // above has already rendered; this is the fallback for anything else.
    const failure = resp.ok ? resp.data.error : resp.error;
    setNotice({
      tone: 'err',
      text: failure
        ? `✕ Could not save Economy settings — ${failure} Nothing was saved.`
        : '✕ Could not save Economy settings. Nothing was saved.',
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

      {/* Server-side failures are shown against their own control above; this
          list surfaces any that belong to a field not rendered here (for
          example the log channel, which the channel selector owns). */}
      {issues.filter((i) => !GROUPS.some((g) => g.keys.includes(i.field))).map((issue) => (
        <FieldIssue key={issue.field} issue={issue} />
      ))}

      {/* A failure names the setting, its value, what is accepted, why and how
          to fix it. "1 setting failed validation" is never shown alone. */}
      {issues.length > 0 && (
        <div className="cc-alert cc-alert-error" style={{ marginBottom: 14 }} role="alert">
          <strong>⚠️ Not saved — {issues.length} setting{issues.length === 1 ? '' : 's'} need attention</strong>
          <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginTop: 4 }}>
            Nothing was written. Each problem is listed below, next to the setting it belongs to.
          </div>
        </div>
      )}

      {/* The log channel is a Discord object, not a number, so it gets a real
          selector populated from the live guild rather than a text box. */}
      <div className="cc-section-label" style={{ margin: '0 0 8px' }}>Logging</div>
      <div style={{ marginBottom: 18 }}>
        <EconomyLogChannelSelect
          guildId={guildId}
          value={value('logChannelId')}
          onChange={(id) => set('logChannelId', id)}
          onValidity={reportChannelIssue}
        />
      </div>

      {GROUPS.map((group) => {
        const fields = group.keys
          .map((key) => FIELD_BY_KEY.get(key))
          .filter((f): f is EconomyField => Boolean(f));
        if (fields.length === 0) return null;
        return (
          <div key={group.title} style={{ marginBottom: 18 }}>
            <div className="cc-section-label" style={{ marginBottom: 2 }}>
              {fields.every((f) => f.ownerOnly) ? '🔒 ' : ''}{group.title}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{group.blurb}</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
              {fields.map((field) => {
                const locked = field.ownerOnly && !isOwner;
                const issue = issues.find((i) => i.field === field.key);
                return (
                  <div
                    key={field.key}
                    className="cc-card"
                    style={{
                      padding: '10px 14px',
                      borderLeft: issue ? '3px solid #f87171' : undefined,
                    }}
                  >
                    <label
                      htmlFor={`eco-${field.key}`}
                      style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4 }}
                    >
                      {field.label}{field.ownerOnly ? ' · 🔒 Owner Only' : ''}
                    </label>
                    <input
                      id={`eco-${field.key}`}
                      type={field.kind === 'int' || field.kind === 'number' ? 'number' : 'text'}
                      aria-invalid={issue ? true : undefined}
                      aria-describedby={issue ? `eco-err-${field.key}` : undefined}
                      value={value(field.key)}
                      step={field.key === 'jobFailRate' ? '0.05' : '1'}
                      min={field.min}
                      max={field.max}
                      onChange={(e) => set(field.key, e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--cc-bg)', color: locked ? 'var(--cc-text-faint)' : '#fff',
                        border: `1px solid ${issue ? '#f87171' : 'var(--cc-border, #2a2a3a)'}`,
                        borderRadius: 6, padding: '6px 8px', fontSize: 13,
                        opacity: locked ? 0.75 : 1,
                      }}
                    />
                    {field.help && (
                      <div style={{ fontSize: 10.5, color: 'var(--cc-text-faint)', marginTop: 3 }}>{field.help}</div>
                    )}
                    {/* The error sits directly under its own control. */}
                    {issue && <FieldIssue id={`eco-err-${field.key}`} issue={issue} compact />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="cc-btn"
          style={{ fontSize: 12.5, opacity: saving ? 0.7 : 1, cursor: saving ? 'progress' : 'pointer' }}
          disabled={saving || dirty.length === 0}
          aria-busy={saving}
          onClick={() => void save()}
        >
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

      {anyEconomic && (
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
          The server verifies this on every write, and again in Murabot itself, so the restriction
          holds even if this page is bypassed entirely.
        </p>
      )}
    </div>
  );
}

/**
 * One field's problem, rendered directly beneath its control.
 *
 * `compact` is the inline form shown under an input; the full form carries
 * the same four facts (current, expected, reason, fix) for a setting whose
 * control lives elsewhere.
 */
function FieldIssue({ issue, id, compact }: { issue: ValidationIssue; id?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div id={id} style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45 }} role="alert">
        <div style={{ color: '#f87171' }}>❌ {issue.reason}</div>
        {issue.fix && (
          <div style={{ color: 'var(--cc-text-faint)', marginTop: 2 }}>{issue.fix}</div>
        )}
      </div>
    );
  }
  return (
    <div
      className="cc-card"
      style={{ padding: 10, marginBottom: 8, background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #f87171' }}
      role="alert"
    >
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
  );
}
