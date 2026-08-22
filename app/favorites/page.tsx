'use client';

import { NavBar } from '@/app/components/NavBar';
import { FavoritesList } from '@/app/components/Favorites';

export default function FavoritesPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Favorites" />
      <section style={{ padding: '20px 16px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ color: 'var(--mario-yellow)', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-arcade)' }}>
              ❤️ MY FAVORITES
            </h1>
            <p style={{ color: 'var(--mario-text-muted)', fontSize: '11px', marginTop: '6px' }}>
              Your saved items for quick access!
            </p>
          </div>
          <FavoritesList />
        </div>
      </section>
    </main>
  );
}
