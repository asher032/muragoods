'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Gift, TriangleAlert } from 'lucide-react';

interface PromoCodeData {
  _id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  description: string;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminPromoCodesPage() {
  const router = useRouter();
  const [codes, setCodes] = useState<PromoCodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'percent' as 'percent' | 'fixed', value: 10, description: '', minOrder: 0, maxUses: -1, validUntil: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);
    const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    if (!adminEmails.includes(user.email)) { router.push('/admin'); return; }
    setUserEmail(user.email);
    fetchCodes(user.email);
  }, [router]);

  const fetchCodes = async (email: string) => {
    try {
      const res = await fetch(`/api/promo-codes?isAdmin=true&email=${encodeURIComponent(email)}`);
      const result = await res.json();
      if (result.success) setCodes(result.data);
    } catch { /* empty */ }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, createdBy: userEmail }),
      });
      const result = await res.json();
      if (result.success) {
        setCodes(prev => [result.data, ...prev]);
        setShowCreate(false);
        setForm({ code: '', type: 'percent', value: 10, description: '', minOrder: 0, maxUses: -1, validUntil: '' });
      } else {
        setError(result.error || 'Failed to create code');
      }
    } catch {
      setError('Failed to create code');
    }
    setCreating(false);
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await fetch('/api/promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { promoId: id, active: !active }, userEmail }),
      });
      setCodes(prev => prev.map(c => c._id === id ? { ...c, active: !active } : c));
    } catch { /* empty */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this promo code?')) return;
    try {
      await fetch(`/api/promo-codes?id=${id}&email=${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
      setCodes(prev => prev.filter(c => c._id !== id));
    } catch { /* empty */ }
  };

  if (loading) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Promo Codes" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '72rem' }}>
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                <Gift color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Promo Codes
              </h1>
              <p className="mt-2 text-sm text-[var(--pewter)]">Create and manage discount codes for customers</p>
            </div>
            <div className="flex gap-3">
              <Link href="/admin" className="deco-btn deco-btn-sm rounded-xl">← Dashboard</Link>
              <button onClick={() => setShowCreate(!showCreate)} className="deco-btn deco-btn-sm deco-btn-gold rounded-xl">
                + Create Code
              </button>
            </div>
          </div>

          {/* Create Form */}
          {showCreate && (
            <div className="mb-6 border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
              <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Create New Promo Code</h2>
              {error && <p className="text-[9px] text-[var(--crimson)] mb-3" style={{ fontFamily: 'var(--font-arcade)' }}><TriangleAlert color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {error}</p>}
              <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Code *</span>
                  <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SUMMER20" className="deco-input rounded-xl" required />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Type *</span>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })} className="deco-select rounded-xl">
                    <option value="percent">% Discount</option>
                    <option value="fixed">₱ Fixed Amount</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>{form.type === 'percent' ? '% Off' : '₱ Off'} *</span>
                  <input type="number" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} min={1} className="deco-input rounded-xl" required />
                </label>
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Description</span>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Summer sale discount" className="deco-input rounded-xl" />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Min Order (₱)</span>
                  <input type="number" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: Number(e.target.value) })} min={0} className="deco-input rounded-xl" />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Max Uses (-1 = unlimited)</span>
                  <input type="number" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: Number(e.target.value) })} min={-1} className="deco-input rounded-xl" />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Valid Until</span>
                  <input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} className="deco-input rounded-xl" />
                </label>
                <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
                  <button type="submit" disabled={creating} className="deco-btn deco-btn-gold rounded-xl disabled:opacity-50">
                    {creating ? 'Creating...' : 'Create Promo Code'}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="deco-btn deco-btn-dark rounded-xl">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Codes List */}
          {codes.length === 0 ? (
            <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-12 text-center">
              <p className="text-2xl mb-3"><Gift color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
              <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>NO PROMO CODES YET</p>
              <p className="text-xs text-[var(--pewter)] mt-1">Create your first promo code to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {codes.map(code => {
                const isExpired = code.validUntil && new Date(code.validUntil) < new Date();
                const isMaxed = code.maxUses > 0 && code.usedCount >= code.maxUses;
                return (
                  <div key={code._id} className={`border-2 bg-[var(--charcoal)] rounded-xl p-5 transition-all ${!code.active ? 'border-[rgba(242,240,228,0.1)] opacity-60' : 'border-[var(--gold)]'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] flex items-center justify-center">
                          <span className="text-[9px] text-[var(--obsidian)] text-center leading-tight" style={{ fontFamily: 'var(--font-arcade)' }}>{code.type === 'percent' ? `${code.value}%` : `₱${code.value}`}</span>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{code.code}</p>
                          <p className="text-[10px] text-[var(--pewter)] mt-0.5">{code.description || (code.type === 'percent' ? `${code.value}% off` : `₱${code.value} off`)}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {code.minOrder > 0 && <span className="text-[7px] px-2 py-0.5 border border-[var(--gold)] rounded text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>MIN ₱{code.minOrder}</span>}
                            {code.maxUses > 0 && <span className="text-[7px] px-2 py-0.5 border border-[var(--gold)] rounded text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{code.usedCount}/{code.maxUses} USED</span>}
                            {code.maxUses === -1 && <span className="text-[7px] px-2 py-0.5 border border-[var(--gold)] rounded text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>UNLIMITED</span>}
                            {isExpired && <span className="text-[7px] px-2 py-0.5 border border-[var(--crimson)] rounded text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>EXPIRED</span>}
                            {isMaxed && <span className="text-[7px] px-2 py-0.5 border border-[var(--crimson)] rounded text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>MAXED OUT</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleToggleActive(code._id, code.active)} className={`deco-btn deco-btn-sm rounded-lg text-[8px] ${code.active ? 'deco-btn-dark' : 'deco-btn-gold'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                          {code.active ? 'DEACTIVATE' : 'ACTIVATE'}
                        </button>
                        <button onClick={() => handleDelete(code._id)} className="deco-btn deco-btn-sm deco-btn-crimson rounded-lg text-[8px]" style={{ fontFamily: 'var(--font-arcade)' }}>
                          DELETE
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
