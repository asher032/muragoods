'use client';

export default function MuraStreamDownloadsPage() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 24px' }}>
        📥 DOWNLOADS
      </h1>

      <div style={{
        padding: '48px 24px', textAlign: 'center',
        background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="#333" viewBox="0 0 16 16" style={{ marginBottom: '16px' }}>
          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>
          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>
        </svg>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#888', marginBottom: '8px' }}>
          Downloads Coming Soon
        </p>
        <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#555', maxWidth: '300px', margin: '0 auto' }}>
          Download movies and shows to watch offline. This feature will be available when supported by the streaming provider.
        </p>
      </div>
    </div>
  );
}
