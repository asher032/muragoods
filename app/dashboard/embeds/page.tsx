'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Clock, ExternalLink, Hash, Image as ImageIcon, Plus, RefreshCw,
  Save, Send, Sparkles, Trash2, Type,
} from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import {
  EMBED_LIMITS, embedTotalChars, isEmptyEmbed, validateEmbed,
  type EmbedFieldError,
} from '@/app/lib/embed-schema';

// ── Embed Builder ────────────────────────────────────────────────────────
//
// Create an embed, see exactly what Discord will render, save it as a draft,
// and send it — with the real Discord answer reported back.
//
// Three properties worth naming, because each replaced a specific lie:
//
//   * The preview is built from the SAME validation the send route uses
//     (`app/lib/embed-schema.ts`). A preview that renders differently from the
//     message is worse than no preview.
//   * Limits are enforced as you type and reported per field. Nothing is
//     silently truncated: an over-long paragraph is refused with its character
//     count, not posted minus its ending.
//   * The channel list comes from Murabot, so it is the list of channels the
//     bot can actually post an embed in — and a channel it cannot use is shown
//     disabled WITH the missing permission rather than hidden.

interface ChannelOption {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
  usable: boolean;
  missing: { requirement: string; permission: string; label: string } | null;
}

interface SavedEmbed { id: string; name: string; embed: Record<string, unknown>; updatedAt: string }

interface LoadPayload {
  success: boolean;
  channels?: ChannelOption[];
  channelError?: { code: string; message: string } | null;
  saved?: SavedEmbed[];
  bot?: { installed: boolean | null };
  error?: string;
  code?: string;
}

interface FieldDraft { key: string; name: string; value: string; inline: boolean }

interface Draft {
  title: string;
  description: string;
  url: string;
  color: number;
  useTimestamp: boolean;
  footerText: string;
  footerIcon: string;
  authorName: string;
  authorUrl: string;
  authorIcon: string;
  image: string;
  thumbnail: string;
  fields: FieldDraft[];
}

const EMPTY_DRAFT: Draft = {
  title: '', description: '', url: '', color: 0, useTimestamp: false,
  footerText: '', footerIcon: '', authorName: '', authorUrl: '', authorIcon: '',
  image: '', thumbnail: '', fields: [],
};

const swatches: { label: string; value: number }[] = [
  { label: 'Murabot default', value: 0 },
  { label: 'Green', value: 0x06d6a0 },
  { label: 'Amber', value: 0xfbbf24 },
  { label: 'Red', value: 0xf87171 },
  { label: 'Blue', value: 0x60a5fa },
  { label: 'Teal', value: 0x2dd4bf },
  { label: 'Pink', value: 0xf472b6 },
  { label: 'Slate', value: 0x94a3b8 },
];

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function buildEmbed(draft: Draft): Record<string, unknown> {
  const hasFooter = Boolean(draft.footerText.trim() || draft.footerIcon.trim());
  const hasAuthor = Boolean(draft.authorName.trim());
  return {
    title: draft.title,
    description: draft.description,
    url: draft.url,
    color: draft.color,
    timestamp: draft.useTimestamp ? new Date().toISOString() : '',
    footer: hasFooter
      ? { text: draft.footerText, ...(draft.footerIcon.trim() ? { icon_url: draft.footerIcon } : {}) }
      : undefined,
    author: hasAuthor
      ? {
        name: draft.authorName,
        ...(draft.authorUrl.trim() ? { url: draft.authorUrl } : {}),
        ...(draft.authorIcon.trim() ? { icon_url: draft.authorIcon } : {}),
      }
      : undefined,
    image: draft.image.trim() ? { url: draft.image } : undefined,
    thumbnail: draft.thumbnail.trim() ? { url: draft.thumbnail } : undefined,
    fields: draft.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })),
  };
}

function draftFromEmbed(embed: Record<string, unknown>): Draft {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const footer = (embed.footer ?? {}) as Record<string, unknown>;
  const author = (embed.author ?? {}) as Record<string, unknown>;
  const image = (embed.image ?? {}) as Record<string, unknown>;
  const thumbnail = (embed.thumbnail ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  return {
    title: str(embed.title),
    description: str(embed.description),
    url: str(embed.url),
    color: typeof embed.color === 'number' ? embed.color : 0,
    useTimestamp: Boolean(embed.timestamp),
    footerText: str(footer.text),
    footerIcon: str(footer.icon_url),
    authorName: str(author.name),
    authorUrl: str(author.url),
    authorIcon: str(author.icon_url),
    image: str(image.url),
    thumbnail: str(thumbnail.url),
    fields: fields.map((f, i) => {
      const row = (f ?? {}) as Record<string, unknown>;
      return {
        key: `saved-${i}`,
        name: str(row.name),
        value: str(row.value ?? ''),
        inline: Boolean(row.inline),
      };
    }),
  };
}

function Card({ title, icon, children, aside }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className="cc-card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{ color: 'var(--cc-accent)', display: 'grid', placeItems: 'center' }}>{icon}</span>
        <h2 className="cc-card-title" style={{ flex: 1 }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label className="cc-label" htmlFor={htmlFor}>{children}</label>;
}

export default function EmbedBuilderPage() {
  const { authChecked, authenticated, selected } = useGuild();

  const [load, setLoad] = useState<{ state: 'loading' | 'ready' | 'error'; error?: { code: string; message: string } }>({ state: 'loading' });
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelError, setChannelError] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState<SavedEmbed[]>([]);
  const [botInstalled, setBotInstalled] = useState<boolean | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftName, setDraftName] = useState('');
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState<'idle' | 'saving' | 'sending'>('idle');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string; messageId?: string } | null>(null);
  const [delivery, setDelivery] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!selected) return;
    setLoad({ state: 'loading' });
    setNotice(null);
    setDelivery(null);
    try {
      const resp = await fetch(`/api/dashboard/embeds?guildId=${encodeURIComponent(selected.id)}`, { cache: 'no-store' });
      const data = (await resp.json().catch(() => null)) as LoadPayload | null;
      if (!resp.ok || !data?.success) {
        setLoad({
          state: 'error',
          error: {
            code: data?.code ?? 'LOAD_FAILED',
            message: data?.error ?? `The embed builder could not be loaded (HTTP ${resp.status}).`,
          },
        });
        return;
      }
      setChannels(data.channels ?? []);
      setChannelError(data.channelError ?? null);
      setSaved(data.saved ?? []);
      setBotInstalled(data.bot?.installed ?? null);
      // Default to the first channel Murabot can actually post in — never to an
      // unusable one that would fail at send time.
      setChannelId((prev) => prev || (data.channels ?? []).find((c) => c.usable)?.id || '');
      setLoad({ state: 'ready' });
    } catch {
      setLoad({
        state: 'error',
        error: { code: 'NETWORK', message: 'Could not reach the dashboard — check your connection and retry.' },
      });
    }
  }, [selected]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const built = useMemo(() => buildEmbed(draft), [draft]);
  const validation = useMemo(() => validateEmbed(built), [built]);
  const errors: EmbedFieldError[] = validation.ok ? [] : validation.errors;
  const preview = validation.ok ? validation.embed : null;
  const total = preview ? embedTotalChars(preview) : 0;

  const usableChannels = channels.filter((c) => c.usable);
  const selectedChannel = channels.find((c) => c.id === channelId) ?? null;

  function patch(update: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...update }));
    setNotice(null);
  }

  function setField(key: string, update: Partial<FieldDraft>) {
    setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, ...update } : f)) }));
  }

  // ── Drafts ──
  async function saveDraft() {
    if (!selected || !validation.ok) return;
    setBusy('saving');
    setNotice(null);
    try {
      const resp = await fetch('/api/dashboard/embeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selected.id, id: loadedDraftId, name: draftName || preview?.title || 'Untitled embed', embed: built }),
      });
      const data = (await resp.json().catch(() => null)) as
        { success?: boolean; draft?: SavedEmbed; saved_embeds?: SavedEmbed[]; message?: string; error?: string; errors?: EmbedFieldError[] } | null;
      if (!resp.ok || !data?.success) {
        setNotice({
          kind: 'err',
          text: data?.message ?? data?.error ?? (Array.isArray(data?.errors) ? data.errors[0]?.message : undefined)
            ?? `The draft could not be saved (HTTP ${resp.status}).`,
        });
        return;
      }
      setSaved(data.saved_embeds ?? []);
      setLoadedDraftId(data.draft?.id ?? null);
      setNotice({ kind: 'ok', text: `✓ Draft saved as “${data.draft?.name}”. It is stored for this server only.` });
    } catch {
      setNotice({ kind: 'err', text: 'The save request did not complete — nothing was saved.' });
    } finally {
      setBusy('idle');
    }
  }

  async function deleteDraft(id: string) {
    if (!selected) return;
    setNotice(null);
    try {
      const resp = await fetch(`/api/dashboard/embeds?guildId=${encodeURIComponent(selected.id)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = (await resp.json().catch(() => null)) as { success?: boolean; saved?: SavedEmbed[]; error?: string } | null;
      if (!resp.ok || !data?.success) {
        setNotice({ kind: 'err', text: data?.error ?? `The draft could not be removed (HTTP ${resp.status}).` });
        return;
      }
      setSaved(data.saved ?? []);
      if (loadedDraftId === id) setLoadedDraftId(null);
      setNotice({ kind: 'ok', text: 'Draft removed.' });
    } catch {
      setNotice({ kind: 'err', text: 'The delete request did not complete — nothing was changed.' });
    }
  }

  // ── Send ──
  async function send() {
    if (!selected || !validation.ok) return;
    setBusy('sending');
    setNotice(null);
    setDelivery(null);
    try {
      const resp = await fetch('/api/dashboard/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selected.id, channelId, content, embeds: [built] }),
      });
      const data = (await resp.json().catch(() => null)) as
        { success?: boolean; message?: string; error?: string; messageId?: string; code?: string; retryAfterMs?: number; discordMessage?: string } | null;
      if (!resp.ok || !data?.success) {
        setNotice({
          kind: 'err',
          text: `${data?.code ? `[${data.code}] ` : ''}${data?.message ?? data?.error ?? `Send failed (HTTP ${resp.status}).`}`
            + (data?.discordMessage ? ` Discord said: “${data.discordMessage}”.` : ''),
        });
        return;
      }
      setNotice({ kind: 'ok', text: `${data.message ?? 'Sent to Discord.'}`, messageId: data.messageId });
    } catch {
      setNotice({
        kind: 'err',
        text: 'The send request did not complete. We cannot confirm whether the message was posted — check the channel before sending again.',
      });
    } finally {
      setBusy('idle');
    }
  }

  async function confirmDelivery(messageId: string) {
    if (!selected) return;
    setDelivery('Checking Discord…');
    try {
      const resp = await fetch(
        `/api/dashboard/messages?guildId=${encodeURIComponent(selected.id)}&channelId=${encodeURIComponent(channelId)}&messageId=${encodeURIComponent(messageId)}`,
        { cache: 'no-store' },
      );
      const data = (await resp.json().catch(() => null)) as { message?: string } | null;
      setDelivery(data?.message ?? 'Discord did not answer, so delivery could not be confirmed.');
    } catch {
      setDelivery('Discord did not answer, so delivery could not be confirmed.');
    }
  }

  if (!authChecked) return <p style={{ fontSize: 13, color: 'var(--cc-text-dim)' }}>Checking your session…</p>;
  if (!authenticated || !selected) return null;

  // ── Preview panel (Discord's own layout: colour rail, author, title, body,
  //    fields, image, footer) ──
  const embedPreview = (
    <div style={{
      borderLeft: `4px solid ${draft.color === 0 ? 'var(--cc-border-strong)' : hex(draft.color)}`,
      background: 'var(--cc-panel-solid)', borderRadius: 'var(--mg-radius-md)', padding: '12px 14px',
    }}>
      {preview?.author && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {preview.author.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.author.icon_url} alt="" width={20} height={20} style={{ borderRadius: 10 }} />
          ) : null}
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{preview.author.name}</span>
        </div>
      )}
      {preview?.title && (
        <div style={{ color: 'var(--cc-accent)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {preview.title}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {preview?.description && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--cc-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {preview.description}
            </p>
          )}
          {preview?.fields?.map((f, i) => (
            <div key={`${f.name}-${i}`} style={{ display: 'inline-block', verticalAlign: 'top', minWidth: f.inline ? 120 : 220, maxWidth: '100%', marginRight: 12, marginBottom: 8 }}>
              <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>{f.name}</div>
              <div style={{ color: 'var(--cc-text-dim)', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.value}</div>
            </div>
          ))}
        </div>
        {preview?.thumbnail?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.thumbnail.url} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover' }} />
        )}
      </div>
      {preview?.image?.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.image.url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginTop: 6 }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--cc-text-faint)' }}>
        {preview?.footer?.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.footer.icon_url} alt="" width={14} height={14} style={{ borderRadius: 7 }} />
        ) : null}
        {preview?.footer?.text && <span>{preview.footer.text}</span>}
        {preview?.timestamp && <span>{new Date(preview.timestamp).toLocaleString()}</span>}
      </div>
      {preview && isEmptyEmbed(preview) && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Empty embed — add a title, description or field.</p>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={20} /> Embed Builder
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          Compose a Discord embed for <strong style={{ color: '#fff' }}>{selected.name}</strong>, preview it as
          Discord will render it, save it as a draft, and send it to one of the channels Murabot can post in.
        </p>
      </header>

      {load.state === 'loading' && <p style={{ fontSize: 13, color: 'var(--cc-text-faint)' }}>Loading channels from Murabot…</p>}

      {load.state === 'error' && load.error && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ fontSize: 12.5 }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} /> {load.error.code}
          </div>
          <p style={{ margin: '6px 0 10px' }}>{load.error.message}</p>
          <button className="cc-btn" style={{ fontSize: 12.5 }} onClick={() => void fetchAll()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {load.state === 'ready' && (
        <>
          {botInstalled === false && (
            <div className="cc-alert cc-alert-warning" style={{ fontSize: 12.5 }}>
              <strong>Murabot is not installed on this server.</strong> You can still compose and save a draft,
              but it cannot be sent until the bot joins.
              {selected.inviteUrl && (
                <>
                  {' '}
                  <a href={selected.inviteUrl} target="_blank" rel="noreferrer" className="cc-link">
                    <ExternalLink size={12} /> Invite Murabot
                  </a>
                </>
              )}
            </div>
          )}

          {channelError && (
            <div className="cc-alert cc-alert-warning" style={{ fontSize: 12.5 }}>
              <strong>The channel list is unavailable ({channelError.code}).</strong> {channelError.message}
            </div>
          )}

          {!channelError && channels.length === 0 && (
            <div className="cc-alert cc-alert-warning" style={{ fontSize: 12.5 }}>
              Murabot can see no text channel on this server. Move it into a channel it can read, or check its role permissions.
            </div>
          )}

          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'start' }}>
            {/* ── Editor ── */}
            <Card title="Embed content" icon={<Type size={15} />}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <Label htmlFor="eb-title">Title ({draft.title.length}/{EMBED_LIMITS.TITLE})</Label>
                  <input id="eb-title" className="cc-input" value={draft.title} maxLength={EMBED_LIMITS.TITLE}
                    onChange={(e) => patch({ title: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div>
                  <Label htmlFor="eb-desc">Description ({draft.description.length}/{EMBED_LIMITS.DESCRIPTION})</Label>
                  <textarea id="eb-desc" className="cc-input" rows={4} value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                </div>
                <div>
                  <Label htmlFor="eb-url">Title URL</Label>
                  <input id="eb-url" className="cc-input" value={draft.url} placeholder="https://…"
                    onChange={(e) => patch({ url: e.target.value })} style={{ width: '100%' }} />
                </div>

                <div>
                  <Label htmlFor="eb-color">Color</Label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {swatches.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        title={s.label}
                        aria-label={s.label}
                        onClick={() => patch({ color: s.value })}
                        style={{
                          width: 26, height: 26, borderRadius: 'var(--mg-radius-sm)',
                          border: draft.color === s.value ? '2px solid #fff' : '1px solid var(--cc-border)',
                          background: s.value === 0 ? 'var(--cc-panel-solid)' : hex(s.value),
                          cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--cc-text-faint)', fontSize: 10,
                        }}
                      >
                        {s.value === 0 ? '—' : ''}
                      </button>
                    ))}
                    <input
                      className="cc-input"
                      id="eb-color"
                      aria-label="Custom color"
                      value={draft.color === 0 ? '' : hex(draft.color)}
                      placeholder="Default"
                      onChange={(e) => {
                        const raw = e.target.value.trim().replace(/^#/, '');
                        if (!raw) { patch({ color: 0 }); return; }
                        const n = Number.parseInt(raw, 16);
                        if (Number.isFinite(n) && n >= 0 && n <= 0xffffff) patch({ color: n });
                      }}
                      style={{ width: 110 }}
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                      {draft.color === 0 ? 'Murabot\'s default color' : hex(draft.color)}
                    </span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="eb-footer">Footer text ({draft.footerText.length}/{EMBED_LIMITS.FOOTER_TEXT})</Label>
                  <input id="eb-footer" className="cc-input" value={draft.footerText} maxLength={EMBED_LIMITS.FOOTER_TEXT}
                    onChange={(e) => patch({ footerText: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div>
                  <Label htmlFor="eb-footer-icon">Footer icon URL</Label>
                  <input id="eb-footer-icon" className="cc-input" value={draft.footerIcon} placeholder="https://…"
                    onChange={(e) => patch({ footerIcon: e.target.value })} style={{ width: '100%' }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                  <input type="checkbox" checked={draft.useTimestamp}
                    onChange={(e) => patch({ useTimestamp: e.target.checked })} />
                  <Clock size={13} /> Add a timestamp (set when the message is sent)
                </label>

                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div>
                    <Label htmlFor="eb-author">Author name</Label>
                    <input id="eb-author" className="cc-input" value={draft.authorName} maxLength={EMBED_LIMITS.AUTHOR_NAME}
                      onChange={(e) => patch({ authorName: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <Label htmlFor="eb-author-icon">Author icon URL</Label>
                    <input id="eb-author-icon" className="cc-input" value={draft.authorIcon} placeholder="https://…"
                      onChange={(e) => patch({ authorIcon: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <Label htmlFor="eb-image">Image URL</Label>
                    <input id="eb-image" className="cc-input" value={draft.image} placeholder="https://…"
                      onChange={(e) => patch({ image: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <Label htmlFor="eb-thumb">Thumbnail URL</Label>
                    <input id="eb-thumb" className="cc-input" value={draft.thumbnail} placeholder="https://…"
                      onChange={(e) => patch({ thumbnail: e.target.value })} style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Fields */}
                <div style={{ borderTop: '1px solid var(--cc-border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="cc-section-label" style={{ flex: 1 }}>
                      Fields ({draft.fields.length}/{EMBED_LIMITS.FIELDS})
                    </span>
                    <button
                      className="cc-btn"
                      style={{ fontSize: 12.5 }}
                      disabled={draft.fields.length >= EMBED_LIMITS.FIELDS}
                      onClick={() => patch({
                        fields: [...draft.fields, { key: `f${Date.now()}`, name: '', value: '', inline: false }],
                      })}
                    >
                      <Plus size={13} /> Add field
                    </button>
                  </div>
                  {draft.fields.length === 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--cc-text-faint)' }}>
                      No fields yet. Fields are useful for short label/value pairs (rules, rewards, links).
                    </p>
                  )}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {draft.fields.map((f, index) => (
                      <div key={f.key} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) auto', alignItems: 'start' }}>
                        <input
                          className="cc-input" value={f.name} maxLength={EMBED_LIMITS.FIELD_NAME}
                          placeholder={`Field ${index + 1} name`}
                          onChange={(e) => setField(f.key, { name: e.target.value })} />
                        <input
                          className="cc-input" value={f.value} maxLength={EMBED_LIMITS.FIELD_VALUE}
                          placeholder="Value"
                          onChange={(e) => setField(f.key, { value: e.target.value })} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="cc-icon-btn"
                            title="Toggle inline"
                            aria-pressed={f.inline}
                            style={f.inline ? { borderColor: 'var(--cc-accent-border)', color: 'var(--cc-accent)' } : undefined}
                            onClick={() => setField(f.key, { inline: !f.inline })}
                          >
                            <Hash size={14} />
                          </button>
                          <button
                            type="button"
                            className="cc-icon-btn"
                            title="Remove field"
                            onClick={() => patch({ fields: draft.fields.filter((x) => x.key !== f.key) })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <span style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--cc-text-faint)' }}>
                          name {f.name.length}/{EMBED_LIMITS.FIELD_NAME} · value {f.value.length}/{EMBED_LIMITS.FIELD_VALUE}
                          {f.inline ? ' · inline' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Preview + validation ── */}
            <Card
              title="Preview"
              icon={<ImageIcon size={15} />}
              aside={<span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{total}/{EMBED_LIMITS.TOTAL} characters</span>}
            >
              {embedPreview}
              {errors.length > 0 && (
                <div className="cc-alert cc-alert-error" style={{ marginTop: 12, fontSize: 12.5 }} role="alert">
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} /> {errors.length} problem{errors.length === 1 ? '' : 's'} to fix before sending
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {errors.map((e) => (
                      <li key={`${e.field}-${e.code}`}><strong>{e.label}:</strong> {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.ok && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cc-ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={13} /> Within Discord&apos;s limits — ready to save or send.
                </p>
              )}
            </Card>

            {/* ── Drafts ── */}
            <Card title="Saved drafts" icon={<Save size={15} />}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <Label htmlFor="eb-name">Draft name</Label>
                  <input id="eb-name" className="cc-input" value={draftName} placeholder="e.g. Rules panel"
                    onChange={(e) => setDraftName(e.target.value)} style={{ width: '100%' }} />
                </div>
                <button className="cc-btn cc-btn-primary" disabled={busy !== 'idle' || !validation.ok} onClick={() => void saveDraft()}>
                  <Save size={14} /> {busy === 'saving' ? 'Saving…' : loadedDraftId ? 'Update draft' : 'Save draft'}
                </button>
                <button className="cc-btn" onClick={() => { setDraft(EMPTY_DRAFT); setDraftName(''); setLoadedDraftId(null); setNotice(null); }}>
                  Clear editor
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                {saved.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
                    No saved drafts for this server yet. Drafts are per server and are not sent to Discord until you send them.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {saved.map((d) => (
                      <div key={d.id} className="cc-card" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.name}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)' }}>
                            {typeof d.embed.title === 'string' && d.embed.title ? `“${d.embed.title}” · ` : ''}
                            updated {new Date(d.updatedAt).toLocaleString()}
                          </span>
                        </span>
                        <button className="cc-btn" style={{ fontSize: 12.5 }}
                          onClick={() => { setDraft(draftFromEmbed(d.embed)); setDraftName(d.name); setLoadedDraftId(d.id); setNotice(null); }}>
                          Load
                        </button>
                        <button className="cc-btn cc-btn-danger" style={{ fontSize: 12.5 }} onClick={() => void deleteDraft(d.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* ── Send ── */}
            <Card title="Send to Discord" icon={<Send size={15} />}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <Label htmlFor="eb-channel">Channel</Label>
                  <select id="eb-channel" className="cc-select" value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ width: '100%', maxWidth: 420 }}>
                    <option value="">Choose a channel…</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.usable}>
                        {c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`}
                        {c.usable ? '' : ` — Murabot lacks ${c.missing?.label ?? 'the required permission'}`}
                      </option>
                    ))}
                  </select>
                  {selectedChannel && !selectedChannel.usable && (
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-warn)' }}>
                      Murabot cannot post here: it is missing the {selectedChannel.missing?.label ?? 'required'} permission.
                      Fix the channel overwrites in Discord, then reload this page.
                    </p>
                  )}
                  {usableChannels.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                      {usableChannels.length} of {channels.length} channels Murabot can post an embed in.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="eb-content">Message text (optional, shown above the embed)</Label>
                  <input id="eb-content" className="cc-input" value={content} maxLength={EMBED_LIMITS.CONTENT}
                    placeholder="e.g. Read the rules before posting"
                    onChange={(e) => setContent(e.target.value)} style={{ width: '100%' }} />
                </div>

                {notice && (
                  <div
                    className={notice.kind === 'ok' ? 'cc-alert cc-alert-success' : notice.kind === 'warn' ? 'cc-alert cc-alert-warning' : 'cc-alert cc-alert-error'}
                    role={notice.kind === 'ok' ? 'status' : 'alert'}
                    style={{ fontSize: 12.5 }}
                  >
                    {notice.text}
                    {notice.messageId && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <code style={{ fontSize: 11.5 }}>{notice.messageId}</code>
                        <button className="cc-btn" style={{ fontSize: 12 }} onClick={() => void confirmDelivery(notice.messageId!)}>
                          Confirm delivery
                        </button>
                        {delivery && <span style={{ fontSize: 11.5 }}>{delivery}</span>}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="cc-btn cc-btn-primary"
                    disabled={busy !== 'idle' || !validation.ok || !channelId || !usableChannels.some((c) => c.id === channelId)}
                    onClick={() => void send()}
                  >
                    <Send size={14} /> {busy === 'sending' ? 'Sending…' : 'Send embed'}
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                    The real Discord answer is reported here — a refused send says why and nothing is claimed as sent.
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
