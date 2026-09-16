import mongoose, { Schema, type Model } from 'mongoose';

// Server-side MuraGoods session. The browser only ever holds the opaque
// sessionId cookie — access/refresh tokens and guild context live here.
export interface IDiscordSession {
  sessionId: string;          // random 256-bit hex, the cookie value
  discordId: string;
  username: string;
  globalName?: string;
  avatar: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;       // Discord access-token expiry (~7 days)
  guilds: {                   // manageable guilds snapshot at login (re-verified per request)
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
  }[];
  selectedGuildId: string | null;
  lastAuthAt: Date;
  lastSeenAt: Date;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GuildSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    icon: { type: String, default: null },
    owner: { type: Boolean, default: false },
  },
  { _id: false },
);

const DiscordSessionSchema = new Schema<IDiscordSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    discordId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    globalName: { type: String, default: '' },
    avatar: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
    guilds: { type: [GuildSchema], default: [] },
    selectedGuildId: { type: String, default: null },
    lastAuthAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'discord_sessions' },
);

// Sliding 30-day window: lastSeenAt is bumped on authenticated use, and this
// TTL index deletes sessions idle for 30 days.
DiscordSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const DiscordSession: Model<IDiscordSession> =
  (mongoose.models.DiscordSession as Model<IDiscordSession>) ||
  mongoose.model<IDiscordSession>('DiscordSession', DiscordSessionSchema);

export default DiscordSession;
