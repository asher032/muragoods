// ─── Game Catalog ──────────────────────────────────────────
// Muragoods Game Top-Up Marketplace
// Each game defines its name, icon, category, regions, account fields, and packages.

export interface GameAccountField {
  id: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'number';
  required?: boolean;
}

export interface GamePackage {
  id: string;
  name: string;
  currency: string;
  amount: number;
  price: number; // customer pays (PHP)
  costPrice?: number; // wholesale cost from provider (PHP)
  popular?: boolean;
  promoPrice?: number;
  badge?: string;
}

// Helper to calculate margin
export function getMargin(pkg: GamePackage): number {
  return pkg.costPrice != null ? pkg.price - pkg.costPrice : 0;
}

export function getMarginPercent(pkg: GamePackage): number {
  return (pkg.costPrice != null && pkg.costPrice > 0) ? Math.round(((pkg.price - pkg.costPrice) / pkg.costPrice) * 100) : 0;
}

export type GameCategory = 'Mobile' | 'PC' | 'Gift Cards' | 'Vouchers';

export interface Game {
  id: string;
  name: string;
  icon: string;
  logoColor: string; // background color for the game card
  category: GameCategory;
  region: string[];
  accountFields: GameAccountField[];
  packages: GamePackage[];
  idGuide: string;
  idGuideSteps: string[];
  active: boolean;
  popular?: boolean; // show in popular section
  new?: boolean; // show "NEW" badge
  promo?: boolean; // show in promotions
}

// ─── Games Database ────────────────────────────────────────

export const GAMES: Game[] = [
  // ── MOBILE GAMES ────────────────────────────────────────
  {
    id: 'mobile-legends',
    name: 'Mobile Legends: Bang Bang',
    icon: '⚔️',
    logoColor: '#1a365d',
    category: 'Mobile',
    region: ['Philippines'],
    accountFields: [
      { id: 'userId', label: 'User ID', placeholder: 'e.g. 123456789', type: 'number', required: true },
      { id: 'zoneId', label: 'Zone ID', placeholder: 'e.g. 1234', type: 'number', required: true },
    ],
    packages: [
      { id: 'ml-50', name: '50 Diamonds', currency: 'Diamonds', amount: 50, price: 49, costPrice: 42 },
      { id: 'ml-100', name: '100 Diamonds', currency: 'Diamonds', amount: 100, price: 99, popular: true, badge: 'POPULAR' },
      { id: 'ml-200', name: '200 Diamonds', currency: 'Diamonds', amount: 200, price: 199, costPrice: 169 },
      { id: 'ml-300', name: '300 Diamonds', currency: 'Diamonds', amount: 300, price: 299, costPrice: 254 },
      { id: 'ml-500', name: '500 Diamonds', currency: 'Diamonds', amount: 500, price: 499, popular: true, badge: 'BEST VALUE' },
      { id: 'ml-1000', name: '1,000 Diamonds', currency: 'Diamonds', amount: 1000, price: 999, costPrice: 849 },
      { id: 'ml-2000', name: '2,000 Diamonds', currency: 'Diamonds', amount: 2000, price: 1999, costPrice: 1699 },
      { id: 'ml-weekly', name: 'Weekly Diamond Pass', currency: 'Diamonds', amount: 60, price: 149, badge: 'DEAL' },
    ],
    idGuide: 'How to find your Mobile Legends ID',
    idGuideSteps: [
      'Open Mobile Legends: Bang Bang',
      'Tap your profile picture (top left corner)',
      'Your User ID is shown under your username',
      'Zone ID is shown next to or below the User ID',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'pubg-mobile',
    name: 'PUBG Mobile',
    icon: '🔫',
    logoColor: '#1a1a2e',
    category: 'Mobile',
    region: ['Philippines'],
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 5123456789', type: 'number', required: true },
    ],
    packages: [
      { id: 'pubg-60', name: '60 UC', currency: 'UC', amount: 60, price: 49, costPrice: 42 },
      { id: 'pubg-150', name: '150 UC', currency: 'UC', amount: 150, price: 120, popular: true, badge: 'POPULAR' },
      { id: 'pubg-300', name: '300 UC', currency: 'UC', amount: 300, price: 240, costPrice: 204 },
      { id: 'pubg-600', name: '600 UC', currency: 'UC', amount: 600, price: 480, popular: true, badge: 'BEST VALUE' },
      { id: 'pubg-1500', name: '1,500 UC', currency: 'UC', amount: 1500, price: 1200, costPrice: 1020 },
      { id: 'pubg-3000', name: '3,000 UC', currency: 'UC', amount: 3000, price: 2400, costPrice: 2040 },
    ],
    idGuide: 'How to find your PUBG Mobile ID',
    idGuideSteps: [
      'Open PUBG Mobile',
      'Tap your profile picture (top left corner)',
      'Your Player ID is shown under your username',
      'It starts with a number like 5123456789',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'genshin-impact',
    name: 'Genshin Impact',
    icon: '🌟',
    logoColor: '#2d1b69',
    category: 'Mobile',
    region: ['Asia', 'Europe', 'America', 'TW/HK/MO'],
    accountFields: [
      { id: 'uid', label: 'UID', placeholder: 'e.g. 801234567', type: 'number', required: true },
      { id: 'server', label: 'Server/Region', placeholder: 'e.g. Asia', required: true },
    ],
    packages: [
      { id: 'gi-60', name: '60 Genesis Crystals', currency: 'Genesis Crystals', amount: 60, price: 49, costPrice: 42 },
      { id: 'gi-300', name: '300 Genesis Crystals', currency: 'Genesis Crystals', amount: 300, price: 249, popular: true, badge: 'POPULAR' },
      { id: 'gi-980', name: '980 Genesis Crystals', currency: 'Genesis Crystals', amount: 980, price: 799, badge: 'BEST VALUE' },
      { id: 'gi-1980', name: '1,980 Genesis Crystals', currency: 'Genesis Crystals', amount: 1980, price: 1599, costPrice: 1359 },
      { id: 'gi-3280', name: '3,280 Genesis Crystals', currency: 'Genesis Crystals', amount: 3280, price: 2599, costPrice: 2209 },
      { id: 'gi-6480', name: '6,480 Genesis Crystals', currency: 'Genesis Crystals', amount: 6480, price: 4999, costPrice: 4249 },
    ],
    idGuide: 'How to find your Genshin Impact UID',
    idGuideSteps: [
      'Open Genshin Impact',
      'Tap the Paimon menu (top left corner)',
      'Your UID is shown at the bottom of the screen',
      'Server/Region is shown next to it (Asia, Europe, etc.)',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'cod-mobile',
    name: 'Call of Duty: Mobile',
    icon: '🎯',
    logoColor: '#2d2d2d',
    category: 'Mobile',
    region: ['Philippines'],
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 1234567890123456', type: 'number', required: true },
    ],
    packages: [
      { id: 'cod-80', name: '80 CP', currency: 'CP', amount: 80, price: 49, costPrice: 42 },
      { id: 'cod-220', name: '220 CP', currency: 'CP', amount: 220, price: 120, popular: true, badge: 'POPULAR' },
      { id: 'cod-540', name: '540 CP', currency: 'CP', amount: 540, price: 299, costPrice: 254 },
      { id: 'cod-1150', name: '1,150 CP', currency: 'CP', amount: 1150, price: 599, badge: 'BEST VALUE' },
      { id: 'cod-2400', name: '2,400 CP', currency: 'CP', amount: 2400, price: 1200, costPrice: 1020 },
    ],
    idGuide: 'How to find your COD Mobile ID',
    idGuideSteps: [
      'Open Call of Duty: Mobile',
      'Go to your Profile (tap your avatar)',
      'The Player ID (UID) is a 15-16 digit number under your name',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'free-fire',
    name: 'Free Fire',
    icon: '🔥',
    logoColor: '#cc3300',
    category: 'Mobile',
    region: ['Philippines'],
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 1234567890', type: 'number', required: true },
    ],
    packages: [
      { id: 'ff-100', name: '100 Diamonds', currency: 'Diamonds', amount: 100, price: 49, costPrice: 42 },
      { id: 'ff-310', name: '310 Diamonds', currency: 'Diamonds', amount: 310, price: 149, popular: true, badge: 'POPULAR' },
      { id: 'ff-520', name: '520 Diamonds', currency: 'Diamonds', amount: 520, price: 249, costPrice: 212 },
      { id: 'ff-1060', name: '1,060 Diamonds', currency: 'Diamonds', amount: 1060, price: 499, badge: 'BEST VALUE' },
      { id: 'ff-2180', name: '2,180 Diamonds', currency: 'Diamonds', amount: 2180, price: 999, costPrice: 849 },
    ],
    idGuide: 'How to find your Free Fire ID',
    idGuideSteps: [
      'Open Free Fire',
      'Tap your profile (top left corner)',
      'The Player ID is shown below your username',
      'It is a 10-digit number',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'roblox',
    name: 'Roblox',
    icon: '🧱',
    logoColor: '#e74c3c',
    category: 'Mobile',
    region: ['Global'],
    accountFields: [
      { id: 'username', label: 'Roblox Username', placeholder: 'e.g. CoolGamer123', required: true },
      { id: 'userId', label: 'User ID (optional)', placeholder: 'e.g. 12345678', type: 'number', required: false },
    ],
    packages: [
      { id: 'rbx-80', name: '80 Robux', currency: 'Robux', amount: 80, price: 49, costPrice: 42 },
      { id: 'rbx-160', name: '160 Robux', currency: 'Robux', amount: 160, price: 99, popular: true, badge: 'POPULAR' },
      { id: 'rbx-400', name: '400 Robux', currency: 'Robux', amount: 400, price: 249, costPrice: 212 },
      { id: 'rbx-800', name: '800 Robux', currency: 'Robux', amount: 800, price: 499, badge: 'BEST VALUE' },
      { id: 'rbx-1700', name: '1,700 Robux', currency: 'Robux', amount: 1700, price: 999, costPrice: 849 },
    ],
    idGuide: 'How to find your Roblox User ID',
    idGuideSteps: [
      'Go to roblox.com and log in',
      'Click the gear icon (top right) → Settings',
      'Your User ID is in the URL: roblox.com/users/[YOUR_ID]/profile',
      'Or share your Roblox Username instead',
    ],
    active: true,
    popular: true,
  },

  // ── PC GAMES ────────────────────────────────────────────
  {
    id: 'valorant',
    name: 'VALORANT',
    icon: '💥',
    logoColor: '#ff4655',
    category: 'PC',
    region: ['Philippines'],
    accountFields: [
      { id: 'riotId', label: 'Riot ID', placeholder: 'e.g. PlayerName#TAG', required: true },
    ],
    packages: [
      { id: 'val-100', name: '100 VP', currency: 'VP', amount: 100, price: 55, costPrice: 47 },
      { id: 'val-200', name: '200 VP', currency: 'VP', amount: 200, price: 110, costPrice: 94 },
      { id: 'val-535', name: '535 VP', currency: 'VP', amount: 535, price: 295, popular: true, badge: 'POPULAR' },
      { id: 'val-1000', name: '1,000 VP', currency: 'VP', amount: 1000, price: 550, badge: 'BEST VALUE' },
      { id: 'val-2050', name: '2,050 VP', currency: 'VP', amount: 2050, price: 1100, costPrice: 935 },
      { id: 'val-5350', name: '5,350 VP', currency: 'VP', amount: 5350, price: 2900, costPrice: 2465 },
    ],
    idGuide: 'How to find your VALORANT Riot ID',
    idGuideSteps: [
      'Open VALORANT',
      'Click your profile (top right corner)',
      'Your Riot ID is shown with a # tag',
      'Example: PlayerName#PH1',
    ],
    active: true,
    popular: true,
  },
  {
    id: 'steam-wallet',
    name: 'Steam Wallet',
    icon: '🎮',
    logoColor: '#1b2838',
    category: 'PC',
    region: ['Philippines'],
    accountFields: [
      { id: 'steamUrl', label: 'Steam Profile URL or Custom URL', placeholder: 'e.g. steamcommunity.com/id/YourName', required: true },
    ],
    packages: [
      { id: 'steam-100', name: '₱100 Wallet', currency: 'Steam Credits', amount: 100, price: 100, costPrice: 95 },
      { id: 'steam-200', name: '₱200 Wallet', currency: 'Steam Credits', amount: 200, price: 200, popular: true, badge: 'POPULAR' },
      { id: 'steam-500', name: '₱500 Wallet', currency: 'Steam Credits', amount: 500, price: 500, badge: 'BEST VALUE' },
      { id: 'steam-1000', name: '₱1,000 Wallet', currency: 'Steam Credits', amount: 1000, price: 1000, costPrice: 950 },
    ],
    idGuide: 'How to find your Steam Profile URL',
    idGuideSteps: [
      'Open Steam and log in',
      'Click your username (top right) → View Profile',
      'Your Steam URL is in the address bar',
      'Example: steamcommunity.com/id/YourCustomURL',
    ],
    active: true,
  },

  // ── GIFT CARDS ──────────────────────────────────────────
  {
    id: 'google-play',
    name: 'Google Play Gift Card',
    icon: '🎁',
    logoColor: '#34a853',
    category: 'Gift Cards',
    region: ['Philippines'],
    accountFields: [
      { id: 'email', label: 'Email for code delivery', placeholder: 'your@email.com', required: true },
    ],
    packages: [
      { id: 'gp-100', name: '₱100 Google Play', currency: 'Credits', amount: 100, price: 100, costPrice: 95 },
      { id: 'gp-300', name: '₱300 Google Play', currency: 'Credits', amount: 300, price: 300, popular: true, badge: 'POPULAR' },
      { id: 'gp-500', name: '₱500 Google Play', currency: 'Credits', amount: 500, price: 500, badge: 'BEST VALUE' },
      { id: 'gp-1000', name: '₱1,000 Google Play', currency: 'Credits', amount: 1000, price: 1000, costPrice: 950 },
    ],
    idGuide: 'Google Play Gift Card is delivered via email',
    idGuideSteps: [
      'Enter your email address',
      'The gift card code will be sent to your email',
      'Open Google Play Store → Redeem → Enter code',
    ],
    active: true,
    new: true,
  },
  {
    id: 'apple-itunes',
    name: 'Apple iTunes Gift Card',
    icon: '🍎',
    logoColor: '#555',
    category: 'Gift Cards',
    region: ['Philippines'],
    accountFields: [
      { id: 'email', label: 'Email for code delivery', placeholder: 'your@email.com', required: true },
    ],
    packages: [
      { id: 'itunes-500', name: '₱500 iTunes', currency: 'Credits', amount: 500, price: 500, popular: true, badge: 'POPULAR' },
      { id: 'itunes-1000', name: '₱1,000 iTunes', currency: 'Credits', amount: 1000, price: 1000, badge: 'BEST VALUE' },
      { id: 'itunes-2000', name: '₱2,000 iTunes', currency: 'Credits', amount: 2000, price: 2000, costPrice: 1900 },
    ],
    idGuide: 'Apple iTunes Gift Card is delivered via email',
    idGuideSteps: [
      'Enter your email address',
      'The gift card code will be sent to your email',
      'Open App Store → Redeem Gift Card → Enter code',
    ],
    active: true,
    new: true,
  },
];

// ─── Payment Methods ───────────────────────────────────────
export interface PaymentMethodOption {
  id: string;
  name: string;
  icon: string;
  type: 'online' | 'cash' | 'ewallet';
}

export const TOPUP_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: 'gcash', name: 'GCash', icon: '🏦', type: 'ewallet' },
  { id: 'maya', name: 'Maya', icon: '💳', type: 'ewallet' },
  { id: 'grabpay', name: 'GrabPay', icon: '🚗', type: 'ewallet' },
  { id: 'card', name: 'Credit / Debit Card', icon: '💳', type: 'online' },
  { id: 'bpi', name: 'BPI Online', icon: '🏦', type: 'online' },
  { id: 'bdo', name: 'BDO Online', icon: '🏦', type: 'online' },
  { id: 'cod', name: 'Cash on Delivery', icon: '💵', type: 'cash' },
];

// ─── Order Statuses ────────────────────────────────────────
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refund_pending'
  | 'refund_processing'
  | 'refunded'
  | 'refund_failed';

export type TopUpStatus =
  | 'pending'
  | 'pending_fulfillment'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'manual_review';

export type OrderStatus =
  | 'pending'
  | 'payment_pending'
  | 'payment_processing'
  | 'paid'
  | 'topup_processing'
  | 'success'
  | 'failed'
  | 'payment_failed'
  | 'payment_expired'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed';

export function getPaymentStatusColor(status: PaymentStatus): string {
  switch (status) {
    case 'paid': return '#06d6a0';
    case 'processing': return '#ffd60a';
    case 'pending': return '#888';
    case 'failed': case 'expired': case 'cancelled': return '#e63946';
    case 'refund_pending': case 'refund_processing': return '#f59e0b';
    case 'refunded': return '#4895ef';
    case 'refund_failed': return '#e63946';
    default: return '#888';
  }
}

export function getTopUpStatusColor(status: TopUpStatus): string {
  switch (status) {
    case 'completed': return '#06d6a0';
    case 'processing': return '#ffd60a';
    case 'pending_fulfillment': return '#f59e0b';
    case 'pending': return '#888';
    case 'failed': case 'manual_review': return '#e63946';
    default: return '#888';
  }
}

export function getOrderStatusColor(status: string): string {
  if (status.includes('success') || status === 'paid') return '#06d6a0';
  if (status.includes('processing')) return '#ffd60a';
  if (status.includes('pending')) return '#888';
  if (status.includes('fail') || status.includes('cancel') || status.includes('expired')) return '#e63946';
  if (status.includes('refund')) return '#f59e0b';
  return '#888';
}

export function getGameById(id: string): Game | undefined {
  return GAMES.find(g => g.id === id);
}

export function getGamesByCategory(category: GameCategory): Game[] {
  return GAMES.filter(g => g.active && g.category === category);
}

export function getPopularGames(): Game[] {
  return GAMES.filter(g => g.active && g.popular);
}

export function getPromoGames(): Game[] {
  return GAMES.filter(g => g.active && g.promo);
}

export function getNewGames(): Game[] {
  return GAMES.filter(g => g.active && g.new);
}

export function searchGames(query: string): Game[] {
  const q = query.toLowerCase();
  return GAMES.filter(g => g.active && (
    g.name.toLowerCase().includes(q) ||
    g.category.toLowerCase().includes(q) ||
    g.id.includes(q)
  ));
}
