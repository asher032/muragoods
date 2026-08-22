'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';

interface ChatMsg {
  _id: string;
  sender: string;
  senderName: string;
  senderEmail: string;
  message: string;
  isAdmin: boolean;
  read: boolean;
  orderId: string;
  createdAt: string;
}

const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeChat, setActiveChat] = useState<string>(''); // for admin: which user to chat with
  const [userList, setUserList] = useState<{ email: string; name: string; unread: number; lastMessage: string; lastTime: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load user
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const u = JSON.parse(userStr);
    setUser(u);
    setIsAdmin(adminEmails.includes(u.email));
  }, [router]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!user) return;
    try {
      if (isAdmin) {
        // Admin sees all messages
        const res = await fetch(`/api/chat?isAdmin=true&email=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) {
          setMessages(result.data);
          // Build user list for admin sidebar
          const userMap = new Map<string, { email: string; name: string; unread: number; lastMessage: string; lastTime: string }>();
          for (const msg of result.data as ChatMsg[]) {
            if (msg.isAdmin) continue; // Skip admin's own messages for the list
            const existing = userMap.get(msg.senderEmail);
            if (!existing) {
              userMap.set(msg.senderEmail, {
                email: msg.senderEmail,
                name: msg.senderName,
                unread: result.data.filter((m: ChatMsg) => m.senderEmail === msg.senderEmail && !m.isAdmin && !m.read).length,
                lastMessage: msg.message,
                lastTime: msg.createdAt,
              });
            } else {
              existing.lastMessage = msg.message;
              existing.lastTime = msg.createdAt;
            }
          }
          setUserList(Array.from(userMap.values()).sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()));
        }
      } else {
        // Regular user sees only their messages
        const res = await fetch(`/api/chat?email=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) setMessages(result.data);
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, isAdmin]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unreadIds = messages
      .filter(m => !m.read && !m.isAdmin && m.senderEmail !== user.email)
      .map(m => m._id);
    if (unreadIds.length > 0) {
      fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: unreadIds }),
      });
    }
  }, [messages, user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user.name,
          senderName: user.name,
          senderEmail: user.email,
          message: newMessage.trim(),
          recipient: isAdmin && activeChat ? activeChat : 'admin',
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessages(prev => [...prev, result.data]);
        setNewMessage('');
      }
    } catch { /* empty */ }
    setSending(false);
  };

  // Filter messages for admin's active chat
  const filteredMessages = isAdmin && activeChat
    ? messages.filter(m => m.senderEmail === activeChat || (m.isAdmin && m.senderEmail === user?.email))
    : isAdmin
      ? []
      : messages;

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Customer Support" />

      <section className="px-4 py-6 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '72rem' }}>
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              💬 Customer Support
            </h1>
            <p className="mt-2 text-sm text-[var(--gold)]">
              {isAdmin ? 'Manage conversations with customers' : 'Chat with our team about your orders or any questions'}
            </p>
          </div>

          <div className="grid gap-0 lg:grid-cols-[280px_1fr] border-2 border-[var(--gold)] rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
            {/* ─── Sidebar (Admin only) ─── */}
            {isAdmin && (
              <div className="border-r-2 border-[var(--gold)] bg-[var(--charcoal)] overflow-y-auto">
                <div className="p-4 border-b-2 border-[var(--gold)]">
                  <p className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Conversations</p>
                </div>
                {userList.length === 0 && (
                  <div className="p-6 text-center">
                    <p className="text-xs text-[var(--pewter)]">No conversations yet</p>
                  </div>
                )}
                {userList.map(u => (
                  <button
                    key={u.email}
                    onClick={() => setActiveChat(u.email)}
                    className={`w-full text-left p-4 border-b border-[rgba(242,240,228,0.08)] transition-all hover:bg-[var(--charcoal-light)] ${activeChat === u.email ? 'bg-[rgba(212,175,55,0.1)] border-l-2 border-l-[var(--gold)]' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--cream)] truncate">{u.name}</span>
                      {u.unread > 0 && (
                        <span className="bg-[var(--crimson)] text-white text-[8px] px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-arcade)' }}>{u.unread}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--pewter)] mt-1 truncate">{u.lastMessage}</p>
                    <p className="text-[8px] text-[var(--pewter)] mt-1">{new Date(u.lastTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                ))}
              </div>
            )}

            {/* ─── Chat Area ─── */}
            <div className="flex flex-col bg-[var(--obsidian)]">
              {/* Chat Header */}
              <div className="p-4 border-b-2 border-[var(--gold)] bg-[var(--charcoal)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] flex items-center justify-center text-[var(--obsidian)] text-xs" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {isAdmin && activeChat ? activeChat[0].toUpperCase() : user.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                      {isAdmin && activeChat ? userList.find(u => u.email === activeChat)?.name || activeChat : 'Muragoods Support'}
                    </p>
                    <p className="text-[8px] text-[var(--pewter)]">
                      {isAdmin && activeChat ? activeChat : 'Typically replies within minutes'}
                    </p>
                  </div>
                </div>
                <span className="text-[8px] px-2 py-1 border border-[var(--gold)] bg-[rgba(212,175,55,0.1)] rounded-lg text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {isAdmin ? 'ADMIN' : 'SUPPORT'}
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isAdmin && !activeChat && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-2xl mb-3">💬</p>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>SELECT A CONVERSATION</p>
                    <p className="text-xs text-[var(--pewter)] mt-2">Choose a customer from the sidebar to start chatting</p>
                  </div>
                )}
                {!isAdmin && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-2xl mb-3">💬</p>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>START A CONVERSATION</p>
                    <p className="text-xs text-[var(--pewter)] mt-2">Send a message below and our team will respond shortly</p>
                    <div className="mt-6 space-y-2 text-left">
                      <p className="text-[10px] text-[var(--gold)]">💡 Common topics:</p>
                      <p className="text-xs text-[var(--pewter)]">• Order status inquiries</p>
                      <p className="text-xs text-[var(--pewter)]">• Delivery questions</p>
                      <p className="text-xs text-[var(--pewter)]">• Payment issues</p>
                      <p className="text-xs text-[var(--pewter)]">• General questions</p>
                    </div>
                  </div>
                )}

                {filteredMessages.map((msg) => {
                  const isOwn = msg.senderEmail === user.email;
                  return (
                    <div key={msg._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${isOwn ? 'order-2' : ''}`}>
                        <div className={`p-3 rounded-xl border-2 ${
                          isOwn
                            ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-br-sm'
                            : 'border-[rgba(242,240,228,0.15)] bg-[var(--charcoal)] rounded-bl-sm'
                        }`}>
                          {msg.isAdmin && !isOwn && (
                            <p className="text-[8px] text-[var(--gold)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>🔧 Support Team</p>
                          )}
                          <p className="text-sm text-[var(--cream)] leading-relaxed">{msg.message}</p>
                          {msg.orderId && (
                            <p className="text-[8px] text-[var(--gold)] mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                              📦 Ref: #{msg.orderId.slice(-8).toUpperCase()}
                            </p>
                          )}
                        </div>
                        <p className={`text-[8px] text-[var(--pewter)] mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                          {isOwn && msg.read && <span className="ml-1 text-[var(--emerald-bright)]">✓✓</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t-2 border-[var(--gold)] bg-[var(--charcoal)]">
                {isAdmin && !activeChat ? (
                  <p className="text-xs text-[var(--pewter)] text-center">Select a conversation to start replying</p>
                ) : (
                  <form onSubmit={handleSend} className="flex gap-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="deco-input rounded-xl flex-1"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim() || sending}
                      className="deco-btn deco-btn-gold rounded-xl disabled:opacity-50"
                      style={{ minHeight: '48px', padding: '12px 24px' }}
                    >
                      {sending ? '...' : '📤 Send'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
