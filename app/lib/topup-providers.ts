// ─── TopUp Provider Abstraction ────────────────────────────
// Manual Fulfillment System for Muragoods Game Top-Up.
//
// Real game top-up APIs (Codapay, UniPin, Codashop) require B2B
// merchant agreements with business registration. Since Muragoods
// doesn't have that, ALL top-ups are fulfilled manually by the admin.
//
// Flow:
//   1. Customer pays via PayMongo or Cash on Delivery
//   2. Webhook confirms payment → order marked 'pending_fulfillment'
//   3. Admin sees order in /admin/fulfillment dashboard
//   4. Admin manually tops up via game provider's consumer app
//   5. Admin clicks "Fulfill" → order marked 'completed'
//   6. Customer gets email confirmation
//
// To switch to automatic fulfillment in the future:
//   - Sign up for Codapay/UniPin merchant account
//   - Create a new provider class implementing TopUpProvider
//   - Add it to the allProviders array below

export interface ProviderAccountValidation {
  valid: boolean;
  playerName?: string;
  error?: string;
}

export interface ProviderTopUpResult {
  success: boolean;
  providerTransactionId?: string;
  error?: string;
  estimatedCompletion?: number; // seconds
}

export interface ProviderTransactionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  providerTransactionId?: string;
  completedAt?: Date;
  error?: string;
}

export interface TopUpProvider {
  name: string;
  id: string;
  active: boolean;
  description: string;
  supportedGames: string[];
  features: {
    accountValidation: boolean;
    autoTopUp: boolean;
    webhooks: boolean;
    refunds: boolean;
  };

  validateAccount(gameId: string, accountDetails: Record<string, string>): Promise<ProviderAccountValidation>;
  createTopUp(params: {
    gameId: string;
    packageId: string;
    accountDetails: Record<string, string>;
    orderId: string;
    amount: number;
  }): Promise<ProviderTopUpResult>;
  checkTransaction(providerTransactionId: string): Promise<ProviderTransactionStatus>;
  handleWebhook(payload: unknown): Promise<{
    orderId: string;
    status: 'completed' | 'failed';
    providerTransactionId: string;
  } | null>;
}

// ─── Manual Fulfillment Provider ────────────────────────────
// This is the ONLY active provider for Muragoods right now.
//
// It does NOT make any external API calls. It simply marks orders
// as awaiting manual fulfillment. The admin then:
//   1. Opens /admin/fulfillment
//   2. Sees the order details (game, account ID, package)
//   3. Manually tops up via the game's consumer app/website
//   4. Marks the order as fulfilled in the dashboard
//
// No fake HTTP calls. No fabricated endpoints. Honest code.

class ManualFulfillmentProvider implements TopUpProvider {
  name = 'Manual Fulfillment';
  id = 'manual-fulfillment';
  active = true; // Always active — this is the default path
  description = 'Admin manually processes top-ups via game provider apps';
  supportedGames = [
    'mobile-legends', 'pubg-mobile', 'genshin-impact', 'cod-mobile',
    'free-fire', 'roblox', 'valorant', 'steam-wallet',
    'google-play', 'apple-itunes',
  ];
  features = {
    accountValidation: false, // Can't validate without API access
    autoTopUp: false,         // Manual — admin does it
    webhooks: false,          // No external provider to call us
    refunds: false,           // Admin handles refunds manually too
  };

  // Account validation requires API access to the game provider.
  // Without it, we can only pass through the data the customer entered.
  async validateAccount(_gameId: string, _accountDetails: Record<string, string>): Promise<ProviderAccountValidation> {
    // We can't validate — just confirm the data was received
    // Admin will verify during manual fulfillment
    return {
      valid: true,
      playerName: 'Manual verification required',
    };
  }

  // This doesn't actually call any external API.
  // It just returns success so the order flow continues.
  // The real fulfillment happens in the admin dashboard.
  async createTopUp(params: {
    gameId: string;
    packageId: string;
    accountDetails: Record<string, string>;
    orderId: string;
    amount: number;
  }): Promise<ProviderTopUpResult> {
    console.log(`[ManualFulfillment] Order ${params.orderId} queued for manual processing`);
    console.log(`[ManualFulfillment] Game: ${params.gameId}, Package: ${params.packageId}`);
    console.log(`[ManualFulfillment] Account: ${JSON.stringify(params.accountDetails)}`);
    console.log(`[ManualFulfillment] Admin must manually top up via game provider app`);

    // Return success so the order is created and appears in the admin dashboard
    return {
      success: true,
      providerTransactionId: `MANUAL-${params.orderId}`,
      estimatedCompletion: undefined, // No estimate — depends on admin availability
    };
  }

  // Manual fulfillment doesn't have external transaction IDs to check.
  // Status is managed entirely by the admin in the fulfillment dashboard.
  async checkTransaction(providerTransactionId: string): Promise<ProviderTransactionStatus> {
    return {
      status: 'pending',
      providerTransactionId,
    };
  }

  // No external webhooks — the admin is the webhook.
  async handleWebhook(_payload: unknown): Promise<null> {
    return null;
  }
}

// ─── Provider Registry ─────────────────────────────────────
// Currently only one provider: ManualFulfillment.
//
// To add automatic fulfillment in the future:
//   1. Create a new class implementing TopUpProvider
//   2. Add it to this array BEFORE ManualFulfillmentProvider
//   3. Set its 'active' flag based on env vars (API keys)
//
// Example:
//   class CodapayProvider implements TopUpProvider { ... }
//   const allProviders: TopUpProvider[] = [
//     new CodapayProvider(),      // Try automatic first
//     new ManualFulfillmentProvider(), // Fallback to manual
//   ];

const allProviders: TopUpProvider[] = [
  new ManualFulfillmentProvider(),
];

export function getActiveProviders(): TopUpProvider[] {
  return allProviders.filter(p => p.active);
}

export function getProviderById(id: string): TopUpProvider | undefined {
  return allProviders.find(p => p.id === id);
}

export function getProviderForGame(_gameId: string): TopUpProvider {
  // All games use manual fulfillment for now
  return allProviders[0];
}

export function getProviderStatus(): Array<{ id: string; name: string; active: boolean; description: string }> {
  return allProviders.map(p => ({
    id: p.id, name: p.name, active: p.active, description: p.description,
  }));
}

// ─── Game-to-Provider Mapping ──────────────────────────────
// All games currently use manual fulfillment.

export const GAME_PROVIDER_MAP: Record<string, string[]> = {
  'mobile-legends': ['manual-fulfillment'],
  'pubg-mobile': ['manual-fulfillment'],
  'genshin-impact': ['manual-fulfillment'],
  'cod-mobile': ['manual-fulfillment'],
  'free-fire': ['manual-fulfillment'],
  'roblox': ['manual-fulfillment'],
  'valorant': ['manual-fulfillment'],
  'steam-wallet': ['manual-fulfillment'],
  'google-play': ['manual-fulfillment'],
  'apple-itunes': ['manual-fulfillment'],
};
