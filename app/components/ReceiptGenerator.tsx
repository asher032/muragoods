'use client';

import { useRef } from 'react';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  variant?: string;
}

interface ReceiptProps {
  orderId: string;
  items: ReceiptItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  orderDate: string;
  timeSlot?: string;
  discount?: number;
}

export function ReceiptGenerator({ orderId, items, subtotal, deliveryFee, total, paymentMethod, customerName, customerPhone, deliveryAddress, orderDate, timeSlot, discount }: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Receipt - ${orderId}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: #fff; padding: 20px; }
        .receipt { width: 280px; margin: 0 auto; border: 2px dashed #ccc; border-radius: 8px; padding: 16px; }
        .shop-name { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 4px; }
        .shop-sub { font-size: 9px; text-align: center; color: #666; margin-bottom: 12px; }
        .info { text-align: center; font-size: 10px; color: #555; margin-bottom: 12px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
        th, td { padding: 3px 2px; text-align: left; border-bottom: 1px dotted #ddd; }
        th { font-weight: bold; font-size: 9px; color: #666; }
        td:last-child { text-align: right; }
        th:last-child { text-align: right; }
        .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
        .totals { font-size: 10px; }
        .totals .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .totals .total-row { font-weight: bold; font-size: 12px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #000; }
        .barcode { text-align: center; margin: 12px 0; font-size: 8px; letter-spacing: 2px; color: #999; }
        .thanks { font-size: 10px; text-align: center; margin-top: 10px; color: #666; }
        .footer { font-size: 8px; text-align: center; margin-top: 8px; color: #999; }
        @media print { body { padding: 0; } .receipt { border: none; box-shadow: none; } }
      </style></head><body>
      <div class="receipt">
        <div class="shop-name">🍄 MURAGOODS</div>
        <div class="shop-sub">Campus Power-Up Food Stall</div>
        <div class="info">
          Order: <strong>#${orderId.slice(0, 8).toUpperCase()}</strong><br>
          Date: ${new Date(orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}<br>
          ${timeSlot ? `Time: ${timeSlot}<br>` : ''}
          Payment: ${paymentMethod}
        </div>
        <table>
          <tr><th>ITEM</th><th>QTY</th><th>AMT</th></tr>
          ${items.map(item => `<tr><td>${item.name}${item.variant ? ` (${item.variant})` : ''}</td><td>${item.quantity}</td><td>₱${(item.price * item.quantity).toFixed(0)}</td></tr>`).join('')}
        </table>
        <div class="divider"></div>
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>₱${subtotal.toFixed(0)}</span></div>
          ${discount ? `<div class="row" style="color:#06d6a0"><span>Discount</span><span>-₱${discount.toFixed(0)}</span></div>` : ''}
          <div class="row"><span>Delivery</span><span>₱${deliveryFee.toFixed(0)}</span></div>
          <div class="total-row"><span>TOTAL</span><span>₱${total.toFixed(0)}</span></div>
        </div>
        <div class="divider"></div>
        <div class="info">
          ${customerName}<br>
          ${customerPhone}<br>
          ${deliveryAddress}
        </div>
        <div class="barcode">||||| ${orderId.slice(0, 8).toUpperCase()} |||||</div>
        <div class="thanks">Thank you for ordering! 🍄</div>
        <div class="footer">Some power-ups never get old.</div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const content = `
╔══════════════════════════════════╗
║         🍄 MURAGOODS            ║
║    Campus Power-Up Food Stall   ║
╠══════════════════════════════════╣
║ Order: #${orderId.slice(0, 8).toUpperCase().padEnd(23)}║
║ Date: ${new Date(orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).padEnd(24)}║
║ Payment: ${paymentMethod.padEnd(21)}║
╠══════════════════════════════════╣
${items.map(item => `║ ${item.name.slice(0, 14).padEnd(14)} x${item.quantity}  ₱${(item.price * item.quantity).toFixed(0).padStart(5)}     ║`).join('\n')}
╠══════════════════════════════════╣
║ Subtotal:           ₱${subtotal.toFixed(0).padStart(8)}    ║
${discount ? `║ Discount:          -₱${discount.toFixed(0).padStart(8)}    ║\n` : ''}║ Delivery:           ₱${deliveryFee.toFixed(0).padStart(8)}    ║
║ ─────────────────────────────── ║
║ TOTAL:              ₱${total.toFixed(0).padStart(8)}    ║
╠══════════════════════════════════╣
║ ${customerName.padEnd(32)}║
║ ${customerPhone.padEnd(32)}║
╠══════════════════════════════════╣
║     Thank you for ordering!     ║
║     Some power-ups never        ║
║     get old.                    ║
╚══════════════════════════════════╝
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muragoods-receipt-${orderId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={receiptRef}>
      <style jsx>{`
        .receipt-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .receipt-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,214,10,0.3);
          background: rgba(255,214,10,0.08);
          color: #ffd60a;
          font-family: var(--font-arcade);
          font-size: 9px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .receipt-btn:hover {
          background: rgba(255,214,10,0.15);
          transform: translateY(-1px);
        }
        .receipt-btn-print {
          border-color: rgba(72,149,239,0.3);
          background: rgba(72,149,239,0.08);
          color: #4895ef;
        }
        .receipt-btn-print:hover {
          background: rgba(72,149,239,0.15);
        }
      `}</style>
      <div className="receipt-actions">
        <button className="receipt-btn receipt-btn-print" onClick={handlePrint}>🖨️ Print Receipt</button>
        <button className="receipt-btn" onClick={handleDownload}>📥 Download</button>
      </div>
    </div>
  );
}
