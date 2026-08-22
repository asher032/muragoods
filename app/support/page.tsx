'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';

interface ChatMsg {
  _id: string;
  sender: string;
  senderName: string;
  senderEmail: string;
  recipient: string;
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
  const [activeChat, setActiveChat] = useState<string>('');
  const [userList, setUserList] = useState<{ email: string; name: string; unread: number; lastMessage: string; lastTime: string }[]>([]);
  const [newChatEmail, setNewChatEmail] = useState('');
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
      const isUserAdmin = adminEmails.includes(user.email);
      if (isUserAdmin) {
        const res = await fetch(`/api/chat?isAdmin=true&email=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) {
          setMessages(result.data);
          // Build user list for admin sidebar
          const userMap = new Map<string, { email: string; name: string; unread: number; lastMessage: string; lastTime: string }>();
          for (const msg of result.data as ChatMsg[]) {
            // Include both customer messages and admin messages to/from customers
            const otherEmail = msg.isAdmin ? (msg.recipient || '') : msg.senderEmail;
            if (!otherEmail || adminEmails.includes(otherEmail)) continue;
            
            const existing = userMap.get(otherEmail);
            if (!existing) {
              userMap.set(otherEmail, {
                email: otherEmail,
                name: !msg.isAdmin ? msg.senderName : otherEmail.split('@')[0],
                unread: !msg.isAdmin ? result.data.filter((m: ChatMsg) => m.senderEmail === otherEmail && !m.isAdmin && !m.read).length : 0,
                lastMessage: msg.message,
                lastTime: msg.createdAt,
              });
            } else {
              existing.lastMessage = msg.message;
              existing.lastTime = msg.createdAt;
            }
          }
          // Also check for admin messages sent to users
          for (const msg of result.data as ChatMsg[]) {
            if (msg.isAdmin && msg.recipient && !adminEmails.includes(msg.recipient)) {
              const existing = userMap.get(msg.recipient);
              if (!existing) {
                userMap.set(msg.recipient, {
                  email: msg.recipient,
                  name: msg.recipient.split('@')[0],
                  unread: 0,
                  lastMessage: msg.message,
                  lastTime: msg.createdAt,
                });
              } else {
                existing.lastMessage = msg.message;
                existing.lastTime = msg.createdAt;
              }
            }
          }
          setUserList(Array.from(userMap.values()).sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()));
        }
      } else {
        const res = await fetch(`/api/chat?email=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) setMessages(result.data);
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, fetchMessages]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!user || messages.length === 0 || !activeChat) return;
    const unreadIds = messages
      .filter(m => !m.read && !m.isAdmin && m.senderEmail === activeChat)
      .map(m => m._id);
    if (unreadIds.length > 0) {
      fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: unreadIds }),
      });
    }
  }, [messages, user, activeChat]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;
    setSending(true);

    try {
      const recipientEmail = isAdmin && activeChat ? activeChat : 'admin';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user.name,
          senderName: user.name,
          senderEmail: user.email,
          message: newMessage.trim(),
          recipient: recipientEmail,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessages(prev => [...prev, result.data]);
        setNewMessage('');
        // Refresh to update sidebar
        setTimeout(fetchMessages, 300);
      }
    } catch { /* empty */ }
    setSending(false);
  };

  const handleStartNewChat = () => {
    if (newChatEmail.trim()) {
      setActiveChat(newChatEmail.trim());
      setNewChatEmail('');
    }
  };

  // Filter messages for active chat
  const filteredMessages = isAdmin && activeChat
    ? messages.filter(m =>
        (m.senderEmail === activeChat && !m.isAdmin) ||
        (m.isAdmin && m.senderEmail === user?.email && m.recipient === activeChat)
      )
    : isAdmin
      ? []
      : messages;

  if (!user) return null;

  return (
    <main className="mario-bg min-h-screen">
      <NavBar pageLabel="Customer Support" />

      <section className="px-4 py-6 sm:px-8">
        <div className="mario-container" style={{ maxWidth: '72rem' }}>
          <div className="mb-6">
            <h1 className="mario-title text-2xl sm:text-3xl">
              💬 Customer Support
            </h1>
            <p className="mt-2 text-sm text-mario-text-muted">
              {isAdmin ? 'Manage conversations with customers' : 'Chat with our team about your orders or any questions'}
            </p>
          </div>

          <div className="mario-card overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
            <div className="grid gap-0 lg:grid-cols-[280px_1fr] h-full">
              {/* ─── Sidebar (Admin only) ─── */}
              {isAdmin && (
                <div className="border-r-2 border-white/10 bg-[#1a1a2e] overflow-y-auto">
                  <div className="p-4 border-b border-white/10">
                    <p className="mario-text-xs text-mario-yellow font-arcade mb-3">Conversations</p>
                    {/* Start new chat */}
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={newChatEmail}
                        onChange={(e) => setNewChatEmail(e.target.value)}
                        placeholder="Customer email..."
                        className="mario-input flex-1 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && handleStartNewChat()}
                      />
                      <button
                        onClick={handleStartNewChat}
                        className="mario-btn mario-btn-primary mario-btn-sm text-xs"
                        disabled={!newChatEmail.trim()}
                      >
                        ➕
                      </button>
                    </div>
                  </div>
                  {userList.length === 0 && (
                    <div className="p-6 text-center">
                      <p className="text-3xl mb-2">💬</p>
                      <p className="text-xs text-mario-text-muted">No conversations yet</p>
                      <p className="text-[10px] text-mario-text-muted mt-1">Enter a customer email above to start</p>
                    </div>
                  )}
                  {userList.map(u => (
                    <button
                      key={u.email}
                      onClick={() => setActiveChat(u.email)}
                      className={`w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 ${activeChat === u.email ? 'bg-mario-yellow/10 border-l-2 border-l-mario-yellow' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{u.name}</span>
                        {u.unread > 0 && (
                          <span className="mario-badge mario-badge-red text-[8px]">{u.unread}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-mario-text-muted mt-1 truncate">{u.lastMessage}</p>
                      <p className="text-[8px] text-mario-text-muted mt-1">{new Date(u.lastTime).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* ─── Chat Area ─── */}
              <div className="flex flex-col bg-[#0f0f1a]">
                {/* Chat Header */}
                <div className="p-4 border-b border-white/10 bg-[#1a1a2e] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-mario-yellow flex items-center justify-center text-mario-navy text-xs font-arcade">
                      {isAdmin && activeChat ? activeChat[0].toUpperCase() : user.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-white font-arcade text-[10px]">
                        {isAdmin && activeChat ? userList.find(u => u.email === activeChat)?.name || activeChat : 'Muragoods Support'}
                      </p>
                      <p className="text-[8px] text-mario-text-muted">
                        {isAdmin && activeChat ? activeChat : 'Typically replies within minutes'}
                      </p>
                    </div>
                  </div>
                  <span className="mario-badge text-[8px]">
                    {isAdmin ? '🔧 ADMIN' : '💬 SUPPORT'}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {isAdmin && !activeChat && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <p className="text-4xl mb-3">💬</p>
                      <p className="text-sm text-white font-arcade text-[10px]">SELECT A CONVERSATION</p>
                      <p className="text-xs text-mario-text-muted mt-2">Choose a customer from the sidebar or start a new chat above</p>
                    </div>
                  )}
                  {!isAdmin && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <p className="text-4xl mb-3">💬</p>
                      <p className="text-sm text-white font-arcade text-[10px]">START A CONVERSATION</p>
                      <p className="text-xs text-mario-text-muted mt-2">Send a message below and our team will respond shortly</p>
                      <div className="mt-6 space-y-2 text-left">
                        <p className="text-[10px] text-mario-yellow font-arcade">💡 Common topics:</p>
                        <p className="text-xs text-mario-text-muted">• Order status inquiries</p>
                        <p className="text-xs text-mario-text-muted">• Delivery questions</p>
                        <p className="text-xs text-mario-text-muted">• Payment issues</p>
                      </div>
                    </div>
                  )}

                  {filteredMessages.map((msg) => {
                    const isOwn = msg.senderEmail === user.email;
                    return (
                      <div key={msg._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%]">
                          <div className={`p-3 rounded-xl border-2 ${
                            isOwn
                              ? 'border-mario-yellow/30 bg-mario-yellow/10 rounded-br-sm'
                              : 'border-white/10 bg-[#1e1e32] rounded-bl-sm'
                          }`}>
                            {msg.isAdmin && !isOwn && (
                              <p className="text-[8px] text-mario-yellow font-arcade uppercase mb-1">🔧 Support Team</p>
                            )}
                            <p className="text-sm text-white leading-relaxed">{msg.message}</p>
                            {msg.orderId && (
                              <p className="text-[8px] text-mario-yellow mt-2 font-arcade">
                                📦 Ref: #{msg.orderId.slice(-8).toUpperCase()}
                              </p>
                            )}
                          </div>
                          <p className={`text-[8px] text-mario-text-muted mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                            {isOwn && msg.read && <span className="ml-1 text-mario-green">✓✓</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-white/10 bg-[#1a1a2e]">
                  {isAdmin && !activeChat ? (
                    <p className="text-xs text-mario-text-muted text-center">Select a conversation to start replying</p>
                  ) : (
                    <form onSubmit={handleSend} className="flex gap-3">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="mario-input flex-1"
                        disabled={sending}
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="mario-btn mario-btn-primary rounded-xl disabled:opacity-50"
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
        </div>
      </section>
    </main>
  );
}
