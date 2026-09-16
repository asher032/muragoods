'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/tickets/center'); }, [router]);
  return null;
}
