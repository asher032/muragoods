// Smart multi-provider email system
// Strategy: Resend primary → auto-switch to Gmail when rate-limited or daily limit approached
// Daily limit for Resend free tier: 100 emails/day

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

// ─── Daily Counter (resets each day) ─────────────────────────
class DailyCounter {
  private count = 0;
  private date = new Date().toDateString();
  private readonly maxDaily = 90; // Stay under 100 limit with buffer

  resetIfNeeded() {
    const today = new Date().toDateString();
    if (today !== this.date) {
      this.count = 0;
      this.date = today;
      console.log(`[Counter] 📅 New day — reset email count to 0`);
    }
  }

  increment(provider: string) {
    this.resetIfNeeded();
    this.count++;
    console.log(`[Counter] 📧 ${provider} sent #${this.count}/${this.maxDaily} today`);
  }

  hasCapacity(): boolean {
    this.resetIfNeeded();
    return this.count < this.maxDaily;
  }

  getRemaining(): number {
    this.resetIfNeeded();
    return Math.max(0, this.maxDaily - this.count);
  }

  getCount(): number {
    this.resetIfNeeded();
    return this.count;
  }
}

const dailyCounter = new DailyCounter();

// ─── Resend.com Provider ─────────────────────────────────────
class ResendProvider implements EmailProvider {
  name = 'Resend';
  private apiKey: string;
  private consecutiveFailures = 0;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
  }

  isAvailable(): boolean {
    if (!this.apiKey) return false;
    // If too many consecutive failures, disable temporarily
    if (this.consecutiveFailures >= 3) {
      console.log(`[Resend] ⚠️ ${this.consecutiveFailures} consecutive failures — using Gmail instead`);
      return false;
    }
    return true;
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.apiKey) return false;

    // Check daily limit before even trying
    if (!dailyCounter.hasCapacity()) {
      console.log(`[Resend] 📊 Daily limit reached (${dailyCounter.getCount()}/90) — skipping`);
      return false;
    }

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

      // Rate limited (429) or server error (5xx)
      if (res.status === 429 || res.status >= 500) {
        console.error(`[Resend] ❌ Rate limited or server error (${res.status})`);
        this.consecutiveFailures++;
        return false;
      }

      // Other errors
      if (!res.ok) {
        const err = await res.text();
        console.error(`[Resend] ❌ Failed (${res.status}): ${err}`);
        this.consecutiveFailures++;
        return false;
      }

      // Success!
      this.consecutiveFailures = 0;
      dailyCounter.increment('Resend');
      console.log(`[Resend] ✅ Email sent to ${options.to} (${dailyCounter.getRemaining()} remaining today)`);
      return true;
    } catch (error) {
      console.error('[Resend] ❌ Network error:', error);
      this.consecutiveFailures++;
      return false;
    }
  }
}

// ─── Gmail SMTP Provider ─────────────────────────────────────
class GmailProvider implements EmailProvider {
  name = 'Gmail';
  private transporter: unknown;
  private consecutiveFailures = 0;

  isAvailable(): boolean {
    if (this.consecutiveFailures >= 5) {
      console.log(`[Gmail] ⚠️ ${this.consecutiveFailures} consecutive failures — temporarily disabled`);
      return false;
    }
    return !!(process.env.EMAIL_USER || process.env.EMAIL_PASSWORD);
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
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

      this.consecutiveFailures = 0;
      dailyCounter.increment('Gmail');
      console.log(`[Gmail] ✅ Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('[Gmail] ❌ Error:', error);
      this.consecutiveFailures++;
      return false;
    }
  }
}

// ─── Smart Email Manager ─────────────────────────────────────
// Strategy: Resend first → Gmail fallback (or when daily limit hit)

const providers: EmailProvider[] = [
  new ResendProvider(),
  new GmailProvider(),
];

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; provider: string }> {
  // Reset counter if new day
  dailyCounter.resetIfNeeded();

  for (const provider of providers) {
    if (!provider.isAvailable()) {
      console.log(`[Email] ⏭️ ${provider.name} not available, trying next...`);
      continue;
    }

    console.log(`[Email] 📧 Trying ${provider.name}... (${dailyCounter.getRemaining()} emails remaining today)`);
    const sent = await provider.send(options);

    if (sent) {
      return { success: true, provider: provider.name };
    }
    console.log(`[Email] ❌ ${provider.name} failed, falling back to next provider...`);
  }

  console.error('[Email] ❌ All email providers failed');
  return { success: false, provider: 'none' };
}

export function getAvailableProviders(): string[] {
  dailyCounter.resetIfNeeded();
  return providers.filter(p => p.isAvailable()).map(p => p.name);
}

export function getEmailStats(): { providers: string[]; resendRemaining: number; totalSentToday: number } {
  dailyCounter.resetIfNeeded();
  return {
    providers: providers.filter(p => p.isAvailable()).map(p => p.name),
    resendRemaining: dailyCounter.getRemaining(),
    totalSentToday: dailyCounter.getCount(),
  };
}
