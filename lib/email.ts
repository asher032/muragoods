import { sendEmail } from './email-providers';

export async function sendVerificationEmail(to: string, code: string, userName: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .card { background: #1e1e32; border: 2px solid #ffd60a; border-radius: 16px; overflow: hidden; }
        .header { background: rgba(255,214,10,0.08); padding: 24px; text-align: center; border-bottom: 2px solid rgba(255,214,10,0.2); }
        .logo { font-size: 28px; color: #ffd60a; font-weight: 900; letter-spacing: 4px; }
        .body { padding: 32px 24px; color: #e8e8f0; text-align: center; }
        .code-box { background: #0f0f1a; border: 2px solid #ffd60a; border-radius: 12px; padding: 20px; margin: 24px 0; display: inline-block; }
        .code { font-size: 36px; font-weight: 900; color: #ffd60a; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .note { font-size: 13px; color: #9090a8; margin-top: 16px; line-height: 1.5; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer p { font-size: 11px; color: #707090; margin: 4px 0; }
        .expiry { background: rgba(230,57,70,0.1); border: 1px solid rgba(230,57,70,0.2); border-radius: 8px; padding: 10px; margin-top: 16px; }
        .expiry p { font-size: 12px; color: #e63946; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div class="logo">MURAGOODS</div>
            <p style="font-size: 12px; color: #9090a8; margin-top: 4px; letter-spacing: 2px;">EMAIL VERIFICATION</p>
          </div>
          <div class="body">
            <p style="font-size: 16px; color: #e8e8f0; margin-bottom: 4px;">Hey ${userName}! 👋</p>
            <p style="font-size: 14px; color: #9090a8; margin-bottom: 0;">Here's your verification code:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <div class="expiry">
              <p>⏰ This code expires in <strong>30 minutes</strong></p>
            </div>
            <p class="note">
              Enter this code on the <strong>Muragoods</strong> verification page to complete your account setup.
              <br><br>
              If you didn't create this account, you can safely ignore this email.
            </p>
          </div>
          <div class="footer">
            <p style="color: #ffd60a; font-weight: 700;">MURAGOODS</p>
            <p>Campus Power-Up Food</p>
            <p>muragoods.vercel.app</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await sendEmail({
      to,
      subject: `🎮 Your Muragoods Verification Code: ${code}`,
      html,
      text: `Hey ${userName}!\n\nYour Muragoods verification code is: ${code}\n\nThis code expires in 30 minutes.\nEnter it at muragoods.vercel.app/verify-email\n\nIf you didn't create this account, ignore this email.`,
    });
    console.log(`[Email] Verification sent via ${result.provider}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    return false;
  }
}

export async function sendLetterEmail(to: string, letterUrl: string, senderName: string, recipientName: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .card { background: #1e1e32; border: 2px solid rgba(255,100,150,0.4); border-radius: 16px; overflow: hidden; }
        .header { background: rgba(255,100,150,0.08); padding: 32px 24px; text-align: center; border-bottom: 2px solid rgba(255,100,150,0.15); }
        .logo { font-size: 28px; color: #ffd60a; font-weight: 900; letter-spacing: 4px; }
        .body { padding: 32px 24px; color: #e8e8f0; text-align: center; }
        .btn { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #ff6496, #ff8fb4); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; margin: 24px 0; letter-spacing: 1px; }
        .note { font-size: 13px; color: #9090a8; margin-top: 16px; line-height: 1.6; }
        .divider { width: 40px; height: 2px; background: linear-gradient(90deg, transparent, #ff6496, transparent); margin: 24px auto; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer p { font-size: 11px; color: #707090; margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div style="font-size: 36px; margin-bottom: 12px;">💌</div>
            <div class="logo">MURAGOODS</div>
            <p style="font-size: 11px; color: #9090a8; margin-top: 6px; letter-spacing: 2px;">UNTOLD LETTERS</p>
          </div>
          <div class="body">
            <p style="font-size: 18px; color: #ff6496; margin-bottom: 8px;">You received a digital letter 💌</p>
            <p style="font-size: 14px; color: #9090a8; margin-bottom: 4px;">${senderName !== 'Anonymous' ? senderName : 'Someone'} has sent you a ${letterUrl.includes('/letter/') ? 'digital letter' : 'song message'} through Muragoods.</p>
            <p style="font-size: 13px; color: #707090;">For: ${recipientName}</p>
            <div class="divider" />
            <a href="${letterUrl}" class="btn">Open Your Letter 💌</a>
            <p class="note">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${letterUrl}" style="color: #ff6496; word-break: break-all;">${letterUrl}</a>
            </p>
          </div>
          <div class="footer">
            <p style="color: #ff6496; font-weight: 700;">MURAGOODS</p>
            <p>Untold Letters — Some words are easier to send than to say.</p>
            <p>muragoods.vercel.app</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await sendEmail({
      to,
      subject: 'You received a digital letter 💌',
      html,
      text: `You received a digital letter!\n\n${senderName !== 'Anonymous' ? senderName : 'Someone'} sent you a letter through Muragoods.\n\nOpen it here: ${letterUrl}\n\n— Muragoods Untold Letters`,
    });
    console.log(`[Email] Letter sent via ${result.provider}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Email] Failed to send letter email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, code: string, userName: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .card { background: #1e1e32; border: 2px solid #e63946; border-radius: 16px; overflow: hidden; }
        .header { background: rgba(230,57,70,0.08); padding: 24px; text-align: center; border-bottom: 2px solid rgba(230,57,70,0.2); }
        .logo { font-size: 28px; color: #e63946; font-weight: 900; letter-spacing: 4px; }
        .body { padding: 32px 24px; color: #e8e8f0; text-align: center; }
        .code-box { background: #0f0f1a; border: 2px solid #e63946; border-radius: 12px; padding: 20px; margin: 24px 0; display: inline-block; }
        .code { font-size: 36px; font-weight: 900; color: #e63946; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .note { font-size: 13px; color: #9090a8; margin-top: 16px; line-height: 1.5; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer p { font-size: 11px; color: #707090; margin: 4px 0; }
        .expiry { background: rgba(230,57,70,0.1); border: 1px solid rgba(230,57,70,0.2); border-radius: 8px; padding: 10px; margin-top: 16px; }
        .expiry p { font-size: 12px; color: #e63946; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div class="logo">MURAGOODS</div>
            <p style="font-size: 12px; color: #9090a8; margin-top: 4px; letter-spacing: 2px;">PASSWORD RESET</p>
          </div>
          <div class="body">
            <p style="font-size: 16px; color: #e8e8f0; margin-bottom: 4px;">Hey ${userName}!</p>
            <p style="font-size: 14px; color: #9090a8; margin-bottom: 0;">You requested a password reset. Here's your code:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <div class="expiry">
              <p>⏰ This code expires in <strong>15 minutes</strong></p>
            </div>
            <p class="note">
              Go to <strong>muragoods.vercel.app/forgot-password</strong> and enter this code to reset your password.
              <br><br>
              If you didn't request this, <strong>ignore this email</strong> — your password won't change.
            </p>
          </div>
          <div class="footer">
            <p style="color: #e63946; font-weight: 700;">MURAGOODS</p>
            <p>Campus Power-Up Food</p>
            <p>muragoods.vercel.app</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await sendEmail({
      to,
      subject: `🔑 Your Muragoods Password Reset Code: ${code}`,
      html,
      text: `Hey ${userName}!\n\nYour password reset code is: ${code}\n\nThis code expires in 15 minutes.\nEnter it at muragoods.vercel.app/forgot-password\n\nIf you didn't request this, ignore this email.`,
    });
    console.log(`[Email] Password reset sent via ${result.provider}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error);
    return false;
  }
}

export async function sendTopUpReceiptEmail(params: {
  to: string;
  orderId: string;
  transactionId: string;
  gameName: string;
  gameIcon: string;
  accountDetails: Record<string, string>;
  packageName: string;
  packageCurrency: string;
  packageAmount: number;
  amount: number;
  paymentMethod: string;
  createdAt: Date;
}) {
  const { to, orderId, transactionId, gameName, gameIcon, accountDetails, packageName, packageCurrency, packageAmount, amount, paymentMethod, createdAt } = params;
  const accountStr = Object.entries(accountDetails).filter(([,v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .card { background: #1e1e32; border: 2px solid #06d6a0; border-radius: 16px; overflow: hidden; }
        .header { background: rgba(6,214,160,0.08); padding: 24px; text-align: center; border-bottom: 2px solid rgba(6,214,160,0.2); }
        .logo { font-size: 28px; color: #ffd60a; font-weight: 900; letter-spacing: 4px; }
        .body { padding: 24px; color: #e8e8f0; }
        .success-badge { background: rgba(6,214,160,0.15); border: 1px solid rgba(6,214,160,0.3); border-radius: 12px; padding: 12px; text-align: center; margin: 16px 0; }
        .success-badge p { color: #06d6a0; font-size: 14px; font-weight: 700; margin: 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .detail-label { font-size: 12px; color: #9090a8; }
        .detail-value { font-size: 12px; color: #e8e8f0; font-weight: 600; text-align: right; }
        .total-row { display: flex; justify-content: space-between; padding: 14px 0; margin-top: 8px; border-top: 2px solid rgba(255,214,10,0.2); }
        .total-label { font-size: 13px; color: #ffd60a; font-weight: 700; }
        .total-value { font-size: 18px; color: #ffd60a; font-weight: 900; }
        .track-btn { display: block; text-align: center; padding: 14px; background: linear-gradient(135deg, #ffd60a, #f59e0b); color: #000; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; margin: 20px 0; letter-spacing: 1px; }
        .note { font-size: 12px; color: #707090; text-align: center; margin-top: 16px; line-height: 1.5; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer p { font-size: 11px; color: #707090; margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div style="font-size: 36px; margin-bottom: 8px;">${gameIcon}</div>
            <div class="logo">MURAGOODS</div>
            <p style="font-size: 12px; color: #9090a8; margin-top: 4px; letter-spacing: 2px;">TOP-UP RECEIPT</p>
          </div>
          <div class="body">
            <div class="success-badge">
              <p>✓ Payment Successful</p>
              <p style="font-size: 11px; color: #9090a8; margin-top: 4px;">Your top-up is being processed</p>
            </div>
            <div class="detail-row">
              <span class="detail-label">Game</span>
              <span class="detail-value">${gameIcon} ${gameName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Account</span>
              <span class="detail-value">${accountStr}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Package</span>
              <span class="detail-value">${packageName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Amount</span>
              <span class="detail-value">${packageAmount} ${packageCurrency}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Payment Method</span>
              <span class="detail-value">${paymentMethod}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Order ID</span>
              <span class="detail-value" style="font-family: monospace; font-size: 11px;">${orderId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Transaction ID</span>
              <span class="detail-value" style="font-family: monospace; font-size: 11px;">${transactionId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date</span>
              <span class="detail-value">${createdAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="total-row">
              <span class="total-label">TOTAL PAID</span>
              <span class="total-value">₱${amount}</span>
            </div>
            <a href="https://muragoods.vercel.app/topup/track" class="track-btn">Track Your Order →</a>
            <p class="note">
              Your top-up will be delivered automatically. If you have any issues, contact us at muragoods.vercel.app/support<br>
              or reply to this email.
            </p>
          </div>
          <div class="footer">
            <p style="color: #ffd60a; font-weight: 700;">MURAGOODS</p>
            <p>Campus Power-Up Food</p>
            <p>muragoods.vercel.app</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await sendEmail({
      to,
      subject: `🎮 Top-Up Receipt — ${gameName} ${packageName}`,
      html,
      text: `Top-Up Receipt\n\nGame: ${gameName}\nAccount: ${accountStr}\nPackage: ${packageName} (${packageAmount} ${packageCurrency})\nAmount: ₱${amount}\nPayment: ${paymentMethod}\nOrder: ${orderId}\n\nTrack: https://muragoods.vercel.app/topup/track\n\n— Muragoods`,
    });
    console.log(`[Email] Top-up receipt sent via ${result.provider}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Email] Failed to send top-up receipt:', error);
    return false;
  }
}

// Re-export for backwards compatibility
export { getAvailableProviders } from './email-providers';
