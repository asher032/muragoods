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

export default function InboxPage() {
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
        const res = await fetch(`/api/letters?email=${encodeURIComponent(u.email)}&type=inbox`);
        const result = await res.json();
        if (result.success) setLetters(result.data);
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchLetters();
  }, [router]);

  const handleRead = async (letter: Letter) => {
    if (!letter.read) {
      try {
        await fetch('/api/letters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: letter._id }),
        });
        setLetters(prev => prev.map(l => l._id === letter._id ? { ...l, read: true } : l));
      } catch { /* empty */ }
    }
  };

  const unreadCount = letters.filter(l => !l.read).length;

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Anonymous Inbox" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <PixelDivider variant="coinChain" />

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              📬 My Inbox
            </h1>
            <p className="mt-2 text-sm text-[var(--gold)]">
              Anonymous letters sent to you
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[8px] bg-[var(--crimson)] text-white rounded-full" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {unreadCount}
                </span>
              )}
            </p>
          </div>

          {/* Privacy Notice */}
          <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.15)] rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-lg mt-1">🔒</span>
              <p className="text-xs text-[var(--cream-muted)]">
                All letters are <strong className="text-[var(--cream)]">completely anonymous</strong>. The sender&apos;s identity is never revealed to you.
              </p>
            </div>
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
              <div className="text-5xl mb-4">📭</div>
              <p className="text-sm text-[var(--cream)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>NO LETTERS YET</p>
              <p className="text-xs text-[var(--pewter)] mb-6">No one has sent you an anonymous letter yet. Share your profile so others can write to you!</p>
              <Link href="/letters/write" className="deco-btn deco-btn-gold rounded-xl">Send the First Letter</Link>
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
                    className={`border-2 bg-[var(--charcoal)] rounded-2xl overflow-hidden transition-all ${
                      !letter.read ? 'border-[var(--gold-bright)] shadow-[0_0_15px_rgba(242,201,76,0.15)]' : 'border-[rgba(242,240,228,0.12)]'
                    }`}
                  >
                    {/* Header */}
                    <button
                      onClick={() => {
                        setExpandedId(isExpanded ? null : letter._id);
                        if (!isExpanded) handleRead(letter);
                      }}
                      className="w-full text-left p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {!letter.read && (
                            <span className="w-2 h-2 bg-[var(--gold-bright)] rounded-full shrink-0" />
                          )}
                          <span className="text-lg">{categoryIcons[letter.category] || '🎲'}</span>
                          <span className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{letter.category}</span>
                        </div>
                        <p className="text-sm text-[var(--cream)]">
                          From: <strong className="text-[var(--gold-bright)]">Anonymous</strong>
                        </p>
                        <p className="text-[10px] text-[var(--pewter)] mt-1">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-[var(--gold)] text-lg shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t-2 border-[rgba(212,175,55,0.15)] p-5">
                        {/* Anonymous sender badge */}
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-10 h-10 bg-[var(--charcoal-light)] border-2 border-[rgba(242,240,228,0.15)] rounded-full flex items-center justify-center">
                            <span className="text-lg">🎭</span>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>Anonymous</p>
                            <p className="text-[8px] text-[var(--pewter)]">Identity hidden for privacy</p>
                          </div>
                        </div>

                        {/* Letter content */}
                        <div className="border-l-4 border-[var(--gold)] pl-4">
                          <p className="text-sm text-[var(--cream)] leading-relaxed whitespace-pre-wrap">{letter.content}</p>
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
              <Link href="/letters/write" className="deco-btn deco-btn-gold rounded-xl">✉️ Write a Letter</Link>
              <Link href="/letters/sent" className="deco-btn rounded-xl">📤 Sent Letters</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
