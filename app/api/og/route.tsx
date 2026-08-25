import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f0f1a 0%, #16213e 50%, #1a1a2e 100%)',
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
        }}
      >
        {/* Glow effect */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,214,10,0.15), transparent 70%)',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Logo */}
        <div style={{ fontSize: '80px', marginBottom: '20px' }}>🍄</div>

        {/* Title */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 'bold',
            color: '#ffd60a',
            textAlign: 'center',
            letterSpacing: '-1px',
            textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
          }}
        >
          MURAGOODS
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '24px',
            color: 'rgba(255,255,255,0.6)',
            textAlign: 'center',
            marginTop: '12px',
          }}
        >
          Campus Power-Up Food
        </div>

        {/* Items */}
        <div
          style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.4)',
            textAlign: 'center',
            marginTop: '20px',
            letterSpacing: '4px',
          }}
        >
          MUSUBI · CHURROS · COFFEE JELLY · COOKIES
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '3px',
          }}
        >
          muragoods.vercel.app
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
