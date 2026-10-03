// ─────────────────────────────────────────────────────────────────────────
// THE FEATURE REGISTRY.
//
// "Add the missing controls" is only actionable if you can first SEE what
// exists and where each thing is administered. So every feature in the
// Muragoods ecosystem is listed once, here, with the four access levels and
// the machinery behind it.
//
// This is a real inventory, not decoration: scripts/check-admin-coverage.mjs
// fails the build if a feature is claimed to be manageable but has no admin
// surface, and if an area of the product exists with no registry entry at
// all. A feature that appears on the website but has no admin control is a
// VISIBLE GAP, not an undocumented one.
//
//   user            a signed-in member
//   serverAdmin     a Discord admin of that specific server (guild-scoped)
//   staff           Muragoods staff holding the named scope
//   owner           the Muragoods owner — full ecosystem control
//
// `adminSurface` is where the owner manages it. A feature with no owner path
// is either intentionally user-owned (face value: false) or a gap.
// ─────────────────────────────────────────────────────────────────────────

export type AccessLevelName = 'user' | 'serverAdmin' | 'staff' | 'owner';

export interface FeatureEntry {
  /** Stable id — the thing tests and the admin UI refer to. */
  id: string;
  area: 'website' | 'murastream' | 'shop' | 'letters' | 'games' | 'economy' | 'murabot' | 'account';
  feature: string;
  /** What a signed-in member can do. */
  user: 'none' | 'read' | 'use';
  /** What a Discord admin of that server can do. */
  serverAdmin: 'none' | 'guildConfig' | 'read';
  /** Muragoods staff scope that grants access, when any. */
  staffScope?: 'support' | 'moderation' | 'content' | 'shop' | 'murastream' | 'economy' | 'technical' | 'analytics';
  /** Owner access — always yes for anything in this registry. */
  owner: 'manage' | 'read';
  /** Where the owner manages it. */
  adminSurface: string;
  /** Canonical API, when one exists. */
  api?: string;
  /** Canonical storage. */
  store?: string;
  /** Who consumes it at runtime. */
  runtime?: string;
  /** False for features that are genuinely user-owned (a face value, a review). */
  ownerManageable?: false;
}

export const FEATURES: FeatureEntry[] = [
  // ── Website ────────────────────────────────────────────────────────────
  { id: 'site.homepage', area: 'website', feature: 'Homepage', user: 'use', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin', api: '/api/products' },
  { id: 'site.navigation', area: 'website', feature: 'Navigation & menu', user: 'use', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin/website' },
  { id: 'site.settings', area: 'website', feature: 'Site settings & configuration', user: 'none', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin/website', api: '/api/admin/site-flags', store: 'SiteFlag', runtime: 'Next.js middleware + pages' },
  { id: 'site.branding', area: 'website', feature: 'Branding, logo and theme', user: 'use', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin/website' },
  { id: 'site.announcements', area: 'website', feature: 'Announcements', user: 'read', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/website', store: 'SiteFlag' },
  { id: 'site.maintenance', area: 'website', feature: 'Maintenance mode', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/website', api: '/api/admin/site-flags', store: 'SiteFlag', runtime: 'ContentLockGate' },
  { id: 'site.flags', area: 'website', feature: 'Feature flags', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/website', api: '/api/admin/site-flags', store: 'SiteFlag' },
  { id: 'site.faq', area: 'website', feature: 'FAQ', user: 'read', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/website' },
  { id: 'site.policies', area: 'website', feature: 'Policies (terms, privacy)', user: 'read', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/website' },
  { id: 'site.support', area: 'website', feature: 'Contact & support queue', user: 'use', serverAdmin: 'none', staffScope: 'support', owner: 'manage', adminSurface: '/admin/support', api: '/api/support', store: 'SupportTicket' },
  { id: 'site.reviews', area: 'website', feature: 'Reviews & ratings', user: 'use', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin', store: 'Review', ownerManageable: false },
  { id: 'site.users', area: 'website', feature: 'Users & accounts', user: 'none', serverAdmin: 'none', staffScope: 'support', owner: 'manage', adminSurface: '/admin/users', api: '/api/admin/users', store: 'User' },
  { id: 'site.sessions', area: 'website', feature: 'Sessions & security', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/users', api: '/api/admin/delete-user', store: 'DiscordSession' },
  { id: 'site.audit', area: 'website', feature: 'Audit logs', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'read', adminSurface: '/admin/settings', store: 'DashboardAudit' },
  { id: 'site.analytics', area: 'website', feature: 'Site analytics', user: 'none', serverAdmin: 'read', staffScope: 'analytics', owner: 'read', adminSurface: '/admin/analytics', api: '/api/admin/analytics' },
  { id: 'site.health', area: 'website', feature: 'System health', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'read', adminSurface: '/admin/health', api: '/api/admin/system-health' },

  // ── Murastream ────────────────────────────────────────────────────────
  { id: 'stream.catalog', area: 'murastream', feature: 'Movies, series, anime, K-dramas (catalog)', user: 'use', serverAdmin: 'none', staffScope: 'murastream', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/murastream/tmdb', store: 'baked-catalog + TMDB', runtime: 'Murastream catalog pages' },
  { id: 'stream.search', area: 'murastream', feature: 'Search & genres', user: 'use', serverAdmin: 'none', staffScope: 'murastream', owner: 'manage', adminSurface: '/admin/murastream' },
  { id: 'stream.legalCatalog', area: 'murastream', feature: 'Free / Legal catalog filter (licence + attribution)', user: 'use', serverAdmin: 'none', staffScope: 'murastream', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/murastream/legal', store: 'playback source registry rights fields', runtime: 'Free/Legal page' },
  { id: 'stream.playback', area: 'murastream', feature: 'Playback configuration & authorized sources', user: 'none', serverAdmin: 'none', staffScope: 'murastream', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/admin/murastream', store: 'FIRST_PARTY_MANIFEST', runtime: 'playback resolver' },
  { id: 'stream.health', area: 'murastream', feature: 'Playback health & resolver diagnostics', user: 'none', serverAdmin: 'none', staffScope: 'murastream', owner: 'read', adminSurface: '/admin/health', api: '/api/murastream/playback/health' },
  { id: 'stream.tmdb', area: 'murastream', feature: 'TMDB configuration', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/website', api: '/api/murastream/tmdb', store: 'TMDB_API_KEY' },
  { id: 'stream.watchlists', area: 'murastream', feature: 'My list & watchlist', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/users', api: '/api/murastream/library', store: 'UserLibrary' },
  { id: 'stream.favorites', area: 'murastream', feature: 'Favorites & likes', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/users', api: '/api/favorites', store: 'UserLibrary' },
  { id: 'stream.history', area: 'murastream', feature: 'Watch history & continue watching', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/users', store: 'UserLibrary' },
  { id: 'stream.requests', area: 'murastream', feature: 'Content requests', user: 'use', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/murastream/requests', store: 'SiteFlag-backed request list' },
  { id: 'stream.comments', area: 'murastream', feature: 'Comments', user: 'use', serverAdmin: 'none', staffScope: 'moderation', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/murastream/comments', store: 'MediaComment' },
  { id: 'stream.availability', area: 'murastream', feature: 'Content availability', user: 'none', serverAdmin: 'none', staffScope: 'murastream', owner: 'manage', adminSurface: '/admin/murastream', api: '/api/admin/site-flags', store: 'SiteFlag' },

  // ── Shop / food ───────────────────────────────────────────────────────
  { id: 'shop.products', area: 'shop', feature: 'Products, categories, prices', user: 'use', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin', api: '/api/products', store: 'products.json + Product' },
  { id: 'shop.inventory', area: 'shop', feature: 'Inventory & availability', user: 'read', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin', api: '/api/products' },
  { id: 'shop.orders', area: 'shop', feature: 'Orders & order status', user: 'use', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin/delivered', api: '/api/orders', store: 'Order' },
  { id: 'shop.payments', area: 'shop', feature: 'Payment configuration & verification', user: 'none', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin/settings', store: 'env credentials' },
  { id: 'shop.promotions', area: 'shop', feature: 'Discounts, promotions, promo codes', user: 'use', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin/promo-codes', api: '/api/promo-codes', store: 'PromoCode' },
  { id: 'shop.customers', area: 'shop', feature: 'Shop customers & group orders', user: 'use', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin', api: '/api/orders', store: 'Order, GroupOrder' },
  { id: 'shop.refunds', area: 'shop', feature: 'Refund & admin order workflows', user: 'none', serverAdmin: 'none', staffScope: 'shop', owner: 'manage', adminSurface: '/admin/delivered', api: '/api/orders', store: 'Order' },

  // ── Letters / Untold Words ────────────────────────────────────────────
  { id: 'letters.manage', area: 'letters', feature: 'Letters (anonymous, virtual, song-based)', user: 'use', serverAdmin: 'none', staffScope: 'moderation', owner: 'manage', adminSurface: '/admin/letters', api: '/api/unsent', store: 'UnsentLetter' },
  { id: 'letters.moderation', area: 'letters', feature: 'Letter moderation & reports', user: 'none', serverAdmin: 'none', staffScope: 'moderation', owner: 'manage', adminSurface: '/admin/letters', store: 'UnsentLetter' },
  { id: 'letters.privacy', area: 'letters', feature: 'Letter privacy boundary', user: 'none', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/letters', ownerManageable: false },

  // ── Games ─────────────────────────────────────────────────────────────
  { id: 'games.config', area: 'games', feature: 'Games, game configuration & availability', user: 'use', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/games', api: '/api/admin/games', store: 'GameProgress, GameSession' },
  { id: 'games.scores', area: 'games', feature: 'Scores & leaderboards', user: 'use', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/games', store: 'GameProgress, GameReward' },
  { id: 'games.rewards', area: 'games', feature: 'Game rewards', user: 'use', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/games', store: 'GameReward' },
  { id: 'games.anticheat', area: 'games', feature: 'Anti-cheat & admin game controls', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/games', api: '/api/admin/players' },
  { id: 'games.accounts', area: 'games', feature: 'Connected Discord accounts for games', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/users', api: '/api/account/discord', store: 'User.linkedAccounts' },
  { id: 'games.saves', area: 'games', feature: 'Server-side game saves (cross-device)', user: 'use', serverAdmin: 'none', staffScope: 'content', owner: 'manage', adminSurface: '/admin/games', api: '/api/games/trivia/save', store: 'GameSave', runtime: 'play pages via useGameSave' },
  { id: 'games.saves.trust', area: 'games', feature: 'Save-vs-reward boundary (a save never pays)', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'read', adminSurface: '/admin/registry' },

  // ── Economy ───────────────────────────────────────────────────────────
  { id: 'economy.currency', area: 'economy', feature: 'Currency & balances', user: 'none', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/admin/coins', store: 'User.coinBalance' },
  { id: 'economy.transactions', area: 'economy', feature: 'Transactions & ledger', user: 'read', serverAdmin: 'read', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/dashboard/economy/read', store: 'economy transactions' },
  { id: 'economy.config', area: 'economy', feature: 'Economy configuration & anti-exploit', user: 'none', serverAdmin: 'guildConfig', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/dashboard/economy', store: 'guild_config.economy' },
  { id: 'economy.shop', area: 'economy', feature: 'Economy shop, items, rarities, prices, sell values', user: 'use', serverAdmin: 'guildConfig', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', store: 'item catalog' },
  { id: 'economy.jobs', area: 'economy', feature: 'Jobs, rewards, cooldowns', user: 'use', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/jobs/config' },
  { id: 'economy.trading', area: 'economy', feature: 'Trading, lottery, achievements, minigames', user: 'use', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy' },
  { id: 'economy.health', area: 'economy', feature: 'Economy health & logs', user: 'none', serverAdmin: 'read', staffScope: 'economy', owner: 'read', adminSurface: '/admin/health' },
  { id: 'points.ledger', area: 'economy', feature: 'Points ledger (transaction id, source, reason)', user: 'read', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/account/points', store: 'PointsTransaction' },
  { id: 'inventory.owned', area: 'economy', feature: 'Unified inventory (owned items)', user: 'use', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/account/inventory', store: 'InventoryItem' },

  // ── Murabot ───────────────────────────────────────────────────────────
  { id: 'murabot.prefix', area: 'murabot', feature: 'Command prefix', user: 'none', serverAdmin: 'guildConfig', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/admin/murabot', store: 'guild_config.prefix', runtime: 'Murabot command handler' },
  { id: 'murabot.commands', area: 'murabot', feature: 'Slash & prefix command configuration', user: 'none', serverAdmin: 'guildConfig', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/commands', runtime: 'Murabot command tree' },
  { id: 'murabot.moderation', area: 'murabot', feature: 'Moderation & AutoMod', user: 'none', serverAdmin: 'guildConfig', staffScope: 'moderation', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/moderation', store: 'guild_config.moderation' },
  { id: 'murabot.security', area: 'murabot', feature: 'Security, anti-raid, verification, lockdown', user: 'none', serverAdmin: 'guildConfig', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/moderation/lockdown', store: 'guild_config.securitySettings' },
  { id: 'murabot.logging', area: 'murabot', feature: 'Logging channels', user: 'none', serverAdmin: 'guildConfig', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/murabot', store: 'guild_config.*ChannelId' },
  { id: 'murabot.music', area: 'murabot', feature: 'Music service', user: 'use', serverAdmin: 'guildConfig', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/music', store: 'guild_config.music' },
  { id: 'murabot.leveling', area: 'murabot', feature: 'Leveling & level-card themes', user: 'use', serverAdmin: 'guildConfig', staffScope: 'content', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/leveling/overview', store: 'guild_config.leveling' },
  { id: 'murabot.tickets', area: 'murabot', feature: 'Tickets', user: 'use', serverAdmin: 'guildConfig', staffScope: 'support', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/tickets/settings' },
  { id: 'murabot.giveaways', area: 'murabot', feature: 'Giveaways', user: 'use', serverAdmin: 'guildConfig', staffScope: 'content', owner: 'manage', adminSurface: '/admin/murabot', api: '/api/dashboard/config', store: 'guild_config.giveaways' },
  { id: 'murabot.community', area: 'murabot', feature: 'Suggestions, reminders, reputation, fun', user: 'use', serverAdmin: 'guildConfig', staffScope: 'content', owner: 'manage', adminSurface: '/admin/murabot', store: 'guild_config.community' },
  { id: 'murabot.health', area: 'murabot', feature: 'Bot health, gateway, shards, latency, errors', user: 'none', serverAdmin: 'read', staffScope: 'technical', owner: 'read', adminSurface: '/admin/health', api: '/api/admin/system-health', store: 'Murabot /bot/status' },
  { id: 'murabot.deploy', area: 'murabot', feature: 'Bot deployment & version', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/settings', api: '/api/admin/system-health' },
  { id: 'murabot.bridge', area: 'murabot', feature: 'Muragoods ↔ Murabot bridge', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'manage', adminSurface: '/admin/settings', store: 'DISCORD_BRIDGE_SECRET' },

  // ── Account ───────────────────────────────────────────────────────────
  { id: 'account.profile', area: 'account', feature: 'Profile, display name, avatar', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin/users', api: '/api/account/profile', store: 'User' },
  { id: 'account.identity', area: 'account', feature: 'Canonical identity (one userId)', user: 'use', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin/users', api: '/api/me', store: 'User.userId', ownerManageable: false },
  { id: 'account.space', area: 'account', feature: 'My Space aggregation', user: 'use', serverAdmin: 'none', owner: 'read', adminSurface: '/admin', api: '/api/account/my-space' },
  { id: 'account.points', area: 'account', feature: 'Points & rewards', user: 'use', serverAdmin: 'none', staffScope: 'economy', owner: 'manage', adminSurface: '/admin/economy', api: '/api/account/points' },
  { id: 'account.orders', area: 'account', feature: 'Order history', user: 'read', serverAdmin: 'none', staffScope: 'shop', owner: 'read', adminSurface: '/admin/delivered', api: '/api/orders' },
  { id: 'account.support', area: 'account', feature: 'Support tickets', user: 'use', serverAdmin: 'none', staffScope: 'support', owner: 'manage', adminSurface: '/admin/support', api: '/api/support', store: 'SupportTicket' },
  { id: 'account.staff', area: 'account', feature: 'Staff scopes & access levels', user: 'none', serverAdmin: 'none', owner: 'manage', adminSurface: '/admin/staff', api: '/api/admin/staff', store: 'User.staffScopes' },
  { id: 'account.trace', area: 'account', feature: 'Cross-system identity trace', user: 'none', serverAdmin: 'none', staffScope: 'technical', owner: 'read', adminSurface: '/admin/trace', api: '/api/admin/trace' },
];

export const FEATURE_AREAS: FeatureEntry['area'][] = [
  'website', 'murastream', 'shop', 'letters', 'games', 'economy', 'murabot', 'account',
];

/** Features the owner can actually change (as opposed to features they can only read). */
export function manageableFeatures(): FeatureEntry[] {
  return FEATURES.filter((f) => f.owner === 'manage' && f.ownerManageable !== false);
}

/** Everything that exists but has no owner-side management surface. */
export function readOnlyFeatures(): FeatureEntry[] {
  return FEATURES.filter((f) => f.owner === 'read' || f.ownerManageable === false);
}

/** Surfaces a feature declares but that do not exist as an admin page or API. */
export function declaredAdminSurfaces(): string[] {
  return [...new Set(FEATURES.map((f) => f.adminSurface))].sort();
}
