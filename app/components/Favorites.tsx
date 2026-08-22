'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface FavoriteItem {
  id: string;
  name: string;
  image: string;
  addedAt: string;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('muragoods_favorites');
    if (saved) {
      try { setFavorites(JSON.parse(saved)); } catch { setFavorites([]); }
    }
  }, []);

  const saveFavorites = (newFavs: FavoriteItem[]) => {
    setFavorites(newFavs);
    localStorage.setItem('muragoods_favorites', JSON.stringify(newFavs));
  };

  const addFavorite = (item: Omit<FavoriteItem, 'addedAt'>) => {
    if (favorites.some(f => f.id === item.id)) return;
    saveFavorites([...favorites, { ...item, addedAt: new Date().toISOString() }]);
  };

  const removeFavorite = (id: string) => {
    saveFavorites(favorites.filter(f => f.id !== id));
  };

  const isFavorite = (id: string) => favorites.some(f => f.id === id);

  const toggleFavorite = (item: Omit<FavoriteItem, 'addedAt'>) => {
    if (isFavorite(item.id)) {
      removeFavorite(item.id);
    } else {
      addFavorite(item);
    }
  };

  return { favorites, addFavorite, removeFavorite, isFavorite, toggleFavorite };
}

export function FavoriteButton({ item, isFav, onToggle }: {
  item: Omit<FavoriteItem, 'addedAt'>;
  isFav: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className="fav-btn"
      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFav ? '❤️' : '🤍'}
    </button>
  );
}

export function FavoritesList() {
  const { favorites, removeFavorite } = useFavorites();

  if (favorites.length === 0) {
    return (
      <div className="favorites-empty">
        <p className="text-3xl mb-3">🤍</p>
        <p style={{ color: 'var(--mario-text)', fontSize: '12px', fontWeight: 600 }}>No favorites yet</p>
        <p style={{ color: 'var(--mario-text-muted)', fontSize: '10px', marginTop: '4px' }}>
          Tap the heart on menu items to save them here!
        </p>
        <Link href="/menu" className="fav-go-menu">Browse Menu</Link>
      </div>
    );
  }

  return (
    <div className="favorites-grid">
      {favorites.map(item => (
        <div key={item.id} className="fav-card">
          <div className="fav-card-img">
            <Image src={item.image} alt={item.name} fill className="object-contain p-2" />
          </div>
          <div className="fav-card-info">
            <p style={{ color: 'var(--mario-text)', fontSize: '11px', fontWeight: 600 }}>{item.name}</p>
            <div className="fav-card-actions">
              <Link href="/menu" className="fav-add-btn">+ Add</Link>
              <button onClick={() => removeFavorite(item.id)} className="fav-remove-btn">✕</button>
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .favorites-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .fav-card {
          background: var(--mario-bg-card); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; overflow: hidden; transition: all 0.2s;
        }
        .fav-card:hover { border-color: rgba(255,214,10,0.3); transform: translateY(-2px); }
        .fav-card-img { position: relative; height: 100px; background: var(--mario-bg); }
        .fav-card-info { padding: 10px; }
        .fav-card-actions { display: flex; gap: 6px; margin-top: 6px; }
        .fav-add-btn {
          flex: 1; padding: 4px 8px; background: rgba(6,214,160,0.15); border: 1px solid rgba(6,214,160,0.3);
          border-radius: 4px; color: var(--mario-green); font-size: 9px; font-weight: 600;
          cursor: pointer; text-align: center; text-decoration: none;
        }
        .fav-remove-btn {
          padding: 4px 8px; background: rgba(230,57,70,0.1); border: 1px solid rgba(230,57,70,0.2);
          border-radius: 4px; color: var(--mario-red); font-size: 9px; font-weight: 600; cursor: pointer;
        }
        .favorites-empty {
          text-align: center; padding: 40px 20px;
          background: var(--mario-bg-card); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
        }
        .fav-go-menu {
          display: inline-block; margin-top: 12px; padding: 8px 16px;
          background: rgba(255,214,10,0.15); border: 1px solid rgba(255,214,10,0.3);
          border-radius: 6px; color: var(--mario-yellow); font-size: 10px; font-weight: 600;
          text-decoration: none; font-family: var(--font-arcade);
        }
      `}</style>
    </div>
  );
}
