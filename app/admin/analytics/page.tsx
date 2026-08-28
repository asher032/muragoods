'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Icon } from '@/app/components/Icon';

interface AnalyticsData {
  summary: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    activeOrders: number;
    delivered: number;
    cancelled: number;
    uniqueCustomers?: number;
    todayRevenue?: number;
    todayOrders?: number;
  };
  dailyRevenue: { date: string; total: number; count: number }[];
  weeklyRevenue?: { week: string; total: number; count: number; avgOrder: number }[];
  popularItems: { name: string; count: number }[];
  zoneCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  paymentCounts: Record<string, number>;
}

const statusColors: Record<string, string> = {
  'Pending Payment': 'var(--gold)',
  'Payment Verified': 'var(--emerald-bright)',
  'Preparing': 'var(--gold-bright)',
  'Out for Delivery': 'var(--crimson)',
  'Delivered': 'var(--emerald-bright)',
  'Cancelled': 'var(--pewter)',
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);
    const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    if (!adminEmails.includes(user.email)) { router.push('/admin'); return; }
    setIsAdmin(true);

    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/admin/analytics');
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchAnalytics();
  }, [router]);

  if (!isAdmin || !data) return null;

  const maxDailyRevenue = Math.max(...data.dailyRevenue.map(d => d.total), 1);
  const maxItemCount = Math.max(...data.popularItems.map(i => i.count), 1);

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Analytics" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '72rem' }}>

          {/* Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                📊 Sales Analytics
              </h1>
              <p className="mt-2 text-sm text-[var(--pewter)]">Real-time sales data and insights</p>
            </div>
            <Link href="/admin" className="deco-btn deco-btn-sm rounded-xl">← Back to Dashboard</Link>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 mb-8">
                {[
                  { label: 'Total Revenue', value: `₱${data.summary.totalRevenue.toLocaleString()}`, icon: '💰', color: 'var(--gold-bright)' },
                  { label: 'Total Orders', value: String(data.summary.totalOrders), icon: <Icon name="box" size={16} />, color: 'var(--cream)' },
                  { label: 'Avg Order', value: `₱${data.summary.avgOrderValue}`, icon: '📈', color: 'var(--gold)' },
                  { label: 'Active', value: String(data.summary.activeOrders), icon: '⏳', color: 'var(--gold-bright)' },
                  { label: 'Delivered', value: String(data.summary.delivered), icon: '✅', color: 'var(--emerald-bright)' },
                  { label: 'Cancelled', value: String(data.summary.cancelled), icon: '✖', color: 'var(--crimson)' },
                ].map(card => (
                  <div key={card.label} className="power-card p-4 text-center rounded-xl">
                    {card.icon}
                    <p className="text-[8px] text-[var(--gold)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>{card.label}</p>
                    <p className="text-lg mt-1" style={{ fontFamily: 'var(--font-arcade)', color: card.color }}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Weekly Earnings Report */}
              {data.weeklyRevenue && data.weeklyRevenue.length > 0 && (
                <div className="mb-8 border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>📈 Weekly Earnings Report</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {data.weeklyRevenue.map((week, i) => (
                      <div key={i} className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-4">
                        <p className="text-[8px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{week.week}</p>
                        <p className="text-lg text-[var(--gold-bright)] mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>₱{week.total.toLocaleString()}</p>
                        <div className="mt-2 flex justify-between text-[8px]">
                          <span className="text-[var(--pewter)]">{week.count} orders</span>
                          <span className="text-[var(--pewter)]">Avg ₱{week.avgOrder}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Trend */}
                  {data.weeklyRevenue.length >= 2 && (
                    <div className="mt-4 pt-4 border-t border-[rgba(242,240,228,0.1)]">
                      {(() => {
                        const thisWeek = data.weeklyRevenue[data.weeklyRevenue.length - 1];
                        const lastWeek = data.weeklyRevenue[data.weeklyRevenue.length - 2];
                        const change = lastWeek.total > 0 ? Math.round(((thisWeek.total - lastWeek.total) / lastWeek.total) * 100) : 0;
                        return (
                          <p className="text-[9px]" style={{ fontFamily: 'var(--font-arcade)' }}>
                            <span className="text-[var(--pewter)]">vs Last Week: </span>
                            <span className={change >= 0 ? 'text-[var(--emerald-bright)]' : 'text-[var(--crimson)]'}>
                              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% {change >= 0 ? 'growth' : 'decline'}
                            </span>
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Charts Grid */}
              <div className="grid gap-6 lg:grid-cols-2">

                {/* Daily Revenue Bar Chart */}
                <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Daily Revenue (Last 7 Days)</h2>
                  <div className="flex items-end gap-2 h-48">
                    {data.dailyRevenue.map((day, i) => {
                      const height = maxDailyRevenue > 0 ? (day.total / maxDailyRevenue) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[8px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                            {day.total > 0 ? `₱${day.total}` : ''}
                          </span>
                          <div
                            className="w-full rounded-t-lg transition-all duration-500"
                            style={{
                              height: `${Math.max(height, 4)}%`,
                              background: day.total > 0 ? 'linear-gradient(180deg, var(--gold-bright), var(--gold-dark))' : 'var(--charcoal-light)',
                              border: day.total > 0 ? '1px solid var(--gold)' : '1px solid rgba(242,240,228,0.1)',
                            }}
                          />
                          <span className="text-[7px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                            {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Popular Items Bar Chart */}
                <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Popular Items</h2>
                  <div className="space-y-3">
                    {data.popularItems.map((item, i) => {
                      const width = maxItemCount > 0 ? (item.count / maxItemCount) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[9px] text-[var(--cream)] w-20 truncate text-right" style={{ fontFamily: 'var(--font-arcade)' }}>
                            {item.name}
                          </span>
                          <div className="flex-1 h-6 bg-[var(--charcoal-light)] rounded-lg overflow-hidden border border-[rgba(242,240,228,0.08)]">
                            <div
                              className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-500"
                              style={{
                                width: `${Math.max(width, 8)}%`,
                                background: 'linear-gradient(90deg, var(--gold-dark), var(--gold-bright))',
                              }}
                            >
                              <span className="text-[8px] text-[var(--obsidian)]" style={{ fontFamily: 'var(--font-arcade)' }}>{item.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {data.popularItems.length === 0 && (
                      <p className="text-center text-[var(--pewter)] text-xs py-8">No data yet</p>
                    )}
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Order Status</h2>
                  <div className="space-y-3">
                    {Object.entries(data.statusCounts).map(([status, count]) => {
                      const total = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={status}>
                          <div className="flex justify-between mb-1">
                            <span className="text-[9px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{status}</span>
                            <span className="text-[9px]" style={{ fontFamily: 'var(--font-arcade)', color: statusColors[status] || 'var(--pewter)' }}>{count} ({Math.round(pct)}%)</span>
                          </div>
                          <div className="h-3 bg-[var(--charcoal-light)] rounded-full overflow-hidden border border-[rgba(242,240,228,0.08)]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: statusColors[status] || 'var(--pewter)' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Zone + Payment */}
                <div className="space-y-6">
                  {/* Zone Distribution */}
                  <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                    <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Zones</h2>
                    <div className="space-y-3">
                      {Object.entries(data.zoneCounts).map(([zone, count]) => {
                        const total = Object.values(data.zoneCounts).reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={zone}>
                            <div className="flex justify-between mb-1">
                              <span className="text-[9px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{zone}</span>
                              <span className="text-[9px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{count} ({Math.round(pct)}%)</span>
                            </div>
                            <div className="h-3 bg-[var(--charcoal-light)] rounded-full overflow-hidden border border-[rgba(242,240,228,0.08)]">
                              <div className="h-full rounded-full bg-[var(--emerald)] transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                    <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Payment Methods</h2>
                    <div className="space-y-3">
                      {Object.entries(data.paymentCounts).map(([method, count]) => {
                        const total = Object.values(data.paymentCounts).reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={method}>
                            <div className="flex justify-between mb-1">
                              <span className="text-[9px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{method}</span>
                              <span className="text-[9px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{count} ({Math.round(pct)}%)</span>
                            </div>
                            <div className="h-3 bg-[var(--charcoal-light)] rounded-full overflow-hidden border border-[rgba(242,240,228,0.08)]">
                              <div className="h-full rounded-full bg-[var(--crimson)] transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
