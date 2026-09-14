'use client';

import { useRef, useCallback } from 'react';
import { Inbox, Printer } from 'lucide-react';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateReceiptImage = useCallback(async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dashed border
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.setLineDash([]);

    // Header
    ctx.font = '48px serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    // Vector star (canvas has no color-emoji font guarantee across platforms)
    ctx.font = '40px serif';
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 22 : 9;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const px = canvas.width / 2 + r * Math.sin(a);
      const py = 80 - r * Math.cos(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.fillText('MURAGOODS', canvas.width / 2, 130);

    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('Campus Power-Up Food Stall', canvas.width / 2, 165);

    // Divider
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 185);
    ctx.lineTo(canvas.width - 60, 185);
    ctx.stroke();

    // Order info
    ctx.textAlign = 'left';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#333333';
    const infoX = 80;
    ctx.fillText(`Order: #${orderId.slice(0, 8).toUpperCase()}`, infoX, 220);
    ctx.fillText(`Date: ${new Date(orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, infoX, 248);
    if (timeSlot) ctx.fillText(`Time: ${timeSlot}`, infoX, 276);
    ctx.fillText(`Payment: ${paymentMethod}`, infoX, timeSlot ? 304 : 276);

    // Items header
    const itemsY = timeSlot ? 340 : 310;
    ctx.fillStyle = '#999999';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('ITEM', infoX, itemsY);
    ctx.fillText('QTY', 400, itemsY);
    ctx.textAlign = 'right';
    ctx.fillText('AMOUNT', canvas.width - 80, itemsY);

    // Items
    ctx.fillStyle = '#333333';
    ctx.font = '16px "Courier New", monospace';
    let y = itemsY + 30;
    items.forEach(item => {
      ctx.textAlign = 'left';
      const itemName = item.variant ? `${item.name} (${item.variant})` : item.name;
      ctx.fillText(itemName.length > 28 ? itemName.slice(0, 28) + '...' : itemName, infoX, y);
      ctx.fillText(String(item.quantity), 400, y);
      ctx.textAlign = 'right';
      ctx.fillText(`P${(item.price * item.quantity).toFixed(0)}`, canvas.width - 80, y);
      y += 28;

      // Dotted line
      ctx.strokeStyle = '#eeeeee';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(infoX, y - 10);
      ctx.lineTo(canvas.width - 80, y - 10);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    y += 10;

    // Divider
    ctx.strokeStyle = '#cccccc';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(canvas.width - 60, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 30;

    // Totals
    ctx.font = '16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333333';
    ctx.fillText('Subtotal', infoX, y);
    ctx.textAlign = 'right';
    ctx.fillText(`P${subtotal.toFixed(0)}`, canvas.width - 80, y);
    y += 28;

    if (discount && discount > 0) {
      ctx.fillStyle = '#06d6a0';
      ctx.textAlign = 'left';
      ctx.fillText('Discount', infoX, y);
      ctx.textAlign = 'right';
      ctx.fillText(`-P${discount.toFixed(0)}`, canvas.width - 80, y);
      y += 28;
    }

    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText('Delivery', infoX, y);
    ctx.textAlign = 'right';
    ctx.fillText(`P${deliveryFee.toFixed(0)}`, canvas.width - 80, y);
    y += 35;

    // Total line
    ctx.strokeStyle = '#000000';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(infoX, y - 10);
    ctx.lineTo(canvas.width - 80, y - 10);
    ctx.stroke();

    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL', infoX, y + 15);
    ctx.textAlign = 'right';
    ctx.fillText(`P${total.toFixed(0)}`, canvas.width - 80, y + 15);
    y += 50;

    // Customer info
    ctx.strokeStyle = '#cccccc';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(canvas.width - 60, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 30;

    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    ctx.fillText(customerName || 'Customer', canvas.width / 2, y);
    y += 24;
    ctx.fillText(customerPhone || '', canvas.width / 2, y);
    y += 24;
    ctx.fillText(deliveryAddress || '', canvas.width / 2, y);
    y += 35;

    // Barcode
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#999999';
    ctx.fillText(`||||| ${orderId.slice(0, 8).toUpperCase()} |||||`, canvas.width / 2, y);
    y += 35;

    // Thanks
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#333333';
    ctx.fillText('Thank you for ordering!', canvas.width / 2, y);
    y += 22;
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#999999';
    ctx.fillText('Some power-ups never get old.', canvas.width / 2, y);

    return canvas;
  }, [orderId, items, subtotal, deliveryFee, total, paymentMethod, customerName, customerPhone, deliveryAddress, orderDate, timeSlot, discount]);

  const handlePrint = useCallback(async () => {
    const canvas = await generateReceiptImage();
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Receipt - ${orderId}</title>
      <style>
        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
        img { max-width: 100%; height: auto; }
        @media print { body { background: #fff; } }
      </style></head><body>
      <img src="${dataUrl}" />
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  }, [generateReceiptImage, orderId]);

  const handleDownload = useCallback(async () => {
    const canvas = await generateReceiptImage();
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `muragoods-receipt-${orderId.slice(0, 8)}.png`;
    a.click();
  }, [generateReceiptImage, orderId]);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
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
        <button className="receipt-btn receipt-btn-print" onClick={handlePrint}><Printer className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Print</button>
        <button className="receipt-btn" onClick={handleDownload}><Inbox className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Download Image</button>
      </div>
    </>
  );
}
