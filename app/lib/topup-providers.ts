// ─── TopUp Provider Abstraction ────────────────────────────
// Abstract interface for game top-up providers.
// Each provider implements this interface with their specific API calls.
// This allows Muragoods to swap providers without rebuilding the frontend.

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

  // Validate a player's account before top-up
  validateAccount(gameId: string, accountDetails: Record<string, string>): Promise<ProviderAccountValidation>;

  // Create a top-up order
  createTopUp(params: {
    gameId: string;
    packageId: string;
    accountDetails: Record<string, string>;
    orderId: string;
    amount: number;
  }): Promise<ProviderTopUpResult>;

  // Check transaction status
  checkTransaction(providerTransactionId: string): Promise<ProviderTransactionStatus>;

  // Handle provider webhook
  handleWebhook(payload: unknown): Promise<{
    orderId: string;
    status: 'completed' | 'failed';
    providerTransactionId: string;
  } | null>;
}

// ─── Mock Provider (for testing/development) ───────────────
// Simulates a real provider. Replace with actual provider integrations.

class MockTopUpProvider implements TopUpProvider {
  name = 'Muragoods Direct';
  id = 'muragoods-direct';
  active = true;

  async validateAccount(_gameId: string, _accountDetails: Record<string, string>): Promise<ProviderAccountValidation> {
    // Simulate validation delay
    await new Promise(r => setTimeout(r, 500));
    // In production, call the actual provider's validation API
    return { valid: true, playerName: 'Player' };
  }

  async createTopUp(params: { gameId: string; packageId: string; accountDetails: Record<string, string>; orderId: string; amount: number }): Promise<ProviderTopUpResult> {
    await new Promise(r => setTimeout(r, 800));
    // Simulate success
    return {
      success: true,
      providerTransactionId: `PROV-${params.orderId}`,
      estimatedCompletion: 30,
    };
  }

  async checkTransaction(providerTransactionId: string): Promise<ProviderTransactionStatus> {
    await new Promise(r => setTimeout(r, 300));
    return {
      status: 'completed',
      providerTransactionId,
      completedAt: new Date(),
    };
  }

  async handleWebhook(payload: unknown): Promise<{ orderId: string; status: 'completed' | 'failed'; providerTransactionId: string } | null> {
    const data = payload as Record<string, unknown>;
    return {
      orderId: String(data.orderId || ''),
      status: 'completed',
      providerTransactionId: String(data.transactionId || ''),
    };
  }
}

// ─── Provider Registry ─────────────────────────────────────
// Register all available providers here. The system tries each
// active provider in order until one succeeds.

const providers: TopUpProvider[] = [
  new MockTopUpProvider(),
  // Add real providers here:
  // new CodashopProvider(),
  // new UniPinProvider(),
  // new RazerProvider(),
];

export function getActiveProviders(): TopUpProvider[] {
  return providers.filter(p => p.active);
}

export function getProviderById(id: string): TopUpProvider | undefined {
  return providers.find(p => p.id === id);
}

export function getProviderForGame(gameId: string): TopUpProvider {
  // In production, map games to their supported providers
  // For now, return the first active provider
  const active = getActiveProviders();
  return active[0] || providers[0];
}

// ─── Game-to-Provider Mapping ──────────────────────────────
// Maps game IDs to their supported provider IDs.
// Used to determine which provider to use for each game.

export const GAME_PROVIDER_MAP: Record<string, string[]> = {
  'mobile-legends': ['muragoods-direct'],
  'pubg-mobile': ['muragoods-direct'],
  'genshin-impact': ['muragoods-direct'],
  'cod-mobile': ['muragoods-direct'],
  'free-fire': ['muragoods-direct'],
  'roblox': ['muragoods-direct'],
  'valorant': ['muragoods-direct'],
  'steam-wallet': ['muragoods-direct'],
  'google-play': ['muragoods-direct'],
  'apple-itunes': ['muragoods-direct'],
};
