'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

const SEGMENTS = [
  { label: '5 coins', coins: 5, color: '#e63946', textColor: '#fff' },
  { label: '10 coins', coins: 10, color: '#ffd60a', textColor: '#0f0f1a' },
  { label: '2 coins', coins: 2, color: '#06d6a0', textColor: '#0f0f1a' },
  { label: '25 coins', coins: 25, color: '#7b2ff7', textColor: '#fff' },
  { label: '15 coins', coins: 15, color: '#fb8500', textColor: '#0f0f1a' },
  { label: '0 coins', coins: 0, color: '#555', textColor: '#aaa' },
  { label: '50 coins', coins: 50, color: '#ffd60a', textColor: '#0f0f1a' },
  { label: '8 coins', coins: 8, color: '#4895ef', textColor: '#fff' },
];
const SPIN_COST = 15;
const SEGMENT_ANGLE = 360 / SEGMENTS.length;
const RADIUS = 130;
const SVG_SIZE = RADIUS * 2 + 20;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;

function segmentPath(index: number) {
  const sa = ((index * SEGMENT_ANGLE) - 90) * (Math.PI / 180);
  const ea = (((index + 1) * SEGMENT_ANGLE) - 90) * (Math.PI / 180);
  const x1 = CX + RADIUS * Math.cos(sa);
  const y1 = CY + RADIUS * Math.sin(sa);
  const x2 = CX + RADIUS * Math.cos(ea);
  const y2 = CY + RADIUS * Math.sin(ea);
  const large = SEGMENT_ANGLE > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2} Z`;
}

function textPos(index: number) {
  const mid = ((index + 0.5) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
  const r = RADIUS * 0.65;
  return { x: CX + r * Math.cos(mid), y: CY + r * Math.sin(mid), rot: (index + 0.5) * SEGMENT_ANGLE };
}

export default function SpinWheelPage() {
  const router = useRouter();
  const { coins, addCoins } = useCoins();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [totalWon, setTotalWon] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const saved = localStorage.getItem('spin_spins_left');
    const savedDate = localStorage.getItem('spin_date');
    const today = new Date().toDateString();
    if (savedDate === today && saved) {
      setSpinsLeft(Number(saved));
    } else {
      localStorage.setItem('spin_date', today);
      localStorage.setItem('spin_spins_left', '3');
      setSpinsLeft(3);
    }
    const savedTotal = localStorage.getItem('spin_total_won');
    if (savedTotal) setTotalWon(Number(savedTotal));
  }, [router]);

  const spin = useCallback(() => {
    if (spinning || spinsLeft <= 0 || coins < SPIN_COST) return;
    addCoins(-SPIN_COST, 'Spin the Wheel');
    setSpinsLeft(prev => {
      const next = prev - 1;
      localStorage.setItem('spin_spins_left', String(next));
      return next;
    });
    setSpinning(true);
    setShowResult(false);
    setResult(null);
    const winIndex = Math.floor(Math.random() * SEGMENTS.length);
    const targetAngle = 360 - (winIndex * SEGMENT_ANGLE) - SEGMENT_ANGLE / 2;
    const spins = 5 + Math.floor(Math.random() * 3);
    const finalRotation = rotation + spins * 360 + targetAngle;
    setRotation(finalRotation);
    setTimeout(() => {
      const won = SEGMENTS[winIndex].coins;
      setResult(won);
      setShowResult(true);
      setSpinning(false);
      if (won > 0) addCoins(won, 'Spin the Wheel prize');
      setTotalWon(prev => {
        const next = prev + won;
        localStorage.setItem('spin_total_won', String(next));
        return next;
      });
    }, 4200);
  }, [spinning, spinsLeft, coins, rotation, addCoins]);

  if (!isLoggedIn) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Spin the Wheel" />
      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '8px' }}>
          {[
            { label: 'Spins', value: `${spinsLeft}/3`, color: spinsLeft > 0 ? 'var(--mario-yellow)' : 'var(--mario-red)' },
            { label: 'Cost', value: `${SPIN_COST} coins`, color: 'var(--mario-orange)' },
            { label: 'Balance', value: `${coins} coins`, color: 'var(--mario-yellow)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--mario-bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-text-muted)', textTransform: 'uppercase' }}>{s.label}</p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: s.color, marginTop: '4px' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', width: SVG_SIZE, height: SVG_SIZE, margin: '0 auto 24px' }}>
          <div style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '24px solid #ffd60a', zIndex: 10, filter: 'drop-shadow(0 2px 6px rgba(255,214,10,0.5))' }} />
          <div style={{ width: SVG_SIZE, height: SVG_SIZE, transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none' }}>
            <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
              <circle cx={CX} cy={CY} r={RADIUS + 8} fill="none" stroke="rgba(255,214,10,0.2)" strokeWidth="4" />
              {SEGMENTS.map((seg, i) => {
                const t = textPos(i);
                return (
                  <g key={i}>
                    <path d={segmentPath(i)} fill={seg.color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
                    <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" fill={seg.textColor} fontSize="10" fontWeight="bold" fontFamily="var(--font-arcade)" transform={`rotate(${t.rot}, ${t.x}, ${t.y})`}>{seg.label}</text>
                  </g>
                );
              })}
              <circle cx={CX} cy={CY} r="22" fill="var(--mario-bg)" stroke="#ffd60a" strokeWidth="3" />
              <circle cx={CX} cy={CY} r="16" fill="rgba(255,214,10,0.15)" />
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fill="#ffd60a" fontSize="14" fontWeight="bold">SPIN</text>
            </svg>
          </div>
        </div>

        <button onClick={spin} disabled={spinning || spinsLeft <= 0 || coins < SPIN_COST} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: '2px solid var(--mario-yellow)', background: spinning ? 'rgba(255,214,10,0.05)' : 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '14px', fontWeight: 700, cursor: spinning || spinsLeft <= 0 || coins < SPIN_COST ? 'not-allowed' : 'pointer', opacity: spinning || spinsLeft <= 0 || coins < SPIN_COST ? 0.4 : 1, boxShadow: spinning ? 'none' : '0 4px 0 rgba(255,214,10,0.3)', transition: 'all 0.2s' }}>
          {spinning ? 'SPINNING...' : spinsLeft <= 0 ? 'NO SPINS LEFT' : coins < SPIN_COST ? 'NOT ENOUGH COINS' : `SPIN - ${SPIN_COST} COINS`}
        </button>

        {showResult && result !== null && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', backdropFilter: 'blur(4px)' }} onClick={() => setShowResult(false)}>
            <div style={{ background: 'var(--mario-bg-card)', border: `2px solid ${result > 0 ? '#ffd60a' : '#555'}`, borderRadius: '20px', padding: '32px 24px', textAlign: 'center', maxWidth: '320px', width: '100%' }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: "48px", marginBottom: "12px" }}>{result > 0 ? "YOU WON!" : "NO LUCK!"}</p>
              <p style={{ fontFamily: "var(--font-arcade)", fontSize: "28px", color: result > 0 ? "var(--mario-green)" : "var(--mario-text-muted)", marginBottom: "16px" }}>{result > 0 ? `+${result} coins` : "Try again tomorrow"}</p>
              <p style={{ fontSize: "11px", color: "var(--mario-text-muted)", marginBottom: "16px" }}>Total won today: {totalWon} coins</p>
              <button onClick={() => setShowResult(false)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "2px solid var(--mario-yellow)", background: "rgba(255,214,10,0.15)", color: "var(--mario-yellow)", fontFamily: "var(--font-arcade)", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                {spinsLeft > 0 && coins >= SPIN_COST ? "SPIN AGAIN" : "BACK TO GAMES"}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: "20px", background: "var(--mario-bg-card)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px" }}>
          <p style={{ fontFamily: "var(--font-arcade)", fontSize: "9px", color: "var(--mario-yellow)", textTransform: "uppercase", marginBottom: "10px" }}>How It Works</p>
          {[`Pay ${SPIN_COST} coins per spin`, "3 spins per day (resets daily)", "Win up to 50 coins per spin!", "Landing on 0 means no prize"].map((text, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--mario-yellow)", flexShrink: 0 }} />
              <span style={{ fontSize: "11px", color: "var(--mario-text-muted)" }}>{text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/entertainment" style={{ fontSize: "11px", color: "var(--mario-yellow)", textDecoration: "none", fontFamily: "var(--font-arcade)" }}>
            Back to Games
          </Link>
        </div>
      </div>
    </main>
  );
}
