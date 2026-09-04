'use client';

export default function MuraStreamLoader({ fullScreen = true, text }: { fullScreen?: boolean; text?: string }) {
  const loader = (
    <div className="ms-loader-wrap">
      <div className="ms-loader" />
    </div>
  );

  if (!fullScreen) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '24px' }}>
      {loader}
      {text && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#A0A0A0', letterSpacing: '0.1em' }}>{text}</p>}
    </div>
  );

  return (
    <>
      <style jsx global>{`
        .ms-loader-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }
        .ms-loader {
          width: 44.8px;
          height: 44.8px;
          color: #B85CFF;
          position: relative;
          background: radial-gradient(11.2px, currentColor 94%, #0000);
        }
        .ms-loader:before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(10.08px at bottom right, #0000 94%, currentColor) top left,
            radial-gradient(10.08px at bottom left, #0000 94%, currentColor) top right,
            radial-gradient(10.08px at top right, #0000 94%, currentColor) bottom left,
            radial-gradient(10.08px at top left, #0000 94%, currentColor) bottom right;
          background-size: 22.4px 22.4px;
          background-repeat: no-repeat;
          animation: msLoaderSpin 1.5s infinite cubic-bezier(0.3, 1, 0, 1);
        }
        @keyframes msLoaderSpin {
          33% {
            inset: -11.2px;
            transform: rotate(0deg);
          }
          66% {
            inset: -11.2px;
            transform: rotate(90deg);
          }
          100% {
            inset: 0;
            transform: rotate(90deg);
          }
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0A0A0A',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '16px',
      }}>
        {loader}
        {text && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#A0A0A0', letterSpacing: '0.1em' }}>{text}</p>}
      </div>
    </>
  );
}
