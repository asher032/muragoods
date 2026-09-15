import mongoose from 'mongoose';

// Per-guild MuraBot configuration — written by the web dashboard
// (/dashboard, Discord OAuth), read by the bot on startup and on demand.
// Every field is guild-scoped: Server A's settings never touch Server B's.
const DiscordGuildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  guildName: { type: String, default: '' },
  guildIcon: { type: String, default: '' },

  // ── Module toggles ──────────────────────────────────────────
  modules: {
    music: { type: Boolean, default: true },
    moderation: { type: Boolean, default: true },
    security: { type: Boolean, default: true },
    leveling: { type: Boolean, default: true },
    economy: { type: Boolean, default: true },
    fun: { type: Boolean, default: true },
    tickets: { type: Boolean, default: true },
    giveaways: { type: Boolean, default: true },
    suggestions: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    reputation: { type: Boolean, default: true },
    murastream: { type: Boolean, default: true },
  },

  // ── Music ───────────────────────────────────────────────────
  music: {
    djRoleId: { type: String, default: '' },
    musicChannelId: { type: String, default: '' },
    controlMode: { type: String, enum: ['everyone', 'dj', 'moderators'], default: 'everyone' },
    defaultVolume: { type: Number, default: 50, min: 1, max: 150 },
  },

  // ── Moderation / logging ────────────────────────────────────
  moderation: {
    modRoleId: { type: String, default: '' },
    logChannelId: { type: String, default: '' },
    automodEnabled: { type: Boolean, default: true },
    antiSpam: { type: Boolean, default: true },
    antiInvite: { type: Boolean, default: false },
    antiLink: { type: Boolean, default: false },
    antiCaps: { type: Boolean, default: true },
    capsThreshold: { type: Number, default: 70 },
    mentionThreshold: { type: Number, default: 8 },
    escalation: {
      type: [String],
      default: ['warn', 'timeout', 'timeout', 'kick', 'ban'],
    },
  },

  // ── Welcome ─────────────────────────────────────────────────
  welcome: {
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: '' },
    message: { type: String, default: '👋 Welcome {user} to **{server}**! You are member #{membercount}.' },
    autoRoleId: { type: String, default: '' },
  },

  // ── Tickets ─────────────────────────────────────────────────
  tickets: {
    categoryId: { type: String, default: '' },
    supportRoleId: { type: String, default: '' },
  },

  // ── Notifications ───────────────────────────────────────────
  notifications: {
    channelId: { type: String, default: '' },
    newContent: { type: Boolean, default: false },
    requestUpdates: { type: Boolean, default: false },
  },

  // ── Security ────────────────────────────────────────────────
  securitySettings: {
    antiRaidEnabled: { type: Boolean, default: true },
    joinSpikeThreshold: { type: Number, default: 8, min: 3, max: 50 },
    antiNukeEnabled: { type: Boolean, default: true },
    minAccountAgeHours: { type: Number, default: 24 },
  },

  // ── Giveaways / suggestions defaults ───────────────────────
  community: {
    giveawayChannelId: { type: String, default: '' },
    suggestionChannelId: { type: String, default: '' },
    reportChannelId: { type: String, default: '' },
  },

  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.DiscordGuildConfig
  || mongoose.model('DiscordGuildConfig', DiscordGuildConfigSchema);
