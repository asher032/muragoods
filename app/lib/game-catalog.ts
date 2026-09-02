// ─── Game Catalog ──────────────────────────────────────────
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
  price: number; // in PHP
  popular?: boolean;
}

export interface Game {
  id: string;
  name: string;
  icon: string; // emoji or URL
  category: 'MOBA' | 'Battle Royale' | 'RPG' | 'FPS' | 'Strategy' | 'Sports' | 'Casual';
  region: string;
  accountFields: GameAccountField[];
  packages: GamePackage[];
  idGuide: string; // How to find the account ID
  active: boolean;
}

export const GAMES: Game[] = [
  {
    id: 'mobile-legends',
    name: 'Mobile Legends: Bang Bang',
    icon: '⚔️',
    category: 'MOBA',
    region: 'Philippines',
    accountFields: [
      { id: 'userId', label: 'User ID', placeholder: 'e.g. 123456789', type: 'number', required: true },
      { id: 'zoneId', label: 'Zone ID', placeholder: 'e.g. 1234', type: 'number', required: true },
    ],
    packages: [
      { id: 'ml-50', name: '50 Diamonds', currency: 'Diamonds', amount: 50, price: 49 },
      { id: 'ml-100', name: '100 Diamonds', currency: 'Diamonds', amount: 100, price: 99, popular: true },
      { id: 'ml-200', name: '200 Diamonds', currency: 'Diamonds', amount: 200, price: 199 },
      { id: 'ml-300', name: '300 Diamonds', currency: 'Diamonds', amount: 300, price: 299 },
      { id: 'ml-500', name: '500 Diamonds', currency: 'Diamonds', amount: 500, price: 499, popular: true },
      { id: 'ml-1000', name: '1,000 Diamonds', currency: 'Diamonds', amount: 1000, price: 999 },
      { id: 'ml-2000', name: '2,000 Diamonds', currency: 'Diamonds', amount: 2000, price: 1999 },
      { id: 'ml-weekly', name: 'Weekly Diamond Pass', currency: 'Diamonds', amount: 60, price: 149 },
    ],
    idGuide: 'Open Mobile Legends → Tap your profile picture (top left) → Your User ID and Zone ID are shown under your name.',
    active: true,
  },
  {
    id: 'pubg-mobile',
    name: 'PUBG Mobile',
    icon: '🔫',
    category: 'Battle Royale',
    region: 'Philippines',
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 5123456789', type: 'number', required: true },
    ],
    packages: [
      { id: 'pubg-60', name: '60 UC', currency: 'UC', amount: 60, price: 49 },
      { id: 'pubg-150', name: '150 UC', currency: 'UC', amount: 150, price: 120, popular: true },
      { id: 'pubg-300', name: '300 UC', currency: 'UC', amount: 300, price: 240 },
      { id: 'pubg-600', name: '600 UC', currency: 'UC', amount: 600, price: 480, popular: true },
      { id: 'pubg-1500', name: '1,500 UC', currency: 'UC', amount: 1500, price: 1200 },
      { id: 'pubg-3000', name: '3,000 UC', currency: 'UC', amount: 3000, price: 2400 },
    ],
    idGuide: 'Open PUBG Mobile → Tap your profile (top left) → The Player ID is shown under your username. It starts with a number like 5123456789.',
    active: true,
  },
  {
    id: 'genshin-impact',
    name: 'Genshin Impact',
    icon: '🌟',
    category: 'RPG',
    region: 'Multiple Regions',
    accountFields: [
      { id: 'uid', label: 'UID', placeholder: 'e.g. 801234567', type: 'number', required: true },
      { id: 'server', label: 'Server/Region', placeholder: 'e.g. Asia', required: true },
    ],
    packages: [
      { id: 'gi-60', name: '60 Genesis Crystals', currency: 'Genesis Crystals', amount: 60, price: 49 },
      { id: 'gi-300', name: '300 Genesis Crystals', currency: 'Genesis Crystals', amount: 300, price: 249, popular: true },
      { id: 'gi-980', name: '980 Genesis Crystals', currency: 'Genesis Crystals', amount: 980, price: 799, popular: true },
      { id: 'gi-1980', name: '1,980 Genesis Crystals', currency: 'Genesis Crystals', amount: 1980, price: 1599 },
      { id: 'gi-3280', name: '3,280 Genesis Crystals', currency: 'Genesis Crystals', amount: 3280, price: 2599 },
      { id: 'gi-6480', name: '6,480 Genesis Crystals', currency: 'Genesis Crystals', amount: 6480, price: 4999 },
    ],
    idGuide: 'Open Genshin Impact → Tap the Paimon menu (top left) → Your UID is shown at the bottom. Server is shown next to it (Asia, Europe, etc.).',
    active: true,
  },
  {
    id: 'cod-mobile',
    name: 'Call of Duty: Mobile',
    icon: '🎯',
    category: 'FPS',
    region: 'Philippines',
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 1234567890123456', type: 'number', required: true },
    ],
    packages: [
      { id: 'cod-80', name: '80 CP', currency: 'CP', amount: 80, price: 49 },
      { id: 'cod-220', name: '220 CP', currency: 'CP', amount: 220, price: 120, popular: true },
      { id: 'cod-540', name: '540 CP', currency: 'CP', amount: 540, price: 299 },
      { id: 'cod-1150', name: '1,150 CP', currency: 'CP', amount: 1150, price: 599, popular: true },
      { id: 'cod-2400', name: '2,400 CP', currency: 'CP', amount: 2400, price: 1200 },
    ],
    idGuide: 'Open COD Mobile → Go to your Profile → The Player ID (UID) is a 15-16 digit number shown under your name.',
    active: true,
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    icon: '💥',
    category: 'FPS',
    region: 'Philippines',
    accountFields: [
      { id: 'riotId', label: 'Riot ID', placeholder: 'e.g. PlayerName#TAG', required: true },
    ],
    packages: [
      { id: 'val-100', name: '100 VP', currency: 'VP', amount: 100, price: 55 },
      { id: 'val-200', name: '200 VP', currency: 'VP', amount: 200, price: 110 },
      { id: 'val-535', name: '535 VP', currency: 'VP', amount: 535, price: 295, popular: true },
      { id: 'val-1000', name: '1,000 VP', currency: 'VP', amount: 1000, price: 550, popular: true },
      { id: 'val-2050', name: '2,050 VP', currency: 'VP', amount: 2050, price: 1100 },
      { id: 'val-5350', name: '5,350 VP', currency: 'VP', amount: 5350, price: 2900 },
    ],
    idGuide: 'Open VALORANT → Click your profile (top right) → Your Riot ID is shown with a # tag (e.g. PlayerName#PH1).',
    active: true,
  },
  {
    id: 'roblox',
    name: 'Roblox',
    icon: '🧱',
    category: 'Casual',
    region: 'Global',
    accountFields: [
      { id: 'username', label: 'Roblox Username', placeholder: 'e.g. CoolGamer123', required: true },
      { id: 'userId', label: 'User ID (optional)', placeholder: 'e.g. 12345678', type: 'number', required: false },
    ],
    packages: [
      { id: 'rbx-80', name: '80 Robux', currency: 'Robux', amount: 80, price: 49 },
      { id: 'rbx-160', name: '160 Robux', currency: 'Robux', amount: 160, price: 99, popular: true },
      { id: 'rbx-400', name: '400 Robux', currency: 'Robux', amount: 400, price: 249 },
      { id: 'rbx-800', name: '800 Robux', currency: 'Robux', amount: 800, price: 499, popular: true },
      { id: 'rbx-1700', name: '1,700 Robux', currency: 'Robux', amount: 1700, price: 999 },
    ],
    idGuide: 'Go to roblox.com → Log in → Click the gear icon (top right) → Settings → Your User ID is in the URL: roblox.com/users/[YOUR_ID]/profile.',
    active: true,
  },
  {
    id: 'steam-wallet',
    name: 'Steam Wallet',
    icon: '🎮',
    category: 'Strategy',
    region: 'Philippines',
    accountFields: [
      { id: 'steamId', label: 'Steam ID or Custom URL', placeholder: 'e.g. steamcommunity.com/id/YourName', required: true },
    ],
    packages: [
      { id: 'steam-100', name: '₱100 Wallet', currency: 'Steam Credits', amount: 100, price: 100 },
      { id: 'steam-200', name: '₱200 Wallet', currency: 'Steam Credits', amount: 200, price: 200, popular: true },
      { id: 'steam-500', name: '₱500 Wallet', currency: 'Steam Credits', amount: 500, price: 500, popular: true },
      { id: 'steam-1000', name: '₱1,000 Wallet', currency: 'Steam Credits', amount: 1000, price: 1000 },
    ],
    idGuide: 'Open Steam → Click your username (top right) → View Profile → Your Steam URL or ID is shown. Example: steamcommunity.com/id/YourCustomURL',
    active: true,
  },
  {
    id: 'free-fire',
    name: 'Free Fire',
    icon: '🔥',
    category: 'Battle Royale',
    region: 'Philippines',
    accountFields: [
      { id: 'playerId', label: 'Player ID', placeholder: 'e.g. 1234567890', type: 'number', required: true },
    ],
    packages: [
      { id: 'ff-100', name: '100 Diamonds', currency: 'Diamonds', amount: 100, price: 49 },
      { id: 'ff-310', name: '310 Diamonds', currency: 'Diamonds', amount: 310, price: 149, popular: true },
      { id: 'ff-520', name: '520 Diamonds', currency: 'Diamonds', amount: 520, price: 249 },
      { id: 'ff-1060', name: '1,060 Diamonds', currency: 'Diamonds', amount: 1060, price: 499, popular: true },
      { id: 'ff-2180', name: '2,180 Diamonds', currency: 'Diamonds', amount: 2180, price: 999 },
    ],
    idGuide: 'Open Free Fire → Tap your profile (top left) → The Player ID is shown below your username. It is a 10-digit number.',
    active: true,
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
  { id: 'card', name: 'Credit/Debit Card', icon: '💳', type: 'online' },
  { id: 'bpi', name: 'BPI', icon: '🏦', type: 'online' },
  { id: 'bdo', name: 'BDO', icon: '🏦', type: 'online' },
  { id: 'cod', name: 'Cash on Delivery', icon: '💵', type: 'cash' },
];

// ─── Payment Statuses ──────────────────────────────────────
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
  | 'processing'
  | 'completed'
  | 'failed'
  | 'manual_review';

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
    case 'pending': return '#888';
    case 'failed': case 'manual_review': return '#e63946';
    default: return '#888';
  }
}

export function getGameById(id: string): Game | undefined {
  return GAMES.find(g => g.id === id);
}
