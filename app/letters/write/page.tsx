'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface UserOption {
  name: string;
  email: string;
}

const categories = ['Appreciation', 'Confession', 'Thank You', 'Compliment', 'Advice', 'Random'];
const categoryIcons: Record<string, string> = {
  Appreciation: '💛',
  Confession: '💌',
  'Thank You': '🙏',
  Compliment: '✨',
  Advice: '💡',
  Random: '🎲',
};

export default function WriteLetterPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserOption | null>(null);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Random');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const u = JSON.parse(userStr);
    setUser(u);

    // Fetch all users for recipient selection
    async function fetchUsers() {
      try {
        const res = await fetch('/api/letters?type=users');
        const result = await res.json();
        if (result.success) {
          setUsers(result.data.filter((u: UserOption) => u.email !== u?.email));
        }
      } catch { /* empty */ }
    }
    fetchUsers();
  }, [router]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [search, users]);

  const handleSend = async () => {
    if (!user || !selectedRecipient || !content.trim()) {
      setError('Please select a recipient and write your letter.');
      return;
    }
    if (content.trim().length < 5) {
      setError('Your letter must be at least 5 characters long.');
      return;
    }

    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: user.email,
          senderName: user.name,
          recipientEmail: selectedRecipient.email,
          recipientName: selectedRecipient.name,
          content: content.trim(),
          category,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Failed to send letter.');
      }
    } catch {
      setError('Failed to send letter.');
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  if (sent) {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Letter Sent" />
        <section className="px-4 py-10 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '40rem' }}>
            <div className="deco-modal bounce-in rounded-2xl max-w-md mx-auto text-center" style={{ background: 'var(--charcoal)' }}>
              <div className="deco-modal-header rounded-t-2xl" style={{ background: 'linear-gradient(135deg, #1E3D2F, var(--emerald-bright))' }}>
                <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>💌 Letter Sent!</h2>
              </div>
              <div className="deco-modal-body space-y-4">
                <div className="text-5xl">✅</div>
                <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  Sent to {selectedRecipient?.name}
                </p>
                <p className="text-xs text-[var(--pewter)]">
                  Your identity is completely hidden. They will only see "Anonymous."
                </p>
                <div className="flex gap-3">
                  <button onClick={() => { setSent(false); setContent(''); setSelectedRecipient(null); setSearch(''); }} className="deco-btn deco-btn-gold flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ✉️ Write Another
                  </button>
                  <Link href="/letters/sent" className="deco-btn flex-1 rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    📬 My Letters
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Write Letter" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '40rem' }}>
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              ✉️ Write Anonymous Letter
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Send a message without revealing your identity</p>
          </div>

          {/* Privacy Notice */}
          <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.15)] rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl mt-1">🔒</span>
              <div>
                <p className="text-[10px] text-[var(--emerald-bright)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Privacy Guaranteed</p>
                <p className="text-sm text-[var(--cream-muted)]">Your identity will be <strong className="text-[var(--cream)]">completely hidden</strong> from the recipient. They will only see &quot;Anonymous&quot; as the sender.</p>
              </div>
            </div>
          </div>

          {/* You are sending as */}
          <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-5 mb-6">
            <p className="text-[9px] text-[var(--pewter)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>You are sending as</p>
            <p className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{user.name}</p>
            <p className="text-xs text-[var(--pewter)] mt-1">{user.email}</p>
            <p className="text-[8px] text-[var(--emerald-bright)] mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>✓ Only you can see this — recipient won&apos;t know</p>
          </div>

          {/* Recipient Search */}
          <div className="mb-6 relative">
            <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
              📨 To (Recipient)
            </label>
            {selectedRecipient ? (
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--cream)]">{selectedRecipient.name}</p>
                  <p className="text-xs text-[var(--pewter)]">{selectedRecipient.email}</p>
                </div>
                <button onClick={() => { setSelectedRecipient(null); setSearch(''); }} className="deco-btn deco-btn-sm deco-btn-crimson rounded-lg" style={{ minHeight: '32px', padding: '6px 12px' }}>Change</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by name or email..."
                  className="deco-input rounded-xl"
                />
                {showDropdown && filteredUsers.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl max-h-60 overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    {filteredUsers.slice(0, 15).map(u => (
                      <button
                        key={u.email}
                        onClick={() => { setSelectedRecipient(u); setShowDropdown(false); setSearch(''); }}
                        className="w-full text-left p-3 hover:bg-[var(--charcoal-light)] transition-colors border-b border-[rgba(242,240,228,0.08)] last:border-0"
                      >
                        <p className="text-sm text-[var(--cream)]">{u.name}</p>
                        <p className="text-[10px] text-[var(--pewter)]">{u.email}</p>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && search && filteredUsers.length === 0 && (
                  <div className="absolute z-30 w-full mt-1 border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-xl p-4 text-center">
                    <p className="text-xs text-[var(--pewter)]">No users found</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Category */}
          <div className="mb-6">
            <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
              🏷️ Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-2 border-2 rounded-xl text-[9px] transition-all ${category === cat ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] text-[var(--cream-muted)] hover:border-[var(--gold)]'}`}
                  style={{ fontFamily: 'var(--font-arcade)' }}
                >
                  {categoryIcons[cat]} {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Letter Content */}
          <div className="mb-6">
            <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
              ✍️ Your Letter
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your anonymous letter here..."
              rows={8}
              maxLength={2000}
              className="deco-input rounded-xl resize-none"
            />
            <div className="flex justify-between mt-1">
              <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                {content.length > 0 ? '✓ Letter preview shown to recipient as "Anonymous"' : ''}
              </p>
              <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                {content.length}/2000
              </p>
            </div>
          </div>

          {/* Preview */}
          {content.trim().length > 0 && selectedRecipient && (
            <div className="mb-6 border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-5">
              <p className="text-[9px] text-[var(--pewter)] uppercase mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>📬 Preview (how recipient will see it)</p>
              <div className="border-l-4 border-[var(--gold)] pl-4">
                <p className="text-[10px] text-[var(--gold)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {categoryIcons[category]} {category}
                </p>
                <p className="text-xs text-[var(--cream-muted)] italic mb-2">From: <strong className="text-[var(--cream)]">Anonymous</strong></p>
                <p className="text-sm text-[var(--cream)] leading-relaxed whitespace-pre-wrap">{content}</p>
                <p className="text-[9px] text-[var(--pewter)] mt-2">To: {selectedRecipient.name}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)] rounded-xl mb-6" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
              ⚠ {error}
            </div>
          )}

          {/* Send Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSend}
              disabled={sending || !selectedRecipient || !content.trim()}
              className="deco-btn deco-btn-gold deco-btn-lg flex-1 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : '🔒 Send Anonymously'}
            </button>
            <Link href="/letters/sent" className="deco-btn deco-btn-lg rounded-xl">
              📬 My Letters
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
