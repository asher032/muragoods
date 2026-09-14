'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { useNotifications } from '@/app/components/NotificationSystem';
import { Bot, MessageCircle } from 'lucide-react';
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

const categories = [
  { value: 'General', label: 'General Question' },
  { value: 'Order', label: 'Order Issue' },
  { value: 'Payment', label: 'Payment Problem' },
  { value: 'Delivery', label: 'Delivery Question' },
  { value: 'Refund', label: 'Refund Request' },
  { value: 'Account', label: 'Account Issue' },
  { value: 'Feedback', label: 'Feedback' },
  { value: 'Bug', label: 'Bug Report' },
];

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newMessage, setNewMessage] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef<Record<string, number>>({});
  const { addNotification } = useNotifications();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const userData = JSON.parse(userStr);
    setUser(userData);
    fetchTickets(userData.email);
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTicket?.messages]);

  // Poll for new messages every 8 seconds + notify on new admin messages
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/support?userId=${encodeURIComponent(user.email || '')}`);
        const result = await res.json();
        if (result.success) {
          const updatedTickets = result.data;
          setTickets(updatedTickets);

          // Check each ticket for new messages from admin
          updatedTickets.forEach((ticket: Ticket) => {
            const prevCount = prevMsgCountRef.current[ticket._id] || 0;
            const newMsgs = ticket.messages.filter(m => m.sender !== 'user');
            if (newMsgs.length > prevCount && prevCount > 0) {
              const lastAdminMsg = newMsgs[newMsgs.length - 1];
              addNotification(
                'support',
                `Reply: ${ticket.subject}`,
                lastAdminMsg.text.slice(0, 120),
                `/support`
              );
            }
            prevMsgCountRef.current[ticket._id] = newMsgs.length;
          });

          // Update active ticket if viewing one
          if (activeTicket) {
            const updated = updatedTickets.find((t: Ticket) => t._id === activeTicket._id);
            if (updated) setActiveTicket(updated);
          }
        }
      } catch { /* empty */ }
    }, 8000);
    return () => clearInterval(interval);
  }, [user, activeTicket?._id, addNotification]);

  const fetchTickets = async (email: string) => {
    try {
      const res = await fetch(`/api/support?userId=${encodeURIComponent(email)}`);
      const result = await res.json();
      if (result.success) setTickets(result.data);
    } catch { /* empty */ }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          userId: user.email,
          userName: user.name || 'User',
          subject: newSubject || 'Support Request',
          category: newCategory,
          text: newMessage,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActiveTicket(result.data);
        setTickets(prev => [result.data, ...prev]);
        setView('chat');
        setNewSubject('');
        setNewMessage('');
      }
    } catch { /* empty */ } finally { setLoading(false); }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !activeTicket || !user) return;
    const msg = chatMessage;
    setChatMessage('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          ticketId: activeTicket._id,
          userId: user.email,
          senderName: user.name || 'User',
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

  const handleCloseTicket = async (ticketId: string) => {
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', ticketId }),
      });
      const result = await res.json();
      if (result.success) {
        setActiveTicket(result.data);
        setTickets(prev => prev.map(t => t._id === result.data._id ? result.data : t));
      }
    } catch { /* empty */ }
  };

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  };

  if (!user) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Support" />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-yellow)', textTransform: 'uppercase' }}>Customer Support</h1>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '4px' }}>Get help with orders, payments, and more</p>
          </div>
          {view !== 'new' && (
            <button onClick={() => setView('new')} className="deco-btn deco-btn-gold deco-btn-sm">
              + New Ticket
            </button>
          )}
        </div>

        {/* ─── New Ticket Form ──────────────────────── */}
        {view === 'new' && (
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl">
            <h2 className="text-sm text-[var(--cream)] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>NEW SUPPORT TICKET</h2>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <label className="block">
                <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Category</span>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="deco-select" style={{ cursor: 'pointer' }}>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Subject</span>
                <input type="text" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} className="deco-input" placeholder="Brief description of your issue" />
              </label>
              <label className="block">
                <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Message *</span>
                <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="deco-input" placeholder="Describe your issue in detail..." rows={4} style={{ resize: 'vertical' }} />
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setView('list')} className="deco-btn" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={loading || !newMessage.trim()} className="deco-btn deco-btn-gold" style={{ flex: 1 }}>
                  {loading ? 'SENDING...' : 'SUBMIT'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── Ticket List ──────────────────────────── */}
        {view === 'list' && (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] p-8 rounded-2xl text-center">
                <p style={{ fontSize: '32px', marginBottom: '12px' }}><MessageCircle className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'var(--mario-text)' }}>No support tickets yet</p>
                <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>Need help? Create a new ticket!</p>
              </div>
            ) : (
              tickets.map(ticket => (
                <div
                  key={ticket._id}
                  onClick={() => { setActiveTicket(ticket); setView('chat'); }}
                  className="power-card p-4"
                  style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,214,10,0.3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-text)' }}>{ticket.subject}</p>
                    <span style={{
                      fontSize: '8px', padding: '3px 8px', borderRadius: '20px', fontFamily: 'var(--font-arcade)',
                      background: ticket.status === 'open' ? 'rgba(255,214,10,0.15)' : ticket.status === 'replied' ? 'rgba(6,214,160,0.15)' : 'rgba(255,255,255,0.08)',
                      color: ticket.status === 'open' ? '#ffd60a' : ticket.status === 'replied' ? '#06d6a0' : '#9090a8',
                    }}>
                      {ticket.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>{ticket.messages[ticket.messages.length - 1]?.text.slice(0, 80)}...</p>
                  <p style={{ fontSize: '9px', color: 'var(--pewter)', marginTop: '6px' }}>{formatTime(ticket.lastActivity)} · {ticket.messages.length} messages</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── Chat View ────────────────────────────── */}
        {view === 'chat' && activeTicket && (
          <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] rounded-2xl overflow-hidden" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
            {/* Chat Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,214,10,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: 'var(--mario-yellow)', cursor: 'pointer', fontSize: '14px' }}>←</button>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-text)' }}>{activeTicket.subject}</p>
                </div>
                <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)', marginTop: '2px', marginLeft: '22px' }}>{activeTicket.category} · {formatTime(activeTicket.createdAt)}</p>
              </div>
              {activeTicket.status !== 'closed' && (
                <button onClick={() => handleCloseTicket(activeTicket._id)} className="deco-btn deco-btn-sm" style={{ fontSize: '8px', padding: '4px 10px' }}>
                  Close
                </button>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeTicket.messages.map((msg, i) => (
                <div key={i} style={{
                  maxWidth: '80%',
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  {msg.isAutoReply && (
                    <div style={{ fontSize: '8px', color: 'var(--mario-blue)', marginBottom: '3px', fontFamily: 'var(--font-arcade)' }}><Bot className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Auto-Reply</div>
                  )}
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: msg.sender === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.sender === 'user' ? 'rgba(255,214,10,0.12)' : msg.isAutoReply ? 'rgba(72,149,239,0.1)' : 'rgba(255,255,255,0.06)',
                    border: msg.sender === 'user' ? '1px solid rgba(255,214,10,0.2)' : msg.isAutoReply ? '1px solid rgba(72,149,239,0.15)' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <p style={{ fontSize: '8px', color: 'var(--mario-text-muted)', marginBottom: '4px', fontFamily: 'var(--font-arcade)' }}>
                      {msg.sender === 'user' ? '' : ''}{msg.senderName}
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
              <form onSubmit={handleSendMessage} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type your message..."
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
    </main>
  );
}
