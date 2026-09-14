'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Bot, Inbox } from 'lucide-react';
type Message = {
  sender: string;
  senderName: string;
  text: string;
  timestamp: string;
  isAutoReply?: boolean;
};

type Ticket = {
  _id: string;
  userId: string;
  userName: string;
  subject: string;
  category: string;
  status: 'open' | 'replied' | 'closed';
  messages: Message[];
  lastActivity: string;
  createdAt: string;
};

export default function AdminSupportPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'replied' | 'closed'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/admin'); return; }
    setIsAdmin(true);
    fetchTickets();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTicket?.messages]);

  // Poll for new tickets/messages every 5 seconds
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, activeTicket?._id]);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/support?isAdmin=true');
      const result = await res.json();
      if (result.success) {
        setTickets(result.data);
        if (activeTicket) {
          const updated = result.data.find((t: Ticket) => t._id === activeTicket._id);
          if (updated) setActiveTicket(updated);
        }
      }
    } catch { /* empty */ }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !activeTicket) return;
    const msg = chatMessage;
    setChatMessage('');
    try {
      const userStr = localStorage.getItem('user');
      const admin = userStr ? JSON.parse(userStr) : { email: 'admin' };
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          ticketId: activeTicket._id,
          userId: admin.email,
          senderName: admin.name || 'Admin',
          text: msg,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActiveTicket(result.data);
        setTickets(prev => prev.map(t => t._id === result.data._id ? result.data : t));
      }
    } catch { /* empty */ }
  };

  const filteredTickets = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const openCount = tickets.filter(t => t.status === 'open').length;

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  };

  if (!isAdmin) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Admin Support" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-yellow)', textTransform: 'uppercase' }}>Support Dashboard</h1>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '4px' }}>
              {openCount > 0 ? `${openCount} open ticket${openCount > 1 ? 's' : ''} waiting` : 'No pending tickets'}
            </p>
          </div>
          <Link href="/admin" className="deco-btn deco-btn-sm">← Admin Dashboard</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: activeTicket ? '1fr 1.5fr' : '1fr', gap: '16px' }}>
          {/* ─── Ticket List ──────────────────────────── */}
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {(['all', 'open', 'replied', 'closed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '9px', fontFamily: 'var(--font-arcade)',
                  border: filter === f ? '2px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                  background: filter === f ? 'rgba(255,214,10,0.15)' : 'transparent',
                  color: filter === f ? 'var(--mario-yellow)' : 'var(--mario-text-muted)',
                  cursor: 'pointer',
                }}>
                  {f.toUpperCase()} {f === 'open' && openCount > 0 ? `(${openCount})` : ''}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredTickets.length === 0 ? (
                <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] p-6 rounded-2xl text-center">
                  <p style={{ fontSize: '24px', marginBottom: '8px' }}><Inbox className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
                  <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>No tickets</p>
                </div>
              ) : (
                filteredTickets.map(ticket => (
                  <div
                    key={ticket._id}
                    onClick={() => setActiveTicket(ticket)}
                    className="power-card p-3"
                    style={{
                      cursor: 'pointer',
                      borderColor: activeTicket?._id === ticket._id ? 'rgba(255,214,10,0.4)' : ticket.status === 'open' ? 'rgba(255,214,10,0.2)' : 'rgba(255,255,255,0.08)',
                      background: activeTicket?._id === ticket._id ? 'rgba(255,214,10,0.06)' : 'var(--mario-bg-card)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--mario-text)' }}>{ticket.userName}</p>
                      <span style={{
                        fontSize: '7px', padding: '2px 6px', borderRadius: '10px', fontFamily: 'var(--font-arcade)',
                        background: ticket.status === 'open' ? 'rgba(255,214,10,0.15)' : ticket.status === 'replied' ? 'rgba(6,214,160,0.15)' : 'rgba(255,255,255,0.08)',
                        color: ticket.status === 'open' ? '#ffd60a' : ticket.status === 'replied' ? '#06d6a0' : '#9090a8',
                      }}>
                        {ticket.status.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--mario-text)', marginBottom: '3px' }}>{ticket.subject}</p>
                    <p style={{ fontSize: '9px', color: 'var(--pewter)' }}>{ticket.category} · {formatTime(ticket.lastActivity)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── Chat Panel ──────────────────────────── */}
          {activeTicket && (
            <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] rounded-2xl overflow-hidden" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
              {/* Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,214,10,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-text)' }}>{activeTicket.subject}</p>
                    <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)', marginTop: '2px' }}>
                      {activeTicket.userName} · {activeTicket.userId} · {activeTicket.category}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '8px', padding: '3px 8px', borderRadius: '20px', fontFamily: 'var(--font-arcade)',
                    background: activeTicket.status === 'open' ? 'rgba(255,214,10,0.15)' : 'rgba(6,214,160,0.15)',
                    color: activeTicket.status === 'open' ? '#ffd60a' : '#06d6a0',
                  }}>
                    {activeTicket.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeTicket.messages.map((msg, i) => (
                  <div key={i} style={{ maxWidth: '85%', alignSelf: msg.sender === 'admin' ? 'flex-end' : 'flex-start' }}>
                    {msg.isAutoReply && (
                      <div style={{ fontSize: '8px', color: 'var(--mario-blue)', marginBottom: '3px', fontFamily: 'var(--font-arcade)' }}><Bot className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Auto-Reply</div>
                    )}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: msg.sender === 'admin' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.sender === 'admin' ? 'rgba(6,214,160,0.12)' : 'rgba(255,255,255,0.06)',
                      border: msg.sender === 'admin' ? '1px solid rgba(6,214,160,0.2)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <p style={{ fontSize: '8px', color: 'var(--mario-text-muted)', marginBottom: '4px', fontFamily: 'var(--font-arcade)' }}>
                        {msg.sender === 'admin' ? '' : ''}{msg.senderName}
                      </p>
                      <p style={{ fontSize: '13px', color: 'var(--mario-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                      <p style={{ fontSize: '8px', color: 'var(--pewter)', marginTop: '4px', textAlign: 'right' }}>{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {activeTicket.status !== 'closed' && (
                <form onSubmit={handleSendReply} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Reply as admin..."
                    className="deco-input"
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button type="submit" disabled={!chatMessage.trim()} className="deco-btn deco-btn-gold deco-btn-sm" style={{ padding: '8px 16px' }}>
                    Send
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
