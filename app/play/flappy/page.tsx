'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

const GAME_WIDTH = 320;
const GAME_HEIGHT = 480;
const BIRD_SIZE = 24;
const PIPE_WIDTH = 50;
const PIPE_GAP = 140;
const GRAVITY = 0.5;
const JUMP_FORCE = -8;
const PIPE_SPEED = 2.5;

interface Pipe {
  x: number;
  gapY: number;
  scored: boolean;
}

export default function FlappyBird() {
  const { addCoins } = useCoins();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'over'>('menu');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);

  const birdRef = useRef({ y: GAME_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const gameLoopRef = useRef<number | null>(null);
  const gameStateRef = useRef<'menu' | 'playing' | 'over'>('menu');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, '#0a0a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f0f1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 20; i++) {
      const x = (i * 37 + 10) % GAME_WIDTH;
      const y = (i * 23 + 5) % (GAME_HEIGHT / 2);
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Pipes
    ctx.fillStyle = '#06d6a0';
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;
    pipesRef.current.forEach(pipe => {
      // Top pipe
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
      ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
      // Pipe cap top
      ctx.fillRect(pipe.x - 4, pipe.gapY - 20, PIPE_WIDTH + 8, 20);
      ctx.strokeRect(pipe.x - 4, pipe.gapY - 20, PIPE_WIDTH + 8, 20);

      // Bottom pipe
      const bottomY = pipe.gapY + PIPE_GAP;
      ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, GAME_HEIGHT - bottomY);
      ctx.strokeRect(pipe.x, bottomY, PIPE_WIDTH, GAME_HEIGHT - bottomY);
      // Pipe cap bottom
      ctx.fillRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 20);
      ctx.strokeRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 20);
    });

    // Bird
    const bird = birdRef.current;
    ctx.save();
    ctx.translate(60 + BIRD_SIZE / 2, bird.y + BIRD_SIZE / 2);
    const angle = Math.min(bird.velocity * 3, 45) * (Math.PI / 180);
    ctx.rotate(angle);

    // Bird body
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(7, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#fb8500';
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(20, 0);
    ctx.lineTo(12, 4);
    ctx.closePath();
    ctx.fill();

    // Wing
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Score
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(String(scoreRef.current), GAME_WIDTH / 2, 50);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText(String(scoreRef.current), GAME_WIDTH / 2, 50);
  }, []);

  const update = useCallback(() => {
    if (gameStateRef.current !== 'playing') return;

    const bird = birdRef.current;
    bird.velocity += GRAVITY;
    bird.y += bird.velocity;

    // Move pipes
    pipesRef.current.forEach(pipe => {
      pipe.x -= PIPE_SPEED;
      if (!pipe.scored && pipe.x + PIPE_WIDTH < 60) {
        pipe.scored = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }
    });

    // Remove off-screen pipes
    pipesRef.current = pipesRef.current.filter(p => p.x > -PIPE_WIDTH);

    // Add new pipes
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < GAME_WIDTH - 200) {
      pipesRef.current.push({
        x: GAME_WIDTH,
        gapY: 80 + Math.random() * (GAME_HEIGHT - PIPE_GAP - 160),
        scored: false,
      });
    }

    // Collision detection
    const birdLeft = 60;
    const birdRight = 60 + BIRD_SIZE;
    const birdTop = bird.y;
    const birdBottom = bird.y + BIRD_SIZE;

    // Ground/ceiling
    if (birdBottom > GAME_HEIGHT || birdTop < 0) {
      gameOverHandler();
      return;
    }

    // Pipe collision
    for (const pipe of pipesRef.current) {
      if (birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH) {
        if (birdTop < pipe.gapY || birdBottom > pipe.gapY + PIPE_GAP) {
          gameOverHandler();
          return;
        }
      }
    }

    draw();
  }, [draw]);

  const gameOverHandler = useCallback(() => {
    gameStateRef.current = 'over';
    setGameState('over');
    const finalScore = scoreRef.current;
    const earned = Math.floor(finalScore / 2);
    if (earned > 0) addCoins(earned);
    setCoinsEarned(earned);
    if (finalScore > bestScore) setBestScore(finalScore);
  }, [addCoins, bestScore]);

  const jump = useCallback(() => {
    if (gameStateRef.current === 'menu') {
      gameStateRef.current = 'playing';
      setGameState('playing');
      birdRef.current = { y: GAME_HEIGHT / 2, velocity: 0 };
      pipesRef.current = [];
      scoreRef.current = 0;
      setScore(0);
    }
    if (gameStateRef.current === 'playing') {
      birdRef.current.velocity = JUMP_FORCE;
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;
    const loop = () => {
      update();
      gameLoopRef.current = requestAnimationFrame(loop);
    };
    gameLoopRef.current = requestAnimationFrame(loop);
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [gameState, update]);

  // Draw initial
  useEffect(() => { draw(); }, [draw]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [jump]);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Flappy Bird" />
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '80px 20px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px', opacity: loaded ? 1 : 0, transition: 'all 0.6s ease' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffd60a', marginBottom: '4px' }}>🐦 Flappy Bird</h1>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Tap or press Space to fly!</p>
        </div>

        <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,214,10,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} onClick={jump} style={{ display: 'block', cursor: 'pointer' }} />

          {/* Menu Overlay */}
          {gameState === 'menu' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🐦</div>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '8px' }}>FLAPPY BIRD</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Tap to start flying!</p>
              {bestScore > 0 && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Best: {bestScore}</p>}
            </div>
          )}

          {/* Game Over Overlay */}
          {gameState === 'over' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>💀</div>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#e63946', marginBottom: '8px' }}>GAME OVER</p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '24px', color: '#ffd60a', marginBottom: '4px' }}>{score}</p>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>pipes passed</p>
              {coinsEarned > 0 && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#06d6a0', marginBottom: '12px' }}>+{coinsEarned} coins!</p>}
              {bestScore > 0 && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>Best: {bestScore}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setGameState('menu'); gameStateRef.current = 'menu'; draw(); }} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer' }}>Retry</button>
                <Link href="/entertainment" style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '9px', textDecoration: 'none' }}>More</Link>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>💡 Earn coins for every pipe you pass. Tap gently — gravity is your friend!</p>
        </div>
      </div>
    </main>
  );
}
