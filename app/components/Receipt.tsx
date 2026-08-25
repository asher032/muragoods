'use client';

import { useRef } from 'react';

interface ReceiptItem {
  name: string;
  variant: string;
  quantity: number;
  price: number;
}

interface ReceiptProps {
  orderId: string;
  customerName: string;
  items: ReceiptItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  promoDiscount: number;
  total: number;
  paymentMethod: string;
  deliveryDate: string;
  deliveryTimeSlot?: string;
  deliveryService: string;
  zone: string;
  address: string;
  pointsEarned: number;
  createdAt: string;
}

export default function Receipt({
  orderId,
  customerName,
  items,
  subtotal,
  shippingFee,
  discount,
  promoDiscount,
  total,
  paymentMethod,
  deliveryDate,
  deliveryTimeSlot,
  deliveryService,
  zone,
  address,
  pointsEarned,
  createdAt,
}: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Muragoods Receipt #${orderId.slice(-8).toUpperCase()}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #fff; display: flex; justify-content: center; padding: 20px; }
          .receipt { width: 320px; font-family: 'Share Tech Mono', 'Courier New', monospace; font-size: 12px; color: #1a1a1a; background: #fff; padding: 16px; }
          @media print { body { padding: 0; } .receipt { width: 100%; padding: 8px; } }
        </style>
      </head>
      <body>
        <div class="receipt">${content.innerHTML}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const storeName = 'MURAGOODS';
  const storeTagline = 'World 1-1 Food';
  const storeAddress = 'DWCL Campus';
  const storeContact = '@muragoods_';
  const receiptDate = createdAt ? new Date(createdAt).toLocaleString('en-PH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : new Date().toLocaleString('en-PH');

  const divider = '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·';
  const dividerBold = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

  return (
    <div className="receipt-wrapper">
      <div ref={receiptRef} className="receipt-paper">
        {/* Top tear effect */}
        <div className="tear-top" />

        {/* Store Header */}
        <div className="receipt-section receipt-header">
          <div className="receipt-stars">★ ★ ★ ★ ★ ★ ★ ★ ★ ★</div>
          <h1 className="receipt-store-name">{storeName}</h1>
          <p className="receipt-store-tagline">{storeTagline}</p>
          <p className="receipt-store-info">{storeAddress}</p>
          <p className="receipt-store-info">{storeContact}</p>
          <div className="receipt-stars">★ ★ ★ ★ ★ ★ ★ ★ ★ ★</div>
        </div>

        <p className="receipt-divider">{divider}</p>

        {/* Order Info */}
        <div className="receipt-section">
          <div className="receipt-row">
            <span>Order #:</span>
            <span className="receipt-bold">{orderId.slice(-8).toUpperCase()}</span>
          </div>
          <div className="receipt-row">
            <span>Date:</span>
            <span>{receiptDate}</span>
          </div>
          <div className="receipt-row">
            <span>Cashier:</span>
            <span>MURAGOODS BOT</span>
          </div>
          <div className="receipt-row">
            <span>Customer:</span>
            <span className="receipt-bold">{customerName}</span>
          </div>
        </div>

        <p className="receipt-divider">{divider}</p>

        {/* Items */}
        <div className="receipt-section">
          <p className="receipt-section-title">── ITEMS ──</p>
          {items.map((item, index) => (
            <div key={index} className="receipt-item">
              <div className="receipt-item-top">
                <span className="receipt-item-name">{item.name}</span>
                <span className="receipt-item-price">₱{(item.price * item.quantity).toFixed(2)}</span>
              </div>
              <div className="receipt-item-bottom">
                <span className="receipt-item-variant">  {item.variant} x{item.quantity}</span>
                <span className="receipt-item-unit">@ ₱{item.price.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="receipt-divider">{divider}</p>

        {/* Totals */}
        <div className="receipt-section receipt-totals">
          <div className="receipt-row">
            <span>Subtotal:</span>
            <span>₱{subtotal.toFixed(2)}</span>
          </div>
          <div className="receipt-row">
            <span>Shipping ({zone}):</span>
            <span>{shippingFee === 0 ? 'FREE' : `₱${shippingFee.toFixed(2)}`}</span>
          </div>
          {discount > 0 && (
            <div className="receipt-row receipt-discount">
              <span>Discount:</span>
              <span>-₱{discount.toFixed(2)}</span>
            </div>
          )}
          {promoDiscount > 0 && (
            <div className="receipt-row receipt-discount">
              <span>Promo:</span>
              <span>-₱{promoDiscount.toFixed(2)}</span>
            </div>
          )}
          <p className="receipt-divider-thick">{dividerBold}</p>
          <div className="receipt-row receipt-total">
            <span className="receipt-bold">TOTAL:</span>
            <span className="receipt-bold">₱{total.toFixed(2)}</span>
          </div>
          <p className="receipt-divider-thick">{dividerBold}</p>
        </div>

        {/* Payment */}
        <div className="receipt-section">
          <p className="receipt-section-title">── PAYMENT ──</p>
          <div className="receipt-row">
            <span>Method:</span>
            <span className="receipt-bold">{paymentMethod}</span>
          </div>
          {paymentMethod === 'InstaPay' && (
            <div className="receipt-row">
              <span>Status:</span>
              <span>PENDING VERIFICATION</span>
            </div>
          )}
          {paymentMethod === 'Cash on Delivery' && (
            <div className="receipt-row">
              <span>Status:</span>
              <span>PAY ON DELIVERY</span>
            </div>
          )}
        </div>

        <p className="receipt-divider">{divider}</p>

        {/* Delivery */}
        <div className="receipt-section">
          <p className="receipt-section-title">── DELIVERY ──</p>
          <div className="receipt-row">
            <span>Date:</span>
            <span>{deliveryDate}</span>
          </div>
          {deliveryTimeSlot && (
            <div className="receipt-row">
              <span>Time:</span>
              <span>{deliveryTimeSlot}</span>
            </div>
          )}
          <div className="receipt-row">
            <span>Service:</span>
            <span>{deliveryService}</span>
          </div>
          <div className="receipt-row">
            <span>Zone:</span>
            <span>{zone}</span>
          </div>
          {address && (
            <p className="receipt-address">Address: {address}</p>
          )}
        </div>

        <p className="receipt-divider">{divider}</p>

        {/* Points */}
        {pointsEarned > 0 && (
          <div className="receipt-section receipt-points">
            <div className="receipt-row">
              <span className="receipt-bold">COINS EARNED:</span>
              <span className="receipt-bold">+{pointsEarned} 🪙</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="receipt-section receipt-footer">
          <div className="receipt-stars">★ ★ ★ ★ ★ ★ ★ ★ ★ ★</div>
          <p className="receipt-thankyou">THANK YOU FOR YOUR ORDER!</p>
          <p className="receipt-footer-info">Power up your day! 🍄</p>
          <p className="receipt-footer-info">Questions? DM @muragoods_</p>
          <div className="receipt-barcode">
            <div className="barcode-lines">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="barcode-line" style={{ width: Math.random() > 0.5 ? '2px' : '1px', height: '20px', background: '#1a1a1a' }} />
              ))}
            </div>
            <p className="barcode-text">{orderId.slice(-12).toUpperCase()}</p>
          </div>
          <div className="receipt-stars">★ ★ ★ ★ ★ ★ ★ ★ ★ ★</div>
        </div>

        {/* Bottom tear effect */}
        <div className="tear-bottom" />
      </div>

      {/* Print Button */}
      <div className="receipt-actions">
        <button onClick={handlePrint} className="receipt-print-btn">
          🖨️ Print Receipt
        </button>
      </div>

      <style jsx>{`
        .receipt-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .receipt-paper {
          width: 340px;
          background: #fff;
          color: #1a1a1a;
          font-family: 'Share Tech Mono', 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.4;
          padding: 0;
          position: relative;
          box-shadow: 0 4px 24px rgba(0,0,0,0.2);
        }
        .tear-top {
          height: 12px;
          background: linear-gradient(135deg, transparent 33.33%, #fff 33.33%, #fff 66.66%, transparent 66.66%),
                      linear-gradient(225deg, transparent 33.33%, #fff 33.33%, #fff 66.66%, transparent 66.66%);
          background-size: 16px 12px;
          background-color: var(--mario-bg, #0f0f1a);
          position: relative;
          z-index: 1;
        }
        .tear-bottom {
          height: 12px;
          background: linear-gradient(45deg, transparent 33.33%, #fff 33.33%, #fff 66.66%, transparent 66.66%),
                      linear-gradient(315deg, transparent 33.33%, #fff 33.33%, #fff 66.66%, transparent 66.66%);
          background-size: 16px 12px;
          background-color: var(--mario-bg, #0f0f1a);
          position: relative;
          z-index: 1;
        }
        .receipt-section {
          padding: 4px 16px;
        }
        .receipt-header {
          text-align: center;
          padding: 12px 16px 4px;
        }
        .receipt-store-name {
          font-family: 'VT323', monospace;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 4px;
          margin: 4px 0;
          color: #1a1a1a;
        }
        .receipt-store-tagline {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 2px 0;
        }
        .receipt-store-info {
          font-size: 10px;
          color: #555;
          margin: 1px 0;
        }
        .receipt-stars {
          font-size: 8px;
          letter-spacing: 2px;
          color: #999;
          margin: 4px 0;
        }
        .receipt-divider {
          font-size: 8px;
          color: #999;
          text-align: center;
          padding: 4px 16px;
          letter-spacing: 1px;
          overflow: hidden;
        }
        .receipt-divider-thick {
          font-size: 10px;
          color: #1a1a1a;
          text-align: center;
          padding: 2px 16px;
          letter-spacing: 0;
          overflow: hidden;
        }
        .receipt-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 1px 0;
        }
        .receipt-bold {
          font-weight: 700;
        }
        .receipt-section-title {
          text-align: center;
          font-size: 10px;
          letter-spacing: 2px;
          margin-bottom: 4px;
          color: #555;
        }
        .receipt-item {
          padding: 3px 0;
        }
        .receipt-item-top {
          display: flex;
          justify-content: space-between;
        }
        .receipt-item-name {
          font-weight: 700;
          text-transform: uppercase;
        }
        .receipt-item-price {
          font-weight: 700;
        }
        .receipt-item-bottom {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #666;
        }
        .receipt-item-variant {
          text-transform: capitalize;
        }
        .receipt-item-unit {
          color: #888;
        }
        .receipt-totals {
          padding: 4px 16px;
        }
        .receipt-discount {
          color: #2d7a3a;
        }
        .receipt-total {
          font-size: 14px;
          padding: 4px 0;
        }
        .receipt-address {
          font-size: 10px;
          color: #555;
          padding: 2px 0;
          word-break: break-word;
        }
        .receipt-points {
          background: #f5f5f5;
          padding: 6px 16px;
          margin: 0 16px;
          border-radius: 4px;
        }
        .receipt-footer {
          text-align: center;
          padding: 8px 16px 12px;
        }
        .receipt-thankyou {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1px;
          margin: 4px 0;
        }
        .receipt-footer-info {
          font-size: 9px;
          color: #666;
          margin: 2px 0;
        }
        .receipt-barcode {
          margin: 8px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .barcode-lines {
          display: flex;
          gap: 1px;
          align-items: flex-end;
        }
        .barcode-text {
          font-size: 8px;
          letter-spacing: 2px;
          margin-top: 2px;
        }
        .receipt-actions {
          display: flex;
          gap: 8px;
        }
        .receipt-print-btn {
          padding: 10px 24px;
          background: rgba(255,214,10,0.15);
          border: 1px solid rgba(255,214,10,0.3);
          border-radius: 8px;
          color: #ffd60a;
          font-family: var(--font-arcade);
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .receipt-print-btn:hover {
          background: rgba(255,214,10,0.25);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
