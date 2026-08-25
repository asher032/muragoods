'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

const EMOJIS = ['🍕', '🍩', '☕', '🍪', '🍣', '🎮', '⭐', '🪙', '💌', '🎵', '🍄', '🎁'];

interface Card {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function MemoryGame() {
  const router = useRouter();
  const { addCoins, coins } = useCoins();
  const [loaded, setLoaded] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [locked, setLocked] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [timer, setTimer] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const getGridSize = () => {
    if (difficulty === 'easy') return 4; // 4x4 = 16 cards (8 pairs)
    if (difficulty === 'medium') return 6; // 6x6 = 36 cards (18 pairs)
    return 8; // 8x8 = 64 cards (32 pairs)
  };

  const startGame = useCallback(() => {
    const size = getGridSize();
    const pairs = (size * size) / 2;
    const selectedEmojis = shuffleArray(EMOJIS).slice(0, pairs);
    const deck = shuffleArray([...selectedEmojis, ...selectedEmojis].map((emoji, i) => ({
      id: i, emoji, flipped: false, matched: false,
    })));
    setCards(deck);
    setFlippedIds([]);
    setMoves(0);
    setMatches(0);
    setGameOver(false);
    setPlaying(true);
    setTimer(0);
  }, [difficulty]);

  // Timer
  useEffect(() => {
    if (!playing || gameOver) return;
    const interval = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [playing, gameOver]);

  const handleFlip = useCallback((id: number) => {
    if (locked || gameOver) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched) return;
    if (flippedIds.length >= 2) return;

    const newCards = cards.map(c => c.id === id ? { ...c, flipped: true } : c);
    const newFlipped = [...flippedIds, id];

    if (newFlipped.length === 2) {
      setLocked(true);
      setMoves(m => m + 1);
      const [first, second] = newFlipped.map(fid => newCards.find(c => c.id === fid)!);

      if (first.emoji === second.emoji) {
        // Match!
        const matchedCards = newCards.map(c => c.id === first.id || c.id === second.id ? { ...c, matched: true } : c);
        setCards(matchedCards);
        setFlippedIds([]);
        setMatches(m => {
          const newMatches = m + 1;
          const totalPairs = (getGridSize() * getGridSize()) / 2;
          if (newMatches === totalPairs) {
            // Game over!
            setTimeout(() => {
              setGameOver(true);
              setPlaying(false);
              const score = Math.max(5, 50 - moves * 2 - Math.floor(timer / 10));
              addCoins(score);
              if (!bestScore || moves < bestScore) setBestScore(moves);
            }, 500);
          }
          return newMatches;
        });
        setLocked(false);
      } else {
        // No match
        setCards(newCards);
        setFlippedIds(newFlipped);
        setTimeout(() => {
          setCards(prev => prev.map(c => c.id === first.id || c.id === second.id ? { ...c, flipped: false } : c));
          setFlippedIds([]);
          setLocked(false);
        }, 800);
      }
    } else {
      setCards(newCards);
      setFlippedIds(newFlipped);
    }
  }, [cards, flippedIds, locked, gameOver, addCoins, bestScore, timer, moves]);

  const gridSize = getGridSize();
  const totalPairs = (gridSize * gridSize) / 2;

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Memory Match" />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px', opacity: loaded ? 1 : 0, transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>🧠</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Memory Match</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Match all pairs to win coins!</p>
        </div>

        {/* Difficulty */}
        {!playing && !gameOver && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
            {(['easy', 'medium', 'hard'] as const).map(d => (
              <button key={d} onClick={() => setDifficulty(d)} style={{ padding: '8px 20px', borderRadius: '10px', border: `1px solid ${difficulty === d ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.1)'}`, background: difficulty === d ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: difficulty === d ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', textTransform: 'uppercase' }}>
                {d === 'easy' ? '🟢 Easy (4×4)' : d === 'medium' ? '🟡 Medium (6×6)' : '🔴 Hard (8×8)'}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        {playing && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.3)' }}>MOVES</p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffd60a' }}>{moves}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.3)' }}>MATCHES</p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#06d6a0' }}>{matches}/{totalPairs}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.3)' }}>TIME</p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#4895ef' }}>{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</p>
            </div>
          </div>
        )}

        {/* Game Board */}
        {playing && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: '6px', maxWidth: '500px', margin: '0 auto' }}>
            {cards.map(card => (
              <div key={card.id} onClick={() => handleFlip(card.id)} style={{ aspectRatio: '1', borderRadius: '10px', cursor: 'pointer', perspective: '600px' }}>
                <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d', transition: 'transform 0.4s', transform: card.flipped || card.matched ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                  {/* Back */}
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: '10px', background: 'linear-gradient(135deg, #1e1e32, #252540)', border: '1px solid rgba(255,214,10,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px', opacity: 0.3 }}>❓</span>
                  </div>
                  {/* Front */}
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: '10px', background: card.matched ? 'rgba(6,214,160,0.15)' : 'rgba(255,214,10,0.1)', border: `1px solid ${card.matched ? 'rgba(6,214,160,0.3)' : 'rgba(255,214,10,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotateY(180deg)' }}>
                    <span style={{ fontSize: '28px' }}>{card.emoji}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div style={{ textAlign: 'center', padding: '32px', background: 'rgba(255,214,10,0.05)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffd60a', marginBottom: '8px' }}>You Win!</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{moves} moves in {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#06d6a0', marginBottom: '20px' }}>+{Math.max(5, 50 - moves * 2 - Math.floor(timer / 10))} coins earned!</p>
            {bestScore && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>Best: {bestScore} moves</p>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={startGame} style={{ padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>Play Again</button>
              <Link href="/entertainment" style={{ padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>More Games</Link>
            </div>
          </div>
        )}

        {/* Start Button */}
        {!playing && !gameOver && (
          <div style={{ textAlign: 'center' }}>
            <button onClick={startGame} style={{ padding: '14px 40px', borderRadius: '14px', border: '2px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 0 rgba(0,0,0,0.3)' }}>🧠 START GAME</button>
          </div>
        )}
      </div>
    </main>
  );
}
