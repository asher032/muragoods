'use client';

import { useState, useEffect, useCallback } from 'react';

interface UserData {
  name: string;
  email: string;
  userId: string;
  perks: { perkId: string; perkName: string; redeemed: boolean }[];
  joinedAt: string;
  totalSpent: number;
  orderCount: number;
  delivered: number;
}

interface UsersCoinsPanelProps {
  userName: string;
}

export function UsersCoinsPanel({ userName }: UsersCoinsPanelProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deductingEmail, setDeductingEmail] = useState<string | null>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const result = await res.json();
      if (result.success) setUsers(result.data);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleDeduct = async (email: string) => {
    const amount = parseInt(deductAmount, 10);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    if (!confirm(`Deduct ${amount} coins from ${email}?`)) return;

    const allCoins = JSON.parse(localStorage.getItem('admin_user_coins') || '{}');
    const current = allCoins[email] || 0;
    allCoins[email] = Math.max(0, current - amount);
    localStorage.setItem('admin_user_coins', JSON.stringify(allCoins));

    const allHistory = JSON.parse(localStorage.getItem('admin_all_history') || '{}');
    if (!allHistory[email]) allHistory[email] = [];
    allHistory[email].unshift({
      type: 'spend',
      amount,
      label: `Admin deduction: ${deductReason || 'No reason'}`,
      date: new Date().toISOString(),
    });
    localStorage.setItem('admin_all_history', JSON.stringify(allHistory));

    setDeductingEmail(null);
    setDeductAmount('');
    setDeductReason('');
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.userId.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return null;

  return (
    <section className="mt-8">
      <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl">
        <h2 className="text-sm text-[var(--cream)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>
          👥 Users & Coins
        </h2>

        <div className="flex gap-2 mb-4">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or ID..." className="deco-input rounded-xl flex-1" />
        </div>

        <div className="overflow-x-auto border border-[rgba(242,240,228,0.12)] rounded-xl">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--obsidian)]">
              <tr>
                {['User', 'ID', 'Orders', 'Spent', 'Perks', 'Action'].map(h => (
                  <th key={h} className="px-3 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => (
                <tr key={user.email} className={`border-t border-[rgba(242,240,228,0.08)] hover:bg-[var(--charcoal-light)] ${idx % 2 === 0 ? '' : 'bg-[rgba(212,175,55,0.02)]'}`}>
                  <td className="px-3 py-3">
                    <div className="text-xs text-[var(--cream)]">{user.name}</div>
                    <div className="text-[10px] text-[var(--pewter)]">{user.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[9px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{user.userId}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-[var(--cream-muted)]">{user.orderCount}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-[var(--gold-bright)]">₱{user.totalSpent}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.perks.slice(0, 3).map((p, i) => (
                        <span key={i} className="text-[7px] px-1.5 py-0.5 border border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold)] rounded" style={{ fontFamily: 'var(--font-arcade)' }}>
                          {p.perkId === 'gold_member' ? '👑' : p.perkName.slice(0, 10)}
                        </span>
                      ))}
                      {user.perks.length > 3 && <span className="text-[7px] text-[var(--pewter)]">+{user.perks.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setExpandedUser(expandedUser === user.email ? null : user.email)} className="deco-btn deco-btn-sm deco-btn-dark" style={{ minHeight: '28px', padding: '4px 8px', fontSize: '8px' }}>
                        {expandedUser === user.email ? 'Close' : 'View'}
                      </button>
                      <button onClick={() => { setDeductingEmail(deductingEmail === user.email ? null : user.email); setDeductAmount(''); setDeductReason(''); }} className="deco-btn deco-btn-sm deco-btn-crimson" style={{ minHeight: '28px', padding: '4px 8px', fontSize: '8px' }}>
                        Deduct
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded User Details */}
        {expandedUser && (() => {
          const user = users.find(u => u.email === expandedUser);
          if (!user) return null;
          return (
            <div className="mt-4 border-2 border-[var(--gold)] bg-[var(--charcoal-light)] rounded-xl p-5">
              <h3 className="text-[10px] text-[var(--gold)] uppercase mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>
                {user.name} — {user.email}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-3 rounded-lg text-center">
                  <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>ID</p>
                  <p className="text-[9px] text-[var(--gold)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{user.userId}</p>
                </div>
                <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-3 rounded-lg text-center">
                  <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Orders</p>
                  <p className="text-sm text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{user.orderCount}</p>
                </div>
                <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-3 rounded-lg text-center">
                  <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Total Spent</p>
                  <p className="text-sm text-[var(--gold-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>₱{user.totalSpent}</p>
                </div>
                <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-3 rounded-lg text-center">
                  <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Delivered</p>
                  <p className="text-sm text-[var(--emerald-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{user.delivered}</p>
                </div>
              </div>
              {user.perks.length > 0 && (
                <div>
                  <p className="text-[8px] text-[var(--gold)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Perks</p>
                  <div className="flex flex-wrap gap-2">
                    {user.perks.map((p, i) => (
                      <span key={i} className={`text-[8px] px-3 py-1 rounded-lg border ${p.redeemed ? 'border-[var(--pewter)] text-[var(--pewter)]' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                        {p.perkName} {p.redeemed ? '(Used)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Deduct Panel */}
        {deductingEmail && (
          <div className="mt-4 border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.05)] rounded-xl p-4">
            <p className="text-[10px] text-[var(--crimson)] uppercase mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>
              Deduct Coins from {deductingEmail}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="number" value={deductAmount} onChange={(e) => setDeductAmount(e.target.value)} placeholder="Amount" min="1" className="deco-input rounded-xl w-full sm:w-32" />
              <input type="text" value={deductReason} onChange={(e) => setDeductReason(e.target.value)} placeholder="Reason (optional)" className="deco-input rounded-xl flex-1" />
              <button onClick={() => handleDeduct(deductingEmail)} className="deco-btn deco-btn-sm deco-btn-crimson rounded-xl">Deduct</button>
              <button onClick={() => setDeductingEmail(null)} className="deco-btn deco-btn-sm rounded-xl">Cancel</button>
            </div>
          </div>
        )}

        {filteredUsers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-[var(--pewter)]">No users found</p>
          </div>
        )}
      </div>
    </section>
  );
}
