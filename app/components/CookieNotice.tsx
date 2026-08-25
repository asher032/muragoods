'use client';

import { useState, useEffect } from 'react';

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('cookie-notice-dismissed');
    if (!dismissed) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-notice-dismissed', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <style jsx>{`
        .cookie-overlay {
          position: fixed;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cookie-card {
          max-width: 340px;
          padding: 1rem;
          background-color: #1e1e32;
          border-radius: 14px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
        }
        .title {
          font-weight: 600;
          color: #ffd60a;
          font-family: var(--font-arcade);
          font-size: 11px;
        }
        .description {
          margin-top: 0.75rem;
          font-size: 0.8rem;
          line-height: 1.4rem;
          color: rgba(255,255,255,0.5);
        }
        .description a {
          color: #4895ef;
        }
        .description a:hover {
          text-decoration: underline;
        }
        .actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 1rem;
          column-gap: 1rem;
          flex-shrink: 0;
        }
        .pref {
          font-size: 0.7rem;
          line-height: 1rem;
          color: rgba(255,255,255,0.4);
          text-decoration: underline;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          background-color: transparent;
          cursor: pointer;
        }
        .pref:hover {
          color: rgba(255,255,255,0.6);
        }
        .accept {
          font-size: 0.75rem;
          line-height: 1rem;
          background-color: #ffd60a;
          font-weight: 600;
          border-radius: 8px;
          color: #0f0f1a;
          padding-left: 1rem;
          padding-right: 1rem;
          padding-top: 0.625rem;
          padding-bottom: 0.625rem;
          border: none;
          cursor: pointer;
          font-family: var(--font-arcade);
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .accept:hover {
          background-color: #ffe066;
          transform: translateY(-1px);
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div className="cookie-overlay">
        <div className="cookie-card">
          <p className="title">🍪 We use cookies</p>
          <p className="description">
            We use cookies to improve your experience, remember your cart, and keep you logged in.
            By continuing, you agree to our use of cookies.
          </p>
          <div className="actions">
            <button className="pref" onClick={accept}>Learn more</button>
            <button className="accept" onClick={accept}>Accept</button>
          </div>
        </div>
      </div>
    </>
  );
}
