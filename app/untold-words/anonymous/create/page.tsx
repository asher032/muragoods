'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function OldAnonymousCreate() {
  const router = useRouter();
  useEffect(() => { router.replace('/untold-words/confession/create'); }, [router]);
  return <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Redirecting...</p></main>;
}
