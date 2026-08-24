'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

type UserData = {
  _id: string;
  name: string;
  email: string;
  userId: string;
  emailVerified: boolean;
  verificationCode: string | null;
  verificationExpires: string | null;
  passwordResetCode: string | null;
  passwordResetExpires: string | null;
  referralCode: string;
  referredBy: string | null;
  createdAt: string;
};

export default function AdminVerificationPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'verify' | 'reset' | 'referrals'>('verify');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/admin'); return; }
    setIsAdmin(true);
    fetchUsers();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch { /* empty */ }
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return '—'; }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.userId?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingVerification = filteredUsers.filter(u => !u.emailVerified && u.verificationCode);
  const pendingResets = filteredUsers.filter(u => u.passwordResetCode);
  const allReferrals = filteredUsers.filter(u => u.referralCode);

  // Auto-refresh verification codes
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Admin Verification" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-yellow)', textTransform: 'uppercase' }}>Codes & Verification</h1>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '4px' }}>View verification codes, reset codes, and referral codes</p>
          </div>
          <Link href="/admin" className="deco-btn deco-btn-sm">← Dashboard</Link>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="deco-input" placeholder="Search by name, email, or user ID..." />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {([
            { key: 'verify' as const, label: `📧 Pending Verification (${pendingVerification.length})` },
            { key: 'reset' as const, label: `🔑 Reset Codes (${pendingResets.length})` },
            { key: 'referrals' as const, label: `🔗 Referral Codes (${allReferrals.length})` },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 14px', borderRadius: '10px', fontSize: '9px', fontFamily: 'var(--font-arcade)',
              border: tab === t.key ? '2px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: tab === t.key ? 'rgba(255,214,10,0.15)' : 'var(--mario-bg-card)',
              color: tab === t.key ? 'var(--mario-yellow)' : 'var(--mario-text-muted)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {result && (
          <div className="border-2 border-[var(--emerald)] bg-[rgba(6,214,160,0.1)] p-3 mb-4 text-[9px] text-[var(--emerald)] rounded-xl" style={{ fontFamily: 'var(--font-arcade)' }}>
            ✓ {result}
          </div>
        )}

        {/* ─── Pending Verification Codes ──────────── */}
        {tab === 'verify' && (
          <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
            {pendingVerification.length === 0 ? (
              <div className="p-8 text-center">
                <p style={{ fontSize: '24px', marginBottom: '8px' }}>✅</p>
                <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>No pending verifications</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[rgba(255,255,255,0.03)]">
                    <tr>
                      {['User', 'User ID', 'Verification Code', 'Expires', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingVerification.map(user => (
                      <tr key={user._id} className="border-t border-[rgba(255,255,255,0.06)]">
                        <td className="px-4 py-3">
                          <p className="text-xs text-[var(--cream)]">{user.name}</p>
                          <p className="text-[11px] text-[var(--pewter)]">{user.email}</p>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{user.userId}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-yellow)', letterSpacing: '4px' }}>
                            {user.verificationCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--pewter)]">{formatTime(user.verificationExpires)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { navigator.clipboard.writeText(user.verificationCode || ''); setResult('Code copied!'); setTimeout(() => setResult(''), 2000); }} className="deco-btn deco-btn-sm deco-btn-gold" style={{ fontSize: '8px', padding: '4px 10px' }}>
                            Copy Code
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Password Reset Codes ─────────────────── */}
        {tab === 'reset' && (
          <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
            {pendingResets.length === 0 ? (
              <div className="p-8 text-center">
                <p style={{ fontSize: '24px', marginBottom: '8px' }}>🔑</p>
                <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>No pending password resets</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[rgba(255,255,255,0.03)]">
                    <tr>
                      {['User', 'User ID', 'Reset Code', 'Expires', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingResets.map(user => (
                      <tr key={user._id} className="border-t border-[rgba(255,255,255,0.06)]">
                        <td className="px-4 py-3">
                          <p className="text-xs text-[var(--cream)]">{user.name}</p>
                          <p className="text-[11px] text-[var(--pewter)]">{user.email}</p>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{user.userId}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-red)', letterSpacing: '4px' }}>
                            {user.passwordResetCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--pewter)]">{formatTime(user.passwordResetExpires)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { navigator.clipboard.writeText(user.passwordResetCode || ''); setResult('Reset code copied!'); setTimeout(() => setResult(''), 2000); }} className="deco-btn deco-btn-sm deco-btn-gold" style={{ fontSize: '8px', padding: '4px 10px' }}>
                            Copy Code
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Referral Codes ──────────────────────── */}
        {tab === 'referrals' && (
          <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
            {allReferrals.length === 0 ? (
              <div className="p-8 text-center">
                <p style={{ fontSize: '24px', marginBottom: '8px' }}>🔗</p>
                <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[rgba(255,255,255,0.03)]">
                    <tr>
                      {['User', 'User ID', 'My Referral Code', 'Referred By', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allReferrals.map(user => (
                      <tr key={user._id} className="border-t border-[rgba(255,255,255,0.06)]">
                        <td className="px-4 py-3">
                          <p className="text-xs text-[var(--cream)]">{user.name}</p>
                          <p className="text-[11px] text-[var(--pewter)]">{user.email}</p>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{user.userId}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-green)', letterSpacing: '1px' }}>
                            {user.referralCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-[var(--pewter)]">{user.referredBy || '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { navigator.clipboard.writeText(user.referralCode); setResult('Referral code copied!'); setTimeout(() => setResult(''), 2000); }} className="deco-btn deco-btn-sm deco-btn-gold" style={{ fontSize: '8px', padding: '4px 10px' }}>
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
