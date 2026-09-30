import { ECONOMY_ERROR_CODES, type EconomyFieldError } from './economy-schema';
import {
  botChannels,
  invalidateBotPresence,
  isRetryableBotFailure,
  type BotCheckCode,
  type ChannelOption,
} from './bot-presence';

// ── Live channel verification, answered by Murabot ──────────────────────
//
// A stored channel id is a claim, not a fact. It was true when someone picked
// it; the channel may since have been deleted, or Murabot may have lost the
// permission to post in it.
//
// The verification is done by Murabot from its gateway cache, because Murabot
// holds the connection and the resolved permission overwrites. The dashboard
// used to make its own Discord REST calls with a site-side bot token: a second
// credential that could be missing, stale or rejected, and whose 401 was
// reported as "Discord did not answer the bot check" — under a channel field,
// as if the channel were broken.
//
// Every failure keeps its own code, and a transport failure is a RETRYABLE
// error, never a verdict about the setting:
//
//   BOT_NOT_IN_GUILD       → invite the bot
//   CHANNEL_NOT_FOUND      → pick another channel
//   BOT_PERMISSION_MISSING → the exact permission that is missing
//   DISCORD_RATE_LIMITED   → transient; retry, do NOT report as invalid
//   BOT_OFFLINE            → transient; retry
//
// Results are cached briefly per (guild, requirements) and de-duplicated, so
// saving a form with several channel fields costs the same as saving one.

export type RequiredPermission = 'view' | 'send' | 'embed' | 'read';

export { invalidateBotPresence };

/** Map a bot failure onto the code the settings UI knows how to explain. */
function errorCodeFor(code: BotCheckCode): EconomyFieldError['code'] {
  switch (code) {
    case 'BOT_NOT_IN_GUILD':
      return ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD;
    case 'BOT_OFFLINE':
      return ECONOMY_ERROR_CODES.BOT_OFFLINE;
    case 'BOT_GATEWAY_NOT_READY':
      return ECONOMY_ERROR_CODES.BOT_GATEWAY_NOT_READY;
    case 'DISCORD_RATE_LIMITED':
      return ECONOMY_ERROR_CODES.DISCORD_RATE_LIMITED;
    case 'AUTHENTICATION_ERROR':
    case 'BRIDGE_NOT_CONFIGURED':
      return ECONOMY_ERROR_CODES.BRIDGE_NOT_CONFIGURED;
    default:
      return ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE;
  }
}

export interface ChannelVerdict {
  valid: boolean;
  channelName?: string;
  channelType?: number;
  categoryName?: string | null;
  code?: EconomyFieldError['code'];
  message?: string;
  missingPermission?: string;
  checks: ChannelOption['checks'];
}

/**
 * Verify one channel against the permissions a setting needs.
 *
 * `requires` names what must hold for the feature to work, so a log channel
 * demands View + Send + Embed and the failure says exactly which is missing.
 */
export async function validateChannelSetting(
  guildId: string,
  fieldKey: string,
  label: string,
  channelId: string,
  requires: readonly RequiredPermission[],
): Promise<EconomyFieldError | null> {
  const result = await botChannels(guildId, requires);

  if (result.error) {
    // A bot that cannot answer has NOT told us anything about this channel.
    // The error is retryable and says so; it is never a judgement on the value.
    return {
      field: fieldKey,
      label,
      code: errorCodeFor(result.error.code),
      message: `${label} could not be verified right now: ${result.error.message} Nothing was saved.`,
      retryable: isRetryableBotFailure(result.error.code),
    };
  }

  const channel = result.channels.find((c) => c.id === channelId);
  if (!channel) {
    // Murabot can read the guild, and this channel is not among the channels it
    // can use: it was deleted, it belongs to another server, or Murabot lost
    // View Channel on it. All three mean "choose another one".
    return {
      field: fieldKey,
      label,
      code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
      message: 'This channel no longer exists on this server, or Murabot cannot see it. '
        + 'It may have been deleted, or the bot lost access — please select another channel.',
      current: '(unknown channel)',
      expected: 'A channel from this server’s list',
    };
  }
  if (channel.usable) return null;

  return {
    field: fieldKey,
    label,
    code: ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION,
    message: `Murabot cannot use #${channel.name} — it is missing the ${channel.missing?.label ?? 'required'} permission. `
      + 'Fix the channel permission overwrites in Discord, then save again.',
    current: `"${channel.name}"`,
    expected: 'A text channel on this server that Murabot can read, send and embed in',
    missingPermission: channel.missing?.label,
  };
}

/** Every selectable channel for the dropdown, annotated with its verdict. */
export async function listSelectableChannels(
  guildId: string,
  requires: readonly RequiredPermission[] = ['view', 'send'],
): Promise<{ channels: ChannelOption[]; error: { code: BotCheckCode; message: string } | null }> {
  const result = await botChannels(guildId, requires);
  return { channels: result.channels, error: result.error };
}
