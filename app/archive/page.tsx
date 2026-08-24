'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

export default function OpenArchivePage() {
  const router = useRouter();

  return (
    <main className="mario-bg min-h-screen">
      <NavBar pageLabel="Open Archive" />
      <section className="px-4 py-16 sm:px-8">
        <div className="mario-container max-w-3xl mx-auto text-center">
          <div className="mario-card border-mario-pink p-8 sm:p-12">
            <span className="text-5xl mb-4 block">💌</span>
            <h1 className="mario-title text-3xl sm:text-4xl text-mario-pink mb-4">
              Open Archive
            </h1>
            <p className="mario-text-sm text-mario-brown mb-2 max-w-lg mx-auto">
              A collection of messages and letters that people write but never send.
            </p>
            <p className="mario-text-xs text-mario-brown/70 mb-8 max-w-md mx-auto">
              Search for a name to discover letters written for them. Submit your own unsent letter to the archive.
            </p>

            <div className="grid gap-4 sm:grid-cols-3 mb-8">
              <Link href="/unsent" className="mario-card border-mario-yellow p-6 hover:scale-105 transition-transform">
                <span className="text-3xl block mb-2">🔍</span>
                <p className="mario-text-xs font-arcade text-mario-yellow">SEARCH</p>
                <p className="mario-text-xs text-mario-brown mt-1">Find letters by name</p>
              </Link>
              <Link href="/unsent/submit" className="mario-card border-mario-green p-6 hover:scale-105 transition-transform">
                <span className="text-3xl block mb-2">✍️</span>
                <p className="mario-text-xs font-arcade text-mario-green">SUBMIT</p>
                <p className="mario-text-xs text-mario-brown mt-1">Write an unsent letter</p>
              </Link>
              <Link href="/unsent/mine" className="mario-card border-mario-blue p-6 hover:scale-105 transition-transform">
                <span className="text-3xl block mb-2">📬</span>
                <p className="mario-text-xs font-arcade text-mario-blue">MY LETTERS</p>
                <p className="mario-text-xs text-mario-brown mt-1">View your submissions</p>
              </Link>
            </div>

            <Link href="/unsent" className="mario-btn mario-btn-primary mario-btn-lg">
              Enter the Archive →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
