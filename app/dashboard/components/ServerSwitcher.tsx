'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Server, ShieldCheck } from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';

export default function ServerSwitcher() {
  const { token, guilds, selected, setSelected } = useGuild();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // If the stored guild is no longer manageable (bot kicked, perms revoked),
  // fall back to the command center where the user can reselect.
  useEffect(() => {
    if (selected && guilds.length > 0 && !guilds.some((g) => g.id === selected.id)) {
      setSelected(null);
      router.replace('/dashboard');
    }
  }, [guilds, selected, setSelected, router]);

  const filtered = query
    ? guilds.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
    : guilds;

  if (!selected) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="cc-btn"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Server size={15} />
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.name}
        </span>
        <ChevronsUpDown size={14} style={{ color: 'var(--cc-text-faint)' }} />
      </button>

      {open && (
        <div
          role="listbox"
          className="cc-card"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 300, zIndex: 300,
            padding: 8, background: '#131319', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
        >
          <input
            className="cc-input"
            placeholder="Search servers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 6 }}
            autoFocus
          />
          {filtered.length === 0 && (
            <div style={{ padding: '14px 10px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
              No servers with Manage Server permission.
            </div>
          )}
          {filtered.map((g) => (
            <button
              key={g.id}
              role="option"
              aria-selected={g.id === selected.id}
              onClick={() => { setSelected(g); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: g.id === selected.id ? 'var(--cc-accent-soft)' : 'transparent',
                color: '#fff', fontSize: 13, textAlign: 'left',
              }}
            >
              {g.icon ? (
                // The session stores a resolved CDN URL, so use it as-is —
                // concatenating a hash onto the CDN path produced a broken icon.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.icon} alt="" width={24} height={24} style={{ borderRadius: 7 }} />
              ) : (
                <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--cc-accent-soft)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {g.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              {g.owner ? <ShieldCheck size={14} color="var(--cc-ok)" /> : null}
            </button>
          ))}
          <div style={{ padding: '8px 10px 4px', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
            One selection — every page uses this server.
          </div>
        </div>
      )}
    </div>
  );
}
