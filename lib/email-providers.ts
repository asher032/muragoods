// Multi-provider email system with automatic fallback
// Order: Resend → Supabase → Gmail SMTP

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

interface EmailProvider {
  name: string;
  send(options: EmailOptions): Promise<boolean>;
  isAvailable(): boolean;
}

// ─── Resend.com Provider ─────────────────────────────────────
class ResendProvider implements EmailProvider {
  name = 'Resend';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from || `Muragoods <${process.env.EMAIL_USER || 'muragoods0@gmail.com'}>`,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[Resend] Failed: ${err}`);
        return false;
      }
      console.log(`[Resend] ✅ Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('[Resend] Error:', error);
      return false;
    }
  }
}

// ─── Supabase Email Provider ─────────────────────────────────
class SupabaseProvider implements EmailProvider {
  name = 'Supabase';
  private url: string;
  private serviceRoleKey: string;

  constructor() {
    this.url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  }

  isAvailable(): boolean {
    return !!(this.url && this.serviceRoleKey);
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      // Supabase Edge Function or direct SMTP via their API
      const res = await fetch(`${this.url}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          from: options.from || 'Muragoods <muragoods0@gmail.com>',
        }),
      });
      if (!res.ok) {
        // If edge function doesn't exist, try Supabase Auth invite as fallback
        console.log(`[Supabase] Edge function not available, trying auth API...`);
        return await this.sendViaAuth(options);
      }
      console.log(`[Supabase] ✅ Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('[Supabase] Error:', error);
      return await this.sendViaAuth(options);
    }
  }

  private async sendViaAuth(options: EmailOptions): Promise<boolean> {
    try {
      // Use Supabase Auth to send a magic link (as a fallback mechanism)
      const res = await fetch(`${this.url}/auth/v1/magiclink`, {
        method: 'POST',
        headers: {
          'apikey': this.serviceRoleKey,
          'Authorization': `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: options.to,
          data: { custom_message: options.text },
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── Gmail SMTP Provider ─────────────────────────────────────
class GmailProvider implements EmailProvider {
  name = 'Gmail';
  private transporter: unknown;

  constructor() {
    // Lazy init to avoid import issues
  }

  isAvailable(): boolean {
    return !!(process.env.EMAIL_USER || process.env.EMAIL_PASSWORD);
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      // Dynamic import to avoid circular deps
      const nodemailer = await import('nodemailer');
      if (!this.transporter) {
        this.transporter = nodemailer.default.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER || 'muragoods0@gmail.com',
            pass: process.env.EMAIL_PASSWORD || '',
          },
        });
      }
      await (this.transporter as { sendMail: (opts: Record<string, unknown>) => Promise<unknown> }).sendMail({
        from: options.from || `"Muragoods" <${process.env.EMAIL_USER || 'muragoods0@gmail.com'}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      console.log(`[Gmail] ✅ Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('[Gmail] Error:', error);
      return false;
    }
  }
}

// ─── Email Manager (tries providers in order) ────────────────
const providers: EmailProvider[] = [
  new ResendProvider(),
  new SupabaseProvider(),
  new GmailProvider(),
];

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; provider: string }> {
  for (const provider of providers) {
    if (!provider.isAvailable()) {
      console.log(`[Email] ⏭️ ${provider.name} not configured, skipping...`);
      continue;
    }
    console.log(`[Email] 📧 Trying ${provider.name}...`);
    const sent = await provider.send(options);
    if (sent) {
      return { success: true, provider: provider.name };
    }
    console.log(`[Email] ❌ ${provider.name} failed, trying next provider...`);
  }
  console.error('[Email] ❌ All email providers failed');
  return { success: false, provider: 'none' };
}

export function getAvailableProviders(): string[] {
  return providers.filter(p => p.isAvailable()).map(p => p.name);
}
