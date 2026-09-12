'use client';

import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import MuraStreamCard from '../components/MuraStreamCard';

export default function MuraStreamMyListPage() {
  const { myList, removeFromMyList } = useMuraStreamStore();

  return (
    <div style={{ padding: '24px 28px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 4px' }}>
        <span style={{ color: '#E50914' }}>★</span> MY LIST
      </h1>
      <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#666', margin: '0 0 24px' }}>
        {myList.length} title{myList.length !== 1 ? 's' : ''} saved
      </p>

      {myList.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {myList.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <MuraStreamCard item={item} />
              <button
                onClick={() => removeFromMyList(item.id)}
                style={{
                  position: 'absolute', top: '6px', right: '6px', zIndex: 2,
                  background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                  width: '24px', height: '24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#e63946" viewBox="0 0 16 16">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '64px 16px', color: '#555' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#333" viewBox="0 0 16 16" style={{ marginBottom: '12px' }}>
            <path d="M2 2v2h2V2zm4 0v2h8V2zm-4 4v2h12V6zm-4 4v2h16v-2zm-4 4v2h20v-2z"/>
          </svg>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '4px' }}>Your list is empty</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px' }}>Browse movies and tap + to add to your list</p>
        </div>
      )}
    </div>
  );
}
