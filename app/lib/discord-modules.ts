// ─── Data-driven definition of every ⚙️ Modules field ─────────────────────────
// The dashboard page renders generically from this registry. Each field's `key`
// is a dot-path into the DiscordGuildConfig document. Selectors (channel/role/
// category/member) resolve via /api/admin/modules?action=... — IDs are stored
// internally; the user only sees names.

export type FieldType =
  | 'toggle'
  | 'channel'
  | 'category'
  | 'role'
  | 'member'
  | 'number'
  | 'text'
  | 'select';

export interface FieldDef {
  key: string;
  label: string;
  icon?: string;
  type: FieldType;
  default: unknown;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string; icon?: string }[];
}

export interface ModuleDef {
  id: string;
  label: string;
  icon: string;
  fields: FieldDef[];
}

// Single owner for "which page configures which module". Previously this map
// was duplicated inside the modules page only, so the overview page could not
// link to a module's own configuration and rendered every module's fields
// inline instead.
export const MODULE_ROUTES: Record<string, string> = {
  music: '/dashboard/music',
  moderation: '/dashboard/moderation',
  security: '/dashboard/security',
  leveling: '/dashboard/leveling',
  economy: '/dashboard/economy',
  fun: '/dashboard/fun',
  tickets: '/dashboard/tickets/center',
  giveaways: '/dashboard/giveaways',
  suggestions: '/dashboard/suggestions',
  reminders: '/dashboard/reminders',
  reputation: '/dashboard/reputation',
  murastream: '/dashboard/murastream',
};

const m = (key: string, label: string, type: FieldType, def: Omit<FieldDef, 'key' | 'label' | 'type'>): FieldDef =>
  ({ key, label, type, ...def });

export const MODULES: ModuleDef[] = [
  // ─── 🎵 Music ────────────────────────────────────────────────────────────
  {
    id: 'music',
    label: 'Music',
    icon: '🎵',
    fields: [
      m('music.musicChannelId', 'Default Music Channel', 'channel', { icon: '🎵', default: '' }),
      m('music.commandsChannelId', 'Music Commands Channel', 'channel', { icon: '🎵', default: '' }),
      m('music.djRoleId', 'DJ Role', 'role', { icon: '🎧', default: '' }),
      m('music.djOnlyMode', 'DJ-Only Mode', 'toggle', { default: false }),
      m('music.defaultVolume', 'Default Volume', 'number', { default: 50, help: '1 – 150' }),
      m('music.twentyFourSeven', '24/7 Mode', 'toggle', { default: false }),
      m('music.autoPlay', 'Auto-Play', 'toggle', { default: false }),
      m('music.autoLeave', 'Auto-Leave', 'toggle', { default: false }),
      m('music.maxQueueSize', 'Max Queue Size', 'number', { default: 10, help: 'Max songs queued' }),
      m('music.voiceChannelRequired', 'Voice Channel Required', 'toggle', { default: true }),
      m('music.nowPlayingChannelId', 'Now Playing Channel', 'channel', { icon: '📺', default: '' }),
      m('music.musicLogsChannelId', 'Music Logs Channel', 'channel', { icon: '📋', default: '' }),
      m('music.enableNowPlayingEmbed', 'Enable Now Playing Embed', 'toggle', { default: true }),
      m('music.enableQueueEmbed', 'Enable Queue Embed', 'toggle', { default: true }),
      m('music.enableMusicButtons', 'Enable Music Buttons', 'toggle', { default: true }),
      m('music.controlMode', 'Who can use music commands?', 'select', {
        default: 'everyone',
        options: [
          { value: 'everyone', label: 'Everyone' },
          { value: 'dj', label: 'DJ Role' },
          { value: 'moderators', label: 'Moderators' },
        ],
      }),
    ],
  },

  // ─── 🛡️ Moderation ──────────────────────────────────────────────────────
  {
    id: 'moderation',
    label: 'Moderation',
    icon: '🛡️',
    fields: [
      m('moderation.modRoleId', 'Moderator Role', 'role', { icon: '🛡️', default: '' }),
      m('moderation.adminRoleId', 'Admin Role', 'role', { icon: '👑', default: '' }),
      m('moderation.logChannelId', 'Moderation Logs', 'channel', { icon: '📋', default: '' }),
      m('moderation.commandsChannelId', 'Mod Commands Channel', 'channel', { icon: '⚡', default: '' }),
      m('moderation.antiSpam', 'Anti-Spam', 'toggle', { default: true }),
      m('securitySettings.antiRaidEnabled', 'Anti-Raid', 'toggle', { default: true }),
      m('moderation.antiLink', 'Anti-Link', 'toggle', { default: false }),
      m('moderation.antiInvite', 'Anti-Invite', 'toggle', { default: false }),
      m('securitySettings.antiNukeEnabled', 'Anti-Nuke', 'toggle', { default: true }),
      m('securitySettings.antiBotEnabled', 'Anti-Bot', 'toggle', { default: true }),
      m('securitySettings.antiWebhookEnabled', 'Anti-Webhook', 'toggle', { default: true }),
      m('securitySettings.antiMassBanEnabled', 'Anti-Mass Ban', 'toggle', { default: true }),
      m('securitySettings.antiMassKickEnabled', 'Anti-Mass Kick', 'toggle', { default: true }),
      m('securitySettings.antiChannelDeletionEnabled', 'Anti-Channel Deletion', 'toggle', { default: true }),
      m('securitySettings.antiRoleDeletionEnabled', 'Anti-Role Deletion', 'toggle', { default: true }),
      m('securitySettings.suspiciousAccountDetectionEnabled', 'Suspicious Account Detection', 'toggle', { default: true }),
      m('moderation.mentionSpam', 'Mention Spam', 'toggle', { default: true }),
      m('moderation.badWordsFilter', 'Bad Words Filter', 'toggle', { default: true }),
      m('moderation.capsFilter', 'Caps Filter', 'toggle', { default: true }),
      m('moderation.duplicateDetection', 'Duplicate Message Detection', 'toggle', { default: false }),
    ],
  },

  // ─── 🔐 Security ─────────────────────────────────────────────────────────
  {
    id: 'security',
    label: 'Security',
    icon: '🔐',
    fields: [
      m('securitySettings.antiRaidEnabled', 'Anti-Raid', 'toggle', { default: true }),
      m('securitySettings.antiNukeEnabled', 'Anti-Nuke', 'toggle', { default: true }),
      m('securitySettings.antiBotEnabled', 'Anti-Bot', 'toggle', { default: true }),
      m('securitySettings.antiWebhookEnabled', 'Anti-Webhook', 'toggle', { default: true }),
      m('securitySettings.antiMassBanEnabled', 'Anti-Mass Ban', 'toggle', { default: true }),
      m('securitySettings.antiMassKickEnabled', 'Anti-Mass Kick', 'toggle', { default: true }),
      m('securitySettings.antiChannelDeletionEnabled', 'Anti-Channel Deletion', 'toggle', { default: true }),
      m('securitySettings.antiRoleDeletionEnabled', 'Anti-Role Deletion', 'toggle', { default: true }),
      m('securitySettings.suspiciousAccountDetectionEnabled', 'Suspicious Account Detection', 'toggle', { default: true }),
      m('securitySettings.raidAlertsChannelId', 'Raid Alerts', 'channel', { icon: '🚨', default: '' }),
      m('securitySettings.verificationChannelId', 'Verification Channel', 'channel', { icon: '✅', default: '' }),
      m('securitySettings.verifiedRoleId', 'Verified Role', 'role', { icon: '🎫', default: '' }),
      m('securitySettings.joinSpikeThreshold', 'Join Spike Threshold', 'number', { default: 8, help: 'Members/joining in 10s' }),
      m('securitySettings.minAccountAgeHours', 'Minimum Account Age', 'number', { default: 24, help: 'Hours' }),
      m('securitySettings.verificationEnabled', 'Enable Verification', 'toggle', { default: false }),
      m('securitySettings.verificationMethod', 'Verification Method', 'select', {
        default: 'captcha',
        options: [
          { value: 'captcha', label: 'Captcha' },
          { value: 'reaction', label: 'Reaction' },
          { value: 'command', label: 'Command' },
        ],
      }),
      m('securitySettings.verificationTimeout', 'Verification Timeout', 'number', { default: 300, help: 'Seconds' }),
      m('securitySettings.autoRoleId', 'Auto Role Assignment', 'role', { icon: '🎀', default: '' }),
    ],
  },

  // ─── 📈 Leveling ─────────────────────────────────────────────────────────
  {
    id: 'leveling',
    label: 'Leveling',
    icon: '📈',
    fields: [
      m('leveling.xpChannelId', 'XP Notifications Channel', 'channel', { icon: '🔔', default: '' }),
      m('leveling.levelUpMessages', 'Level-Up Messages', 'toggle', { default: true }),
      m('leveling.levelUpRoleRewards', 'Level-Up Role Rewards', 'toggle', { default: false }),
      m('leveling.xpPerMessage', 'XP per Message', 'number', { default: 10, help: 'XP' }),
      m('leveling.xpCooldown', 'XP Cooldown', 'number', { default: 30, help: 'Seconds' }),
      m('leveling.xpMultiplier', 'XP Multiplier', 'number', { default: 1.0, help: '1.0 = normal' }),
      m('leveling.enableLeaderboard', 'Enable Leaderboard', 'toggle', { default: true }),
      m('leveling.leaderboardChannelId', 'Leaderboard Channel', 'channel', { icon: '🏆', default: '' }),
      m('leveling.leaderboardPrivacy', 'Leaderboard', 'select', {
        default: 'public',
        options: [
          { value: 'public', label: 'Public' },
          { value: 'private', label: 'Private' },
        ],
      }),
      m('leveling.reward5', 'Level 5 Reward', 'role', { icon: '⭐', default: '' }),
      m('leveling.reward10', 'Level 10 Reward', 'role', { icon: '⭐', default: '' }),
      m('leveling.reward25', 'Level 25 Reward', 'role', { icon: '⭐', default: '' }),
      m('leveling.reward50', 'Level 50 Reward', 'role', { icon: '⭐', default: '' }),
      m('leveling.reward100', 'Level 100 Reward', 'role', { icon: '⭐', default: '' }),
    ],
  },

  // ─── 💰 Economy ──────────────────────────────────────────────────────────
  {
    id: 'economy',
    label: 'Economy',
    icon: '💰',
    fields: [
      m('economy.commandsChannelId', 'Economy Commands Channel', 'channel', { icon: '💵', default: '' }),
      m('economy.currencyName', 'Currency Name', 'text', { default: 'Coins', icon: '💰' }),
      m('economy.currencySymbol', 'Currency Symbol', 'text', { default: '₱', icon: '💰' }),
      m('economy.startingBalance', 'Starting Balance', 'number', { default: 100, icon: '💰' }),
      m('economy.dailyReward', 'Daily Reward', 'number', { default: 50, icon: '📅' }),
      m('economy.weeklyReward', 'Weekly Reward', 'number', { default: 200, icon: '📆' }),
      m('economy.workReward', 'Work Reward', 'number', { default: 25, icon: '⚒️' }),
      m('economy.multiplier', 'Currency Multiplier', 'number', { default: 1.0, help: '1.0 = normal' }),
      m('economy.economyLogsChannelId', 'Economy Logs', 'channel', { icon: '📋', default: '' }),
      m('economy.featureDaily', 'Daily', 'toggle', { default: true }),
      m('economy.featureWeekly', 'Weekly', 'toggle', { default: true }),
      m('economy.featureWork', 'Work', 'toggle', { default: true }),
      m('economy.featureBalance', 'Balance', 'toggle', { default: true }),
      m('economy.featurePay', 'Pay', 'toggle', { default: true }),
      m('economy.featureShop', 'Shop', 'toggle', { default: true }),
      m('economy.featureInventory', 'Inventory', 'toggle', { default: true }),
    ],
  },

  // ─── 🎮 Fun ──────────────────────────────────────────────────────────────
  {
    id: 'fun',
    label: 'Fun',
    icon: '🎮',
    fields: [
      m('fun.commandsChannelId', 'Fun Commands Channel', 'channel', { icon: '🎲', default: '' }),
      m('fun.enableGames', 'Enable Games', 'toggle', { default: true }),
      m('fun.enableTrivia', 'Enable Trivia', 'toggle', { default: true }),
      m('fun.enablePolls', 'Enable Polls', 'toggle', { default: true }),
      m('fun.enableRandomEvents', 'Enable Random Events', 'toggle', { default: true }),
      m('fun.enableMemes', 'Enable Memes', 'toggle', { default: true }),
      m('fun.enableSocial', 'Enable Social Commands', 'toggle', { default: true }),
      m('fun.xpRewards', 'XP Rewards', 'toggle', { default: true }),
      m('fun.economyRewards', 'Economy Rewards', 'toggle', { default: true }),
      m('fun.cooldowns', 'Cooldowns', 'toggle', { default: true }),
      m('fun.dailyLimits', 'Daily Limits', 'toggle', { default: true }),
    ],
  },

  // ─── 🎫 Tickets ──────────────────────────────────────────────────────────
  {
    id: 'tickets',
    label: 'Tickets',
    icon: '🎫',
    fields: [
      m('tickets.categoryId', 'Ticket Category', 'category', { icon: '📁', default: '' }),
      m('tickets.supportRoleId', 'Support Staff Role', 'role', { icon: '🛡️', default: '' }),
      m('tickets.transcriptChannelId', 'Transcript Channel', 'channel', { icon: '📜', default: '' }),
      m('tickets.panelChannelId', 'Ticket Panel', 'channel', { icon: '🎟️', default: '' }),
      m('tickets.autoClose', 'Auto Close', 'toggle', { default: true }),
      m('tickets.closeAfterInactivity', 'Close After Inactivity', 'toggle', { default: true }),
      m('tickets.claimSystem', 'Claim System', 'toggle', { default: true }),
      m('tickets.addRemoveMembers', 'Add/Remove Members', 'toggle', { default: true }),
      m('tickets.transcriptsEnabled', 'Ticket Transcripts', 'toggle', { default: true }),
      m('tickets.rating', 'Ticket Rating', 'toggle', { default: true }),
      m('tickets.types', 'Ticket Types', 'text', {
        default: JSON.stringify([
          { name: 'General Support', emoji: '🎫', color: '#5865F2' },
          { name: 'Billing', emoji: '💳', color: '#e63946' },
          { name: 'Technical Support', emoji: '🛠️', color: '#06d6a0' },
          { name: 'Report', emoji: '🚨', color: '#f72585' },
          { name: 'Other', emoji: '❓', color: '#ffd60a' },
        ], null, 0),
        help: 'JSON array of ticket types',
      }),
    ],
  },

  // ─── 🎁 Giveaways ────────────────────────────────────────────────────────
  {
    id: 'giveaways',
    label: 'Giveaways',
    icon: '🎁',
    fields: [
      m('giveaways.channelId', 'Giveaway Announcement Channel', 'channel', { icon: '🎉', default: '' }),
      m('giveaways.logsChannelId', 'Giveaway Logs', 'channel', { icon: '📋', default: '' }),
      m('giveaways.managerRoleId', 'Giveaway Manager Role', 'role', { icon: '🎁', default: '' }),
      m('giveaways.defaultDuration', 'Default Duration', 'number', { default: 24, help: 'Hours' }),
      m('giveaways.defaultWinners', 'Default Winners', 'number', { default: 1 }),
      m('giveaways.minAccountAge', 'Minimum Account Age', 'number', { default: 0, help: 'Days' }),
      m('giveaways.requiredRoleId', 'Required Role', 'role', { icon: '🔒', default: '' }),
      m('giveaways.requiredLevel', 'Required Level', 'number', { default: 0 }),
      m('giveaways.requiredActivity', 'Required Activity', 'number', { default: 0, help: 'Days active' }),
    ],
  },

  // ─── 💡 Suggestions ──────────────────────────────────────────────────────
  {
    id: 'suggestions',
    label: 'Suggestions',
    icon: '💡',
    fields: [
      m('suggestions.channelId', 'Suggestion Channel', 'channel', { icon: '💡', default: '' }),
      m('suggestions.logsChannelId', 'Suggestion Logs', 'channel', { icon: '📋', default: '' }),
      m('suggestions.managerRoleId', 'Suggestion Manager Role', 'role', { icon: '👔', default: '' }),
      m('suggestions.allowSubmit', 'Submit Suggestions', 'toggle', { default: true }),
      m('suggestions.allowVote', 'Vote', 'toggle', { default: true }),
      m('suggestions.allowComment', 'Comment', 'toggle', { default: true }),
      m('suggestions.allowViewStatus', 'View Status', 'toggle', { default: true }),
    ],
  },

  // ─── ⏰ Reminders ────────────────────────────────────────────────────────
  {
    id: 'reminders',
    label: 'Reminders',
    icon: '⏰',
    fields: [
      m('reminders.channelId', 'Reminder Channel', 'channel', { icon: '⏰', default: '' }),
      m('reminders.logsChannelId', 'Reminder Logs', 'channel', { icon: '📋', default: '' }),
      m('reminders.personal', 'Personal Reminders', 'toggle', { default: true }),
      m('reminders.server', 'Server Reminders', 'toggle', { default: true }),
      m('reminders.recurring', 'Recurring Reminders', 'toggle', { default: true }),
      m('reminders.scheduledAnnouncements', 'Scheduled Announcements', 'toggle', { default: true }),
      m('reminders.allowedRoleIds', 'Server Reminder Permissions', 'text', {
        default: JSON.stringify(['everyone', 'moderator', 'admin']),
        help: 'JSON array of role keys: everyone, moderator, admin, custom',
      }),
    ],
  },

  // ─── ⭐ Reputation ───────────────────────────────────────────────────────
  {
    id: 'reputation',
    label: 'Reputation',
    icon: '⭐',
    fields: [
      m('reputation.channelId', 'Reputation Channel', 'channel', { icon: '⭐', default: '' }),
      m('reputation.logsChannelId', 'Reputation Logs', 'channel', { icon: '📋', default: '' }),
      m('reputation.managerRoleId', 'Reputation Manager Role', 'role', { icon: '👑', default: '' }),
      m('reputation.dailyLimit', 'Daily Reputation Limit', 'number', { default: 5 }),
      m('reputation.cooldown', 'Reputation Cooldown', 'number', { default: 60, help: 'Seconds' }),
      m('reputation.antiAbuse', 'Anti-Abuse Protection', 'toggle', { default: true }),
      m('reputation.reputationLeaderboard', 'Reputation Leaderboard', 'toggle', { default: true }),
      m('reputation.reward100', '100 Rep Reward', 'role', { icon: '🎖️', default: '' }),
      m('reputation.reward500', '500 Rep Reward', 'role', { icon: '🎖️', default: '' }),
      m('reputation.reward1000', '1000 Rep Reward', 'role', { icon: '🏅', default: '' }),
    ],
  },

  // ─── 🎬 Murastream ──────────────────────────────────────────────────────
  {
    id: 'murastream',
    label: 'Murastream',
    icon: '🎬',
    fields: [
      m('murastream.movieChannelId', 'Movie/Anime Notifications', 'channel', { icon: '🎬', default: '' }),
      m('murastream.watchlistChannelId', 'Watchlist Channel', 'channel', { icon: '📺', default: '' }),
      m('murastream.activityLogsChannelId', 'Activity Logs', 'channel', { icon: '📋', default: '' }),
      m('murastream.featureMovies', 'Movies', 'toggle', { default: true }),
      m('murastream.featureAnime', 'Anime', 'toggle', { default: true }),
      m('murastream.featureTv', 'TV Series', 'toggle', { default: true }),
      m('murastream.featureSearch', 'Search', 'toggle', { default: true }),
      m('murastream.featureWatchlist', 'Watchlist', 'toggle', { default: true }),
      m('murastream.featureRecentlyWatched', 'Recently Watched', 'toggle', { default: true }),
      m('murastream.featureTrending', 'Trending', 'toggle', { default: true }),
      m('murastream.featureRecommendations', 'Recommendations', 'toggle', { default: true }),
      m('murastream.featureNotifications', 'Notifications', 'toggle', { default: true }),
      m('murastream.userGenres', 'Favorite Genres', 'text', { default: '', placeholder: 'Action, Comedy...' }),
      m('murastream.userWatchlist', 'Watchlist', 'text', { default: '' }),
      m('murastream.userRecentlyWatched', 'Recently Watched', 'text', { default: '' }),
      m('murastream.userRecommendations', 'Personal Recommendations', 'text', { default: '' }),
    ],
  },
];

// Discord permission bit names used by the PermissionChecker.
export const DISCORD_PERMISSIONS: Record<number, string> = {
  1024: 'View Channels',
  2048: 'Send Messages',
  4096: 'Embed Links',
  8192: 'Attach Files',
  16384: 'Read Message History',
  32768: 'Mention Everyone',
  65536: 'Use Slash Commands',
  268435456: 'Manage Channels',
  536870912: 'Manage Roles',
  1073741824: 'Administrator',
  2147483648: 'Move Members',
  4294967296: 'Change Nickname',
  8589934592: 'Manage Server',
};
