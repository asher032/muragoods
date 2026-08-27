'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { JARVIS } from '@/app/components/JARVIS';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export default function JarvisPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) { router.push('/login'); return; }
      const user = JSON.parse(userStr);
      if (!ADMIN_EMAILS.includes(user.email)) { router.push('/'); return; }
      setAllowed(true);
    } catch {
      router.push('/login');
    }
  }, [router]);

  if (!allowed) return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
        <p style={{ fontFamily: 'monospace', fontSize: '14px', color: '#00e5ff' }}>Loading J.A.R.V.I.S...</p>
      </div>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#0a0e1a' }}>
      <JARVIS open={true} onClose={() => router.push('/')} isFullPage={true} />
    </main>
  );
}
