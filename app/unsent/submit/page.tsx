'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Check, Lock, Mail, TriangleAlert } from 'lucide-react';
const categories = ['Love', 'Friendship', 'Appreciation', 'Regret', 'Memories', 'Moving On', 'Other'];

export default function SubmitLetter() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Other');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setUser(JSON.parse(userStr));
  }, [router]);

  const handleSubmit = async () => {
    if (!user || !recipientName.trim() || !content.trim()) {
      setError('Please fill in the recipient name and your letter.');
      return;
    }
    if (content.trim().length < 10) {
      setError('Your letter must be at least 10 characters.');
      return;
    }

    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/unsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorEmail: user.email,
          authorName: user.name,
          recipientName: recipientName.trim(),
          content: content.trim(),
          category,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Failed to submit.');
      }
    } catch {
      setError('Failed to submit.');
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  if (sent) {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Letter Submitted" />
        <section className="px-4 py-16 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '40rem' }}>
            <div className="text-center space-y-6">
              <div className="text-6xl"><Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
              <h1 className="text-2xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                Letter Submitted
              </h1>
              <p className="text-sm text-[var(--pewter)] max-w-md mx-auto">
                Your unsent letter for <strong className="text-[var(--gold)]">{recipientName}</strong> has been added to the archive. It will remain anonymous — only you can see that you wrote it.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/unsent/mine" className="deco-btn deco-btn-gold rounded-xl">My Submissions</Link>
                <button onClick={() => { setSent(false); setContent(''); setRecipientName(''); }} className="deco-btn rounded-xl">Submit Another</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Submit" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '40rem' }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              <Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Submit an Unsent Letter
            </h1>
            <p className="mt-3 text-sm text-[var(--pewter)]">Write something you&apos;ve been holding onto.</p>
          </div>

          {/* Privacy Notice */}
          <div className="border border-[var(--gold)] bg-[rgba(212,175,55,0.05)] rounded-2xl p-5 mb-8">
            <div className="flex items-start gap-3">
              <span className="text-lg"><Lock className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <p className="text-sm text-[var(--cream-muted)]">
                Your submission is <strong className="text-[var(--cream)]">anonymous to the public</strong>. Only you can see that you wrote it.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Recipient */}
            <div>
              <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                Who is this for?
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Enter a name..."
                className="deco-input rounded-xl"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-2 border-2 rounded-xl text-[9px] transition-all ${category === cat ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] text-[var(--cream-muted)] hover:border-[var(--gold)]'}`}
                    style={{ fontFamily: 'var(--font-arcade)' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Letter */}
            <div>
              <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                Your letter
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write what you never sent..."
                rows={10}
                maxLength={2000}
                className="deco-input rounded-xl resize-none"
              />
              <div className="flex justify-between mt-1">
                <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {content.length > 0 ? 'This will be anonymous' : ''}
                </p>
                <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {content.length}/2000
                </p>
              </div>
            </div>

            {/* Preview */}
            {content.trim().length > 10 && recipientName.trim() && (
              <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-5">
                <p className="text-[9px] text-[var(--pewter)] uppercase mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>Preview</p>
                <p className="text-[9px] text-[var(--gold)] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>To: {recipientName} · {category}</p>
                <p className="text-sm text-[var(--cream-muted)] leading-relaxed whitespace-pre-wrap mt-2">{content}</p>
                <p className="text-[8px] text-[var(--emerald-bright)] mt-3" style={{ fontFamily: 'var(--font-arcade)' }}><Check className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Your name will not be shown publicly</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)] rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                <TriangleAlert color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={sending || !recipientName.trim() || !content.trim()}
                className="deco-btn deco-btn-gold deco-btn-lg flex-1 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Submitting...' : 'Submit to the Archive'}
              </button>
              <Link href="/unsent/mine" className="deco-btn deco-btn-lg rounded-xl">
                My Submissions
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
