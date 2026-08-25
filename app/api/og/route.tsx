import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a18',
          width: '1200px',
          height: '630px',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Background gradients */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0a0a18 0%, #16213e 30%, #1a1a2e 60%, #0f0f1a 100%)' }} />

        {/* Glow orbs */}
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,214,10,0.12) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,214,160,0.08) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,57,70,0.06) 0%, transparent 70%)', transform: 'translate(-50%, -50%)' }} />

        {/* Floating food emojis */}
        <div style={{ position: 'absolute', top: '60px', left: '80px', fontSize: '48px', opacity: 0.7, transform: 'rotate(-15deg)' }}>🍣</div>
        <div style={{ position: 'absolute', top: '100px', right: '120px', fontSize: '42px', opacity: 0.6, transform: 'rotate(10deg)' }}>🍩</div>
        <div style={{ position: 'absolute', bottom: '100px', left: '150px', fontSize: '38px', opacity: 0.5, transform: 'rotate(20deg)' }}>☕</div>
        <div style={{ position: 'absolute', bottom: '80px', right: '180px', fontSize: '44px', opacity: 0.6, transform: 'rotate(-10deg)' }}>🍪</div>
        <div style={{ position: 'absolute', top: '180px', left: '50px', fontSize: '32px', opacity: 0.4, transform: 'rotate(25deg)' }}>⭐</div>
        <div style={{ position: 'absolute', bottom: '180px', right: '60px', fontSize: '30px', opacity: 0.4, transform: 'rotate(-20deg)' }}>✨</div>
        <div style={{ position: 'absolute', top: '80px', left: '400px', fontSize: '28px', opacity: 0.3, transform: 'rotate(15deg)' }}>🪙</div>
        <div style={{ position: 'absolute', bottom: '140px', right: '400px', fontSize: '26px', opacity: 0.3, transform: 'rotate(-25deg)' }}>💌</div>
        <div style={{ position: 'absolute', top: '300px', left: '1000px', fontSize: '36px', opacity: 0.5, transform: 'rotate(5deg)' }}>🎮</div>
        <div style={{ position: 'absolute', bottom: '250px', left: '50px', fontSize: '24px', opacity: 0.3, transform: 'rotate(-5deg)' }}>🎵</div>

        {/* Stars */}
        <div style={{ position: 'absolute', top: '40px', left: '300px', fontSize: '14px', color: '#ffd60a', opacity: 0.6 }}>✦</div>
        <div style={{ position: 'absolute', top: '120px', right: '300px', fontSize: '10px', color: '#4895ef', opacity: 0.5 }}>✧</div>
        <div style={{ position: 'absolute', bottom: '60px', left: '600px', fontSize: '12px', color: '#ffd60a', opacity: 0.4 }}>✦</div>
        <div style={{ position: 'absolute', top: '200px', right: '500px', fontSize: '8px', color: '#06d6a0', opacity: 0.5 }}>✧</div>

        {/* Decorative lines */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,214,10,0.1), transparent)' }} />
        <div style={{ position: 'absolute', top: 0, left: '50%', bottom: 0, width: '1px', background: 'linear-gradient(180deg, transparent, rgba(255,214,10,0.08), transparent)' }} />

        {/* Center content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* Mushroom icon */}
          <div style={{
            fontSize: '72px',
            marginBottom: '16px',
            filter: 'drop-shadow(0 0 20px rgba(255,214,10,0.3))',
          }}>🍄</div>

          {/* Title */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: '#ffd60a',
              textAlign: 'center',
              letterSpacing: '-2px',
              textShadow: '0 0 40px rgba(255,214,10,0.3), 3px 3px 0 rgba(0,0,0,0.5)',
              lineHeight: 1,
            }}
          >
            MURAGOODS
          </div>

          {/* Accent line */}
          <div style={{
            width: '120px',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #ffd60a, transparent)',
            marginTop: '16px',
            marginBottom: '16px',
            borderRadius: '2px',
          }} />

          {/* Subtitle */}
          <div
            style={{
              fontSize: '22px',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
              letterSpacing: '6px',
              textTransform: 'uppercase',
            }}
          >
            Campus Power-Up Food
          </div>

          {/* Product tags */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '28px',
            }}
          >
            {[
              { emoji: '🍣', label: 'Musubi', color: '#ffd60a' },
              { emoji: '🍩', label: 'Churros', color: '#fb8500' },
              { emoji: '☕', label: 'Coffee Jelly', color: '#4895ef' },
              { emoji: '🍪', label: 'Cookies', color: '#06d6a0' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${item.color}30`,
                  borderRadius: '10px',
                }}
              >
                <span style={{ fontSize: '20px' }}>{item.emoji}</span>
                <span style={{ fontSize: '14px', color: item.color, fontWeight: 'bold' }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <div
            style={{
              marginTop: '32px',
              fontSize: '16px',
              color: 'rgba(255,255,255,0.35)',
              fontStyle: 'italic',
            }}
          >
            Play games · Earn coins · Share untold words
          </div>
        </div>

        {/* Bottom URL bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))',
            borderTop: '1px solid rgba(255,214,10,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ fontSize: '12px', color: '#06d6a0' }}>🔒</span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>muragoods.vercel.app</span>
          </div>
        </div>

        {/* Top decorative border */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #e63946, #ffd60a, #06d6a0, #4895ef, #7209b7)' }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
