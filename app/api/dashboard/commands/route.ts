import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CommandExecution {
  _id: string;
  commandName: string;
  guildId: string;
  userId: string;
  executedAt: string;
  success: boolean;
}

async function getExecutionsCollection(): Promise<{ collection: any; client: MongoClient }> {
  const client = new MongoClient(process.env.MONGO_URI || process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db(process.env.MONGO_DB || process.env.DISCORD_BOT_MONGO_DB || 'murastream_bot');
  return { collection: db.collection('command_executions'), client };
}

interface DiscordCommand {
  name: string;
  description: string;
  type: 'slash' | 'prefix';
  module: string;
  status: 'working' | 'disabled' | 'error';
  usage?: string;
  requiredPermissions?: string[];
  botPermissions?: string[];
  cooldown?: number;
}

const COMMANDS: DiscordCommand[] = [
  // Music
  { name: '/play', description: 'Play a song or search for music', type: 'slash', module: 'Music', status: 'working', usage: '/play <query>', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak', 'Manage Channels'], cooldown: 3 },
  { name: '/skip', description: 'Skip the current track', type: 'slash', module: 'Music', status: 'working', usage: '/skip', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak'], cooldown: 5 },
  { name: '/queue', description: 'View the music queue', type: 'slash', module: 'Music', status: 'working', usage: '/queue', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak'], cooldown: 3 },
  { name: '/stop', description: 'Stop playback and clear queue', type: 'slash', module: 'Music', status: 'working', usage: '/stop', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak'], cooldown: 5 },
  { name: '/volume', description: 'Set the player volume', type: 'slash', module: 'Music', status: 'working', usage: '/volume <1-150>', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak'], cooldown: 3 },
  { name: '!np', description: 'Show now playing', type: 'prefix', module: 'Music', status: 'working', usage: '!np', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },
  { name: '!join', description: 'Bot joins your voice channel', type: 'prefix', module: 'Music', status: 'disabled', usage: '!join', requiredPermissions: ['Connect', 'Speak'], botPermissions: ['Connect', 'Speak'], cooldown: 10 },
  { name: '!lyrics', description: 'Show lyrics for the current song', type: 'prefix', module: 'Music', status: 'error', usage: '!lyrics', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 10 },

  // Moderation
  { name: '/kick', description: 'Kick a member from the server', type: 'slash', module: 'Moderation', status: 'working', usage: '/kick <user> [reason]', requiredPermissions: ['Kick Members'], botPermissions: ['Kick Members', 'Manage Roles'], cooldown: 10 },
  { name: '/ban', description: 'Ban a member from the server', type: 'slash', module: 'Moderation', status: 'working', usage: '/ban <user> [reason]', requiredPermissions: ['Ban Members'], botPermissions: ['Ban Members', 'Manage Roles'], cooldown: 15 },
  { name: '/unban', description: 'Unban a member', type: 'slash', module: 'Moderation', status: 'working', usage: '/unban <user>', requiredPermissions: ['Ban Members'], botPermissions: ['Ban Members', 'Manage Roles'], cooldown: 10 },
  { name: '/mute', description: 'Mute a member temporarily', type: 'slash', module: 'Moderation', status: 'working', usage: '/mute <user> <duration> [reason]', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles', 'Manage Channels'], cooldown: 10 },
  { name: '/purge', description: 'Delete multiple messages', type: 'slash', module: 'Moderation', status: 'working', usage: '/purge <count>', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Read Message History'], cooldown: 5 },
  { name: '!warn', description: 'Warn a member', type: 'prefix', module: 'Moderation', status: 'working', usage: '!warn <user> [reason]', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages'], cooldown: 5 },
  { name: '!mute', description: 'Mute a member', type: 'prefix', module: 'Moderation', status: 'disabled', usage: '!mute <user> <duration>', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles'], cooldown: 10 },

  // Security
  { name: '/lockdown', description: 'Lockdown or unlock a channel', type: 'slash', module: 'Security', status: 'working', usage: '/lockdown <enable|disable>', requiredPermissions: ['Manage Channels'], botPermissions: ['Manage Channels', 'Manage Messages'], cooldown: 5 },
  { name: '/raid', description: 'Check raid status or set alerts', type: 'slash', module: 'Security', status: 'working', usage: '/raid <check|set>', requiredPermissions: ['Manage Server'], botPermissions: ['Manage Server', 'Manage Roles'], cooldown: 10 },
  { name: '/antispam', description: 'Toggle anti-spam settings', type: 'slash', module: 'Security', status: 'working', usage: '/antispam <enable|disable>', requiredPermissions: ['Manage Server'], botPermissions: ['Manage Server'], cooldown: 5 },
  { name: '/verify', description: 'Verify a member', type: 'slash', module: 'Security', status: 'working', usage: '/verify', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles'], cooldown: 30 },
  { name: '!security', description: 'Show security status', type: 'prefix', module: 'Security', status: 'working', usage: '!security', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages'], cooldown: 10 },

  // Leveling
  { name: '/rank', description: 'Check your or another user\'s rank', type: 'slash', module: 'Leveling', status: 'working', usage: '/rank [user]', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '/leaderboard', description: 'Show the leveling leaderboard', type: 'slash', module: 'Leveling', status: 'working', usage: '/leaderboard', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '/setxp', description: 'Set XP for a user', type: 'slash', module: 'Leveling', status: 'working', usage: '/setxp <user> <amount>', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles'], cooldown: 10 },
  { name: '/levelup', description: 'Toggle level-up notifications', type: 'slash', module: 'Leveling', status: 'disabled', usage: '/levelup <enable|disable>', requiredPermissions: ['Manage Server'], botPermissions: ['Manage Server'], cooldown: 5 },
  { name: '!rank', description: 'Check your rank', type: 'prefix', module: 'Leveling', status: 'working', usage: '!rank', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },

  // Economy
  { name: '/balance', description: 'Check your balance', type: 'slash', module: 'Economy', status: 'working', usage: '/balance [user]', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '/daily', description: 'Claim your daily reward', type: 'slash', module: 'Economy', status: 'working', usage: '/daily', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 86400 },
  { name: '/work', description: 'Work for coins', type: 'slash', module: 'Economy', status: 'working', usage: '/work', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 60 },
  { name: '/pay', description: 'Send coins to a user', type: 'slash', module: 'Economy', status: 'working', usage: '/pay <user> <amount>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 10 },
  { name: '/shop', description: 'Browse the item shop', type: 'slash', module: 'Economy', status: 'working', usage: '/shop', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '!balance', description: 'Check balance', type: 'prefix', module: 'Economy', status: 'working', usage: '!balance', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '!leaderboard', description: 'Economy leaderboard', type: 'prefix', module: 'Economy', status: 'error', usage: '!lb', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 10 },

  // Fun
  { name: '/8ball', description: 'Ask the magic 8-ball a question', type: 'slash', module: 'Fun', status: 'working', usage: '/8ball <question>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 3 },
  { name: '/trivia', description: 'Start a trivia game', type: 'slash', module: 'Fun', status: 'working', usage: '/trivia', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 10 },
  { name: '/poll', description: 'Create a poll', type: 'slash', module: 'Fun', status: 'working', usage: '/poll <question>', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Add Reactions'], cooldown: 10 },
  { name: '/meme', description: 'Get a random meme', type: 'slash', module: 'Fun', status: 'working', usage: '/meme', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '!roll', description: 'Roll a dice', type: 'prefix', module: 'Fun', status: 'working', usage: '!roll', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 3 },

  // Tickets
  { name: '/ticket', description: 'Create a support ticket', type: 'slash', module: 'Tickets', status: 'working', usage: '/ticket [name]', requiredPermissions: ['View Channels'], botPermissions: ['Manage Channels', 'Send Messages', 'Embed Links'], cooldown: 30 },
  { name: '/ticket close', description: 'Close a ticket', type: 'slash', module: 'Tickets', status: 'working', usage: '/ticket close', requiredPermissions: ['Manage Channels'], botPermissions: ['Manage Channels', 'Manage Messages'], cooldown: 5 },
  { name: '/ticket add', description: 'Add someone to a ticket', type: 'slash', module: 'Tickets', status: 'working', usage: '/ticket add <user>', requiredPermissions: ['Manage Channels'], botPermissions: ['Manage Channels'], cooldown: 5 },
  { name: '/ticket remove', description: 'Remove someone from a ticket', type: 'slash', module: 'Tickets', status: 'working', usage: '/ticket remove <user>', requiredPermissions: ['Manage Channels'], botPermissions: ['Manage Channels'], cooldown: 5 },
  { name: '!ticket', description: 'Create a ticket', type: 'prefix', module: 'Tickets', status: 'working', usage: '!ticket', requiredPermissions: ['View Channels'], botPermissions: ['Manage Channels', 'Send Messages'], cooldown: 30 },

  // Giveaways
  { name: '/giveaway', description: 'Start a giveaway', type: 'slash', module: 'Giveaways', status: 'working', usage: '/giveaway <duration> <winners> <prize>', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Embed Links', 'Read Message History'], cooldown: 60 },
  { name: '/giveaway end', description: 'End a giveaway manually', type: 'slash', module: 'Giveaways', status: 'working', usage: '/giveaway end', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Manage Roles'], cooldown: 5 },
  { name: '/giveaway reroll', description: 'Reroll a giveaway winner', type: 'slash', module: 'Giveaways', status: 'working', usage: '/giveaway reroll', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Manage Roles'], cooldown: 10 },
  { name: '/giveaway setup', description: 'Configure giveaway settings', type: 'slash', module: 'Giveaways', status: 'disabled', usage: '/giveaway setup', requiredPermissions: ['Manage Server'], botPermissions: ['Manage Server', 'Manage Messages'], cooldown: 60 },
  { name: '!giveaway', description: 'Start a giveaway', type: 'prefix', module: 'Giveaways', status: 'error', usage: '!giveaway <duration> <winners> <prize>', requiredPermissions: ['Manage Messages'], botPermissions: ['Manage Messages', 'Embed Links'], cooldown: 60 },

  // Suggestions
  { name: '/suggest', description: 'Submit a suggestion', type: 'slash', module: 'Suggestions', status: 'working', usage: '/suggest <description>', requiredPermissions: ['View Channels'], botPermissions: ['Send Messages', 'Embed Links'], cooldown: 300 },
  { name: '/suggest vote', description: 'Vote on a suggestion', type: 'slash', module: 'Suggestions', status: 'working', usage: '/suggest vote <id>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 60 },
  { name: '/suggest status', description: 'Check suggestion status', type: 'slash', module: 'Suggestions', status: 'working', usage: '/suggest status <id>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Embed Links'], cooldown: 5 },
  { name: '/suggest review', description: 'Review a suggestion (manager only)', type: 'slash', module: 'Suggestions', status: 'working', usage: '/suggest review <id> <status>', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles', 'Manage Messages'], cooldown: 10 },
  { name: '!suggest', description: 'Submit a suggestion', type: 'prefix', module: 'Suggestions', status: 'working', usage: '!suggest <description>', requiredPermissions: ['View Channels'], botPermissions: ['Send Messages', 'Embed Links'], cooldown: 300 },

  // Reminders
  { name: '/remind', description: 'Set a reminder', type: 'slash', module: 'Reminders', status: 'working', usage: '/remind <time> <message>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },
  { name: '/reminders', description: 'List your active reminders', type: 'slash', module: 'Reminders', status: 'working', usage: '/reminders', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/remind delete', description: 'Delete a reminder', type: 'slash', module: 'Reminders', status: 'working', usage: '/remind delete <id>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },
  { name: '/remind schedule', description: 'Schedule a reminder with date/time', type: 'slash', module: 'Reminders', status: 'working', usage: '/remind schedule <datetime> <message>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },
  { name: '!remind', description: 'Set a reminder', type: 'prefix', module: 'Reminders', status: 'disabled', usage: '!remind <time> <message>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },

  // Reputation
  { name: '/rep', description: 'Give reputation to a user', type: 'slash', module: 'Reputation', status: 'working', usage: '/rep <user>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 21600 },
  { name: '/reputation', description: 'Check reputation scores', type: 'slash', module: 'Reputation', status: 'working', usage: '/reputation [user]', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/rep leaderboard', description: 'Show reputation leaderboard', type: 'slash', module: 'Reputation', status: 'working', usage: '/rep leaderboard', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/rep set', description: 'Set reputation for a user (admin)', type: 'slash', module: 'Reputation', status: 'working', usage: '/rep set <user> <amount>', requiredPermissions: ['Manage Roles'], botPermissions: ['Manage Roles', 'Manage Messages'], cooldown: 10 },
  { name: '!rep', description: 'Give reputation', type: 'prefix', module: 'Reputation', status: 'error', usage: '!rep <user>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 21600 },

  // Murastream
  { name: '/movie', description: 'Search for a movie', type: 'slash', module: 'Murastream', status: 'working', usage: '/movie <query>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/anime', description: 'Search for an anime', type: 'slash', module: 'Murastream', status: 'working', usage: '/anime <query>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/tv', description: 'Search for a TV series', type: 'slash', module: 'Murastream', status: 'working', usage: '/tv <query>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/watchlist', description: 'Manage your watchlist', type: 'slash', module: 'Murastream', status: 'working', usage: '/watchlist [add|remove|list]', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 5 },
  { name: '/stream', description: 'Check streaming availability', type: 'slash', module: 'Murastream', status: 'working', usage: '/stream <query>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 10 },
  { name: '/trending', description: 'Show trending content', type: 'slash', module: 'Murastream', status: 'disabled', usage: '/trending', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages', 'Embed Links'], cooldown: 30 },
  { name: '!movie', description: 'Search for a movie', type: 'prefix', module: 'Murastream', status: 'error', usage: '!movie <query>', requiredPermissions: ['View Channels'], botPermissions: ['Read Messages', 'Send Messages'], cooldown: 5 },
];

export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');

  if (!token) {
    return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  }
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }

  try {
    const { collection, client } = await getExecutionsCollection();
    const commands = COMMANDS.map((cmd) => ({ ...cmd, id: cmd.name.replace(/[^a-zA-Z0-9]/g, '_') }));

    const moduleMap: Record<string, string> = {};
    for (const c of commands) moduleMap[c.module] = c.module;

    const stats = { total: commands.length, working: 0, disabled: 0, errors: 0 };
    for (const c of commands) {
      if (c.status === 'working') stats.working++;
      else if (c.status === 'disabled') stats.disabled++;
      else if (c.status === 'error') stats.errors++;
    }

    const recentExecutions: Array<{ commandName: string; executedAt: string; success: boolean }> = [];
    const cursor = collection.find({ guildId }).sort({ executedAt: -1 }).limit(50);
    const execs = await cursor.toArray();
    for (const e of execs as ExecutionDocument[]) {
      recentExecutions.push({ commandName: e.commandName, executedAt: e.executedAt, success: e.success });
    }

    await client.close();

    return NextResponse.json({
      success: true,
      commands,
      stats,
      moduleMap,
      recentExecutions,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

interface ExecutionDocument {
  _id: ObjectId;
  commandName: string;
  guildId: string;
  userId: string;
  executedAt: string;
  success: boolean;
}
