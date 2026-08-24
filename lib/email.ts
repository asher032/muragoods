import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'muragoods0@gmail.com',
    pass: process.env.EMAIL_PASSWORD || '', // App Password from Google
  },
});

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
    await transporter.sendMail({
      from: `"Muragoods" <${process.env.EMAIL_USER || 'muragoods0@gmail.com'}>`,
      to,
      subject: `🎮 Your Muragoods Verification Code: ${code}`,
      html,
      text: `Hey ${userName}!\n\nYour Muragoods verification code is: ${code}\n\nThis code expires in 30 minutes.\nEnter it at muragoods.vercel.app/verify-email\n\nIf you didn't create this account, ignore this email.`,
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
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
    await transporter.sendMail({
      from: `"Muragoods" <${process.env.EMAIL_USER || 'muragoods0@gmail.com'}>`,
      to,
      subject: `🔑 Your Muragoods Password Reset Code: ${code}`,
      html,
      text: `Hey ${userName}!\n\nYour password reset code is: ${code}\n\nThis code expires in 15 minutes.\nEnter it at muragoods.vercel.app/forgot-password\n\nIf you didn't request this, ignore this email.`,
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error);
    return false;
  }
}
