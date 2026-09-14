'use client';

import { useState } from 'react';
import { Cloudy, Gamepad2, Link, Package, PiggyBank, Send } from 'lucide-react';
interface ShareOrderProps {
  orderId: string;
  customerName: string;
  total: number;
  items: string[];
}

export default function ShareOrder({ orderId, customerName, total, items }: ShareOrderProps) {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const shortId = orderId.slice(-8).toUpperCase();
  const shareText = `<Gamepad2 color={'#c896ff'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> MURAGOODS ORDER\n━━━━━━━━━━━━━━━━\n<Package className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Order #${shortId}\n ${customerName}\n<PiggyBank className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Total: ₱${total}\n\nItems:\n${items.map(i => `  • ${i}`).join('\n')}\n\n<Link className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Track: https://muragoods.vercel.app/order/${orderId}\n\nPower up your day! <Cloudy className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Muragoods Order #${shortId}`,
          text: shareText,
          url: `https://muragoods.vercel.app/order/${orderId}`,
        });
      } catch { /* cancelled */ }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <div className="share-buttons">
        <button onClick={handleNativeShare} className="share-btn share-btn-primary">
          <Send className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Share Order
        </button>
        <button onClick={handleCopy} className="share-btn share-btn-secondary">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">SHARE ORDER</div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)', marginBottom: '12px' }}>
                Copy this text to share your order:
              </p>
              <textarea
                readOnly
                value={shareText}
                style={{
                  width: '100%', height: '200px', padding: '12px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'var(--mario-bg-input)',
                  color: 'var(--mario-text)', fontFamily: 'monospace', fontSize: '11px', resize: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button onClick={handleCopy} style={{ flex: 1, padding: '10px', background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '6px', color: 'var(--mario-yellow)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'var(--mario-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .share-buttons { display: flex; gap: 8px; }
        .share-btn {
          padding: 8px 16px; border-radius: 6px; font-size: 10px; font-weight: 600;
          cursor: pointer; transition: all 0.2s; font-family: var(--font-arcade);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .share-btn-primary {
          background: rgba(255,214,10,0.15); color: var(--mario-yellow);
          border-color: rgba(255,214,10,0.3);
        }
        .share-btn-primary:hover { background: rgba(255,214,10,0.25); }
        .share-btn-secondary {
          background: rgba(255,255,255,0.05); color: var(--mario-text-muted);
        }
        .share-btn-secondary:hover { background: rgba(255,255,255,0.1); }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 16px; backdrop-filter: blur(4px);
        }
        .modal-card {
          background: var(--mario-bg-card); border-radius: 12px; width: 100%;
          max-width: 400px; border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
          overflow: hidden;
        }
        .modal-title {
          width: 100%; height: 40px; display: flex; align-items: center;
          padding-left: 20px; border-bottom: 1px solid rgba(255,255,255,0.08);
          font-weight: 700; font-size: 11px; color: var(--mario-yellow);
          font-family: var(--font-arcade);
        }
      `}</style>
    </>
  );
}
