'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Bird, BookOpen, Bookmark, Camera, Check, CloudRain, Handshake, Heart, Inbox, Mail, PenLine, Trash2 } from 'lucide-react';
interface Letter {
  _id: string;
  authorEmail: string;
  authorName: string;
  recipientName: string;
  content: string;
  category: string;
  likes: number;
  bookmarks: number;
  approved: boolean;
  createdAt: string;
}

const categoryEmojis: Record<string, React.ReactNode> = {
  Love: <Heart color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, Friendship: <Handshake className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, Appreciation: <Heart color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, Regret: <CloudRain className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
  Memories: <Camera className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, 'Moving On': <Bird className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, Other: <PenLine className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
};

export default function MySubmissions() {
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
        const res = await fetch(`/api/unsent?email=${encodeURIComponent(u.email)}`);
        const result = await res.json();
        if (result.success) setLetters(result.data);
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchLetters();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this submission?')) return;
    try {
      const res = await fetch(`/api/unsent?id=${id}&email=${encodeURIComponent(user.email)}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) setLetters(prev => prev.filter(l => l._id !== id));
    } catch { /* empty */ }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="My Submissions" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          {/* Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                <Inbox className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> My Submissions
              </h1>
              <p className="mt-2 text-sm text-[var(--pewter)]">Letters you&apos;ve written — only you can see this</p>
            </div>
            <Link href="/unsent/submit" className="deco-btn deco-btn-gold rounded-xl"><Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Write New Letter</Link>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p>
            </div>
          )}

          {/* Empty */}
          {!loading && letters.length === 0 && (
            <div className="text-center py-16 border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl">
              <p className="text-4xl mb-4"><Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
              <p className="text-sm text-[var(--pewter)] mb-4" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>NO SUBMISSIONS YET</p>
              <Link href="/unsent/submit" className="deco-btn deco-btn-gold rounded-xl">Write Your First Letter</Link>
            </div>
          )}

          {/* Letters */}
          <div className="space-y-4">
            {letters.map(letter => {
              const isExpanded = expandedId === letter._id;
              return (
                <div key={letter._id} className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl overflow-hidden hover:border-[var(--gold)] transition-all">
                  {/* Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : letter._id)}
                    className="w-full text-left p-5 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{categoryEmojis[letter.category] || <PenLine className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}</span>
                        <span className="text-[9px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{letter.category}</span>
                        <span className={`text-[7px] px-2 py-0.5 rounded-lg border ${letter.approved ? 'border-[var(--emerald-bright)] text-[var(--emerald-bright)]' : 'border-[var(--gold)] text-[var(--gold)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                          {letter.approved ? 'PUBLISHED' : 'PENDING'}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--cream)]">To: <strong>{letter.recipientName}</strong></p>
                      <p className="text-[8px] text-[var(--pewter)] mt-1">{new Date(letter.createdAt).toLocaleDateString()} · {letter.likes} · <Bookmark className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {letter.bookmarks}</p>
                    </div>
                    <span className="text-[var(--gold)] text-lg shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                  </button>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="border-t border-[rgba(242,240,228,0.08)] p-5 space-y-4">
                      {/* Private info */}
                      <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-4">
                        <p className="text-[8px] text-[var(--pewter)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>You submitted as</p>
                        <p className="text-xs text-[var(--gold-bright)]">{letter.authorName} ({letter.authorEmail})</p>
                        <p className="text-[8px] text-[var(--emerald-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}><Check className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Not visible to the public</p>
                      </div>

                      {/* Letter content */}
                      <div className="border-l-4 border-[var(--gold)] pl-4">
                        <p className="text-sm text-[var(--cream)] leading-relaxed whitespace-pre-wrap">{letter.content}</p>
                      </div>

                      {/* Delete */}
                      <div className="flex justify-end">
                        <button onClick={() => handleDelete(letter._id)} className="deco-btn deco-btn-sm deco-btn-crimson rounded-lg" style={{ minHeight: '32px', padding: '6px 12px', fontSize: '8px' }}>
                          <Trash2 className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center flex gap-3 justify-center">
            <Link href="/unsent/submit" className="deco-btn deco-btn-gold rounded-xl"><Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Submit New</Link>
            <Link href="/unsent/archive" className="deco-btn rounded-xl"><BookOpen className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Browse Archive</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
