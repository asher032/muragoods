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
  coinBalance?: number;
}

interface UsersCoinsPanelProps {
  userName: string;
}

export function UsersCoinsPanel({ userName }: UsersCoinsPanelProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deductingEmail, setDeductingEmail] = useState<string | null>(null);
  const [addingEmail, setAddingEmail] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState('');
  const [addReason, setAddReason] = useState('');
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

  const handleAddPoints = async (email: string) => {
    const amount = parseInt(addAmount, 10);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    if (!confirm(`Add ${amount} coins to ${email}?`)) return;

    try {
      const res = await fetch('/api/admin/coins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'add', amount, reason: addReason || 'Admin bonus' }),
      });
      const result = await res.json();
      if (result.success) {
        alert(`Added ${amount} coins to ${email}!`);
        setAddingEmail(null);
        setAddAmount('');
        setAddReason('');
        fetchUsers();
      } else {
        alert(result.error || 'Failed to add coins');
      }
    } catch {
      alert('Failed to add coins');
    }
  };

  const handleDeduct = async (email: string) => {
    const amount = parseInt(deductAmount, 10);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    if (!confirm(`Deduct ${amount} coins from ${email}?`)) return;

    try {
      const res = await fetch('/api/admin/coins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'deduct', amount, reason: deductReason || 'Admin deduction' }),
      });
      const result = await res.json();
      if (result.success) {
        alert(`Deducted ${amount} coins from ${email}!`);
        setDeductingEmail(null);
        setDeductAmount('');
        setDeductReason('');
        fetchUsers();
      } else {
        alert(result.error || 'Failed to deduct coins');
      }
    } catch {
      alert('Failed to deduct coins');
    }
  };

  const handleDeleteUser = async (email: string, name: string) => {
    if (!confirm(`⚠️ Are you sure you want to DELETE ${name}'s account (${email})? This cannot be undone.`)) return;
    if (!confirm('This will permanently remove their account, orders, and data. Are you absolutely sure?')) return;

    try {
      const res = await fetch(`/api/admin/delete-user?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        alert(`Account for ${name} has been deleted.`);
        setExpandedUser(null);
        fetchUsers();
      } else {
        alert(result.error || 'Failed to delete user');
      }
    } catch {
      alert('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.userId.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return null;

  return (
    <section style={{ marginTop: '32px' }}>
      <div style={{
        background: 'var(--mario-bg-card)',
        border: '2px solid rgba(255,214,10,0.15)',
        borderRadius: '20px',
        padding: '24px',
      }}>
        <p style={{
          fontFamily: 'var(--font-arcade)',
          fontSize: '11px',
          color: 'var(--mario-yellow)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '16px',
        }}>👥 Users & Coins</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or ID..."
          className="mario-input"
          style={{ marginBottom: '16px', fontSize: '13px' }}
        />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['User', 'ID', 'Coins', 'Orders', 'Spent', 'Action'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '8px',
                    color: 'var(--mario-yellow)',
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => (
                <tr key={user.email} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ color: 'var(--mario-text)', fontSize: '12px' }}>{user.name}</div>
                    <div style={{ color: 'var(--mario-text-muted)', fontSize: '10px' }}>{user.email}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '8px',
                      color: 'var(--mario-yellow)',
                    }}>{user.userId || 'N/A'}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '10px',
                      color: 'var(--mario-yellow)',
                    }}>🪙 {user.coinBalance || 0}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--mario-text-muted)' }}>{user.orderCount}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--mario-yellow)' }}>₱{user.totalSpent}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setExpandedUser(expandedUser === user.email ? null : user.email)}
                        className="mario-btn mario-btn-sm"
                        style={{ fontSize: '7px', padding: '4px 8px', minHeight: '24px' }}
                      >
                        {expandedUser === user.email ? 'Close' : 'View'}
                      </button>
                      <button
                        onClick={() => { setAddingEmail(user.email); setAddAmount(''); setAddReason(''); }}
                        className="mario-btn mario-btn-sm mario-btn-primary"
                        style={{ fontSize: '7px', padding: '4px 8px', minHeight: '24px' }}
                      >
                        + Add
                      </button>
                      <button
                        onClick={() => { setDeductingEmail(user.email); setDeductAmount(''); setDeductReason(''); }}
                        className="mario-btn mario-btn-sm mario-btn-red"
                        style={{ fontSize: '7px', padding: '4px 8px', minHeight: '24px' }}
                      >
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
            <div style={{
              marginTop: '16px',
              background: 'var(--mario-bg-input)',
              border: '1px solid rgba(255,214,10,0.15)',
              borderRadius: '12px',
              padding: '16px',
            }}>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '9px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}>{user.name} — {user.email}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'ID', value: user.userId || 'N/A', color: 'var(--mario-yellow)' },
                  { label: 'Coins', value: `🪙 ${user.coinBalance || 0}`, color: 'var(--mario-yellow)' },
                  { label: 'Orders', value: String(user.orderCount), color: 'var(--mario-text)' },
                  { label: 'Spent', value: `₱${user.totalSpent}`, color: 'var(--mario-yellow)' },
                ].map(stat => (
                  <div key={stat.label} style={{
                    background: 'var(--mario-bg-card)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '10px 8px',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-text-muted)' }}>{stat.label}</p>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: stat.color, marginTop: '4px' }}>{stat.value}</p>
                  </div>
                ))}
              </div>
              {user.perks.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-yellow)', marginBottom: '6px' }}>Perks</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {user.perks.map((p, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '7px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: p.redeemed ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,214,10,0.2)',
                        background: p.redeemed ? 'rgba(255,255,255,0.03)' : 'rgba(255,214,10,0.1)',
                        color: p.redeemed ? 'var(--mario-text-muted)' : 'var(--mario-yellow)',
                      }}>
                        {p.perkName} {p.redeemed ? '(Used)' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Delete User */}
              <div style={{ borderTop: '1px solid rgba(255,57,70,0.2)', paddingTop: '12px', marginTop: '12px' }}>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-red)', marginBottom: '8px' }}>Danger Zone</p>
                <button
                  onClick={() => handleDeleteUser(user.email, user.name)}
                  className="mario-btn mario-btn-sm mario-btn-red"
                  style={{ fontSize: '8px' }}
                >
                  🗑️ Delete Account
                </button>
              </div>
            </div>
          );
        })()}

        {/* Add Points Panel */}
        {addingEmail && (
          <div style={{
            marginTop: '16px',
            background: 'rgba(6,214,160,0.05)',
            border: '1px solid rgba(6,214,160,0.2)',
            borderRadius: '12px',
            padding: '16px',
          }}>
            <p style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '9px',
              color: 'var(--mario-green)',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}>Add Coins to {addingEmail}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="number" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="Amount" min="1" className="mario-input" style={{ width: '120px', fontSize: '12px' }} />
              <input type="text" value={addReason} onChange={(e) => setAddReason(e.target.value)} placeholder="Reason (optional)" className="mario-input" style={{ flex: 1, fontSize: '12px' }} />
              <button onClick={() => handleAddPoints(addingEmail)} className="mario-btn mario-btn-sm mario-btn-primary">Add Points</button>
              <button onClick={() => setAddingEmail(null)} className="mario-btn mario-btn-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Deduct Panel */}
        {deductingEmail && (
          <div style={{
            marginTop: '16px',
            background: 'rgba(230,57,70,0.05)',
            border: '1px solid rgba(230,57,70,0.2)',
            borderRadius: '12px',
            padding: '16px',
          }}>
            <p style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '9px',
              color: 'var(--mario-red)',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}>Deduct Coins from {deductingEmail}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="number" value={deductAmount} onChange={(e) => setDeductAmount(e.target.value)} placeholder="Amount" min="1" className="mario-input" style={{ width: '120px', fontSize: '12px' }} />
              <input type="text" value={deductReason} onChange={(e) => setDeductReason(e.target.value)} placeholder="Reason (optional)" className="mario-input" style={{ flex: 1, fontSize: '12px' }} />
              <button onClick={() => handleDeduct(deductingEmail)} className="mario-btn mario-btn-sm mario-btn-red">Deduct</button>
              <button onClick={() => setDeductingEmail(null)} className="mario-btn mario-btn-sm">Cancel</button>
            </div>
          </div>
        )}

        {filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)' }}>No users found</p>
          </div>
        )}
      </div>
    </section>
  );
}
