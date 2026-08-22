'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';

interface Letter {
  _id: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  content: string;
  category: string;
  read: boolean;
  createdAt: string;
}

const categoryIcons: Record<string, string> = {
  Appreciation: '💛',
  Confession: '💌',
  'Thank You': '🙏',
  Compliment: '✨',
  Advice: '💡',
  Random: '🎲',
};

export default function SentLettersPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const u = JSON.parse(userStr);
    setUser(u);

    async function fetchLetters() {
      try {
        const res = await fetch(`/api/letters?email=${encodeURIComponent(u.email)}&type=sent`);
        const result = await res.json();
        if (result.success) setLetters(result.data);
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchLetters();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this letter?')) return;
    try {
      const res = await fetch(`/api/letters?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setLetters(prev => prev.filter(l => l._id !== id));
      }
    } catch { /* empty */ }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="My Sent Letters" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <PixelDivider variant="starBurst" />

          {/* Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                📬 My Sent Letters
              </h1>
              <p className="mt-2 text-sm text-[var(--gold)]">All anonymous letters you&apos;ve written</p>
            </div>
            <Link href="/letters/write" className="deco-btn deco-btn-gold rounded-xl">✉️ Write New Letter</Link>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p>
            </div>
          )}

          {/* Empty */}
          {!loading && letters.length === 0 && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-12 text-center rounded-2xl">
              <div className="text-5xl mb-4">✉️</div>
              <p className="text-sm text-[var(--cream)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>NO LETTERS YET</p>
              <p className="text-xs text-[var(--pewter)] mb-6">Send your first anonymous letter!</p>
              <Link href="/letters/write" className="deco-btn deco-btn-gold rounded-xl">Write a Letter</Link>
            </div>
          )}

          {/* Letters */}
          {!loading && letters.length > 0 && (
            <div className="space-y-4">
              {letters.map(letter => {
                const isExpanded = expandedId === letter._id;
                const date = new Date(letter.createdAt);
                return (
                  <div
                    key={letter._id}
                    className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl overflow-hidden transition-all hover:shadow-[0_0_20px_rgba(212,175,55,0.1)]"
                  >
                    {/* Header — always visible */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : letter._id)}
                      className="w-full text-left p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{categoryIcons[letter.category] || '🎲'}</span>
                          <span className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{letter.category}</span>
                        </div>
                        <p className="text-sm text-[var(--cream)]">
                          <span className="text-[var(--pewter)]">To: </span>
                          <span className="font-semibold">{letter.recipientName}</span>
                        </p>
                        <p className="text-[10px] text-[var(--pewter)] mt-1">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-[var(--gold)] text-lg shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t-2 border-[rgba(212,175,55,0.15)] p-5 space-y-4">
                        {/* You sent as */}
                        <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-4">
                          <p className="text-[8px] text-[var(--pewter)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>You sent as</p>
                          <p className="text-xs text-[var(--gold-bright)]">{letter.senderName} ({letter.senderEmail})</p>
                          <p className="text-[8px] text-[var(--emerald-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>✓ Recipient only sees "Anonymous"</p>
                        </div>

                        {/* Letter content */}
                        <div className="border-l-4 border-[var(--gold)] pl-4">
                          <p className="text-sm text-[var(--cream)] leading-relaxed whitespace-pre-wrap">{letter.content}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(letter._id); }}
                            className="deco-btn deco-btn-sm deco-btn-crimson rounded-lg"
                            style={{ minHeight: '32px', padding: '6px 12px', fontSize: '8px' }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="flex gap-3 justify-center">
              <Link href="/letters/write" className="deco-btn deco-btn-gold rounded-xl">✉️ Write Another</Link>
              <Link href="/letters/inbox" className="deco-btn rounded-xl">📬 My Inbox</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
