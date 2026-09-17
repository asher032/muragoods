import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { existsSync } from 'fs';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API = 'https://discord.com/api/v10';
const KICK = BigInt(0x2);
const BAN = BigInt(0x4);
const MANAGE_MESSAGES = BigInt(0x2000);
const MANAGE_GUILD = BigInt(0x20);
const CONNECT = BigInt(0x100000);
const SPEAK = BigInt(0x200000);
const VIEW_CHANNEL = BigInt(0x400);
const SEND_MESSAGES = BigInt(0x800);

type TestResult = { test: string; status: 'passed' | 'warning' | 'failed'; reason: string };

async function discordGet<T>(path: string, token: string, bot = false): Promise<T | null> {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}` },
    next: { revalidate: 0 },
  });
  return r.ok ? (await r.json()) as Promise<T> : null;
}

function checkPermission(perm: bigint, guildPerms: bigint): { status: 'passed' | 'failed'; reason: string } {
  const ok = (guildPerms & BigInt(0x8)) !== BigInt(0) || (guildPerms & perm) !== BigInt(0);
  return {
    status: ok ? 'passed' : 'failed',
    reason: ok ? 'Permission granted' : 'Permission missing',
  };
}

async function getBotPerms(guildId: string, botToken: string) {
  const member = await discordGet<{ roles: string[] }>(`/guilds/${guildId}/members/@me`, botToken, true);
  const roles = await discordGet<Array<{ id: string; permissions: string | number }>>(`/guilds/${guildId}/roles`, botToken, true);
  if (!member || !roles) return BigInt(0);
  const botRoleIds = new Set(member.roles);
  let perms = BigInt(0);
  for (const role of roles) {
    if (role.id === guildId || botRoleIds.has(role.id)) perms |= BigInt(role.permissions);
  }
  return perms;
}

async function getGuildConfig(guildId: string) {
  const collection = await discordConfigCollection();
  return collection.findOne({ guildId });
}

async function dbWritable(): Promise<{ passed: boolean; reason: string }> {
  try {
    const client = new MongoClient(process.env.MONGO_URI || process.env.MONGODB_URI || '');
    await client.connect();
    const db = client.db(process.env.MONGO_DB || process.env.DISCORD_BOT_MONGO_DB || 'murastream_bot');
    const col = db.collection('feature_test_tmp');
    const doc = { test: true };
    const insertRes = await col.insertOne(doc);
    await col.deleteOne({ _id: insertRes.insertedId });
    await client.close();
    return { passed: true, reason: 'Insert and delete successful' };
  } catch (err: any) {
    return { passed: false, reason: `Database error: ${err.message}` };
  }
}

interface Guild {
  id: string;
  owner: boolean;
  permissions: string | number;
}
interface Channel {
  id: string;
  type: number;
  name: string;
}
interface Member {
  user?: { id: string; username: string };
  nick?: string | null;
}

async function runTests(guildId: string, userToken: string, botToken: string | undefined, module: string): Promise<{ module: string; results: TestResult[] }> {
  const results: TestResult[] = [];

  if (!botToken) {
    return { module, results: [{ test: 'All tests', status: 'failed', reason: 'DISCORD_BOT_TOKEN not configured' }] };
  }

  const userGuilds = await discordGet<Guild[]>('/users/@me/guilds', userToken);
  const guild = userGuilds?.find((g) => g.id === guildId);
  if (!guild) return { module, results: [{ test: 'All tests', status: 'failed', reason: 'Server not found or no access' }] };

  const botPerms = await getBotPerms(guildId, botToken);
  const config = await getGuildConfig(guildId);

  switch (module) {
    case 'tickets': {
      const permTest = checkPermission(BigInt(0x10), botPerms);
      results.push({ test: 'Manage Channels permission', status: permTest.status, reason: permTest.reason });

      const catId = config?.tickets?.categoryId;
      results.push({
        test: 'Ticket category configured',
        status: catId ? 'passed' : 'failed',
        reason: catId ? 'Category is set' : 'No ticket category configured',
      });

      const supportRoleId = config?.tickets?.supportRoleId;
      results.push({
        test: 'Support role configured',
        status: supportRoleId ? 'passed' : 'failed',
        reason: supportRoleId ? 'Support role is set' : 'No support role configured',
      });

      const db = await dbWritable();
      results.push({ test: 'Database writable', status: db.passed ? 'passed' : 'failed', reason: db.reason });

      const channels = await discordGet<Channel[]>(`/guilds/${guildId}/channels`, botToken, true);
      if (!channels) {
        results.push({ test: 'Can create test channel', status: 'failed', reason: 'Cannot read channels' });
      } else {
        const categoryId = catId || channels.find((c) => c.type === 4)?.id;
        try {
          const created = await discordPost<Channel>(`/guilds/${guildId}/channels`, botToken, true, {
            name: 'mura-test-' + Date.now(),
            type: 0,
            parent_id: categoryId || undefined,
            permission_overwrites: [],
          });
          if (created?.id) {
            await discordDelete(`/channels/${created.id}`, botToken, true);
            results.push({ test: 'Can create test channel', status: 'passed', reason: 'Channel created and deleted' });
          } else {
            results.push({ test: 'Can create test channel', status: 'failed', reason: 'Channel creation returned no data' });
          }
        } catch (err: any) {
          results.push({ test: 'Can create test channel', status: 'failed', reason: `Create/delete failed: ${err.message}` });
        }
      }
      break;
    }
    case 'moderation': {
      const kick = checkPermission(KICK, botPerms);
      results.push({ test: 'Kick Members permission', status: kick.status, reason: kick.reason });

      const ban = checkPermission(BAN, botPerms);
      results.push({ test: 'Ban Members permission', status: ban.status, reason: ban.reason });

      const manageMsg = checkPermission(MANAGE_MESSAGES, botPerms);
      results.push({ test: 'Manage Messages permission', status: manageMsg.status, reason: manageMsg.reason });

      const db = await dbWritable();
      results.push({ test: 'Database writable', status: db.passed ? 'passed' : 'failed', reason: db.reason });

      const members = await discordGet<Member[]>(`/guilds/${guildId}/members?limit=1`, botToken, true);
      if (members && members.length > 0) {
        results.push({ test: 'Target user exists in guild', status: 'passed', reason: `Found: ${members[0].user?.username || 'user'}` });
      } else {
        results.push({ test: 'Target user exists in guild', status: 'failed', reason: 'Cannot fetch guild members' });
      }
      break;
    }
    case 'music': {
      const connect = checkPermission(CONNECT, botPerms);
      results.push({ test: 'Connect permission', status: connect.status, reason: connect.reason });

      const speak = checkPermission(SPEAK, botPerms);
      results.push({ test: 'Speak permission', status: speak.status, reason: speak.reason });

      let ffmpegAvail = existsSync('/usr/bin/ffmpeg') || existsSync('/usr/local/bin/ffmpeg');
      results.push({
        test: 'FFmpeg available',
        status: ffmpegAvail ? 'passed' : 'warning',
        reason: ffmpegAvail ? 'FFmpeg binary found' : 'FFmpeg not found on server',
      });

      let ytdlpAvail = existsSync('/usr/bin/yt-dlp') || existsSync('/usr/local/bin/yt-dlp');
      results.push({
        test: 'yt-dlp available',
        status: ytdlpAvail ? 'passed' : 'warning',
        reason: ytdlpAvail ? 'yt-dlp binary found' : 'yt-dlp not found on server',
      });

      const voiceChannels = await discordGet<Channel[]>(`/guilds/${guildId}/channels?type=2`, botToken, true);
      if (voiceChannels && voiceChannels.length > 0) {
        results.push({ test: 'Can connect to voice', status: 'passed', reason: `Voice channels available: ${voiceChannels.length}` });
      } else {
        results.push({ test: 'Can connect to voice', status: 'warning', reason: 'No voice channels found in server' });
      }
      break;
    }
    case 'suggestions': {
      const suggChannel = config?.suggestions?.channelId || config?.community?.suggestionChannelId;
      results.push({
        test: 'Suggestion channel configured',
        status: suggChannel ? 'passed' : 'failed',
        reason: suggChannel ? 'Suggestion channel is set' : 'No suggestion channel configured',
      });

      const db = await dbWritable();
      results.push({ test: 'Database writable', status: db.passed ? 'passed' : 'failed', reason: db.reason });

      if (suggChannel) {
        try {
          const posted = await discordPost<{id: string}>(`/channels/${suggChannel}/messages`, botToken, true, {
            content: '🧪 MuraBot feature test — this message will be deleted.',
          });
          if (posted?.id) {
            await discordDelete(`/channels/${suggChannel}/messages/${posted.id}`, botToken, true);
            results.push({ test: 'Can post test message', status: 'passed', reason: 'Message posted and deleted' });
          } else {
            results.push({ test: 'Can post test message', status: 'failed', reason: 'Post/delete returned no data' });
          }
        } catch (err: any) {
          results.push({ test: 'Can post test message', status: 'failed', reason: `Post/delete failed: ${err.message}` });
        }
      } else {
        results.push({ test: 'Can post test message', status: 'warning', reason: 'No suggestion channel to test' });
      }
      break;
    }
    case 'giveaways': {
      const giveawayChannel = config?.giveaways?.channelId || config?.community?.giveawayChannelId;
      results.push({
        test: 'Giveaway channel configured',
        status: giveawayChannel ? 'passed' : 'failed',
        reason: giveawayChannel ? 'Giveaway channel is set' : 'No giveaway channel configured',
      });

      const manageMsg = checkPermission(MANAGE_MESSAGES, botPerms);
      results.push({ test: 'Manage Messages permission', status: manageMsg.status, reason: manageMsg.reason });

      const manageGuild = checkPermission(MANAGE_GUILD, botPerms);
      results.push({ test: 'Manage Server permission', status: manageGuild.status, reason: manageGuild.reason });

      if (giveawayChannel) {
        try {
          const posted = await discordPost<{id: string}>(`/channels/${giveawayChannel}/messages`, botToken, true, {
            content: '🎁 MuraBot giveaway test — this message will be deleted.',
          });
          if (posted?.id) {
            await discordDelete(`/channels/${giveawayChannel}/messages/${posted.id}`, botToken, true);
            results.push({ test: 'Can post test message', status: 'passed', reason: 'Message posted and deleted' });
          } else {
            results.push({ test: 'Can post test message', status: 'failed', reason: 'Post/delete returned no data' });
          }
        } catch (err: any) {
          results.push({ test: 'Can post test message', status: 'failed', reason: `Post/delete failed: ${err.message}` });
        }
      } else {
        results.push({ test: 'Can post test message', status: 'warning', reason: 'No giveaway channel to test' });
      }
      break;
    }
    default:
      results.push({ test: 'All tests', status: 'failed', reason: `Unknown module: ${module}` });
  }

  return { module, results };
}

async function discordPost<T>(path: string, token: string, bot: boolean, body: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  return r.ok ? (await r.json()) as Promise<T> : null;
}

async function discordDelete(path: string, token: string, bot: boolean): Promise<void> {
  await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}` },
    next: { revalidate: 0 },
  });
}

export async function POST(req: NextRequest) {
  const userToken = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const body = await req.json().catch(() => null) as { guildId?: string; module?: string } | null;

  if (!userToken || !body?.guildId || !/^\d{5,25}$/.test(body.guildId)) {
    return NextResponse.json({ success: false, error: 'Valid Discord authorization and server required' }, { status: 400 });
  }

  const validModules = ['tickets', 'moderation', 'music', 'suggestions', 'giveaways'];
  const module = body.module && validModules.includes(body.module) ? body.module : 'tickets';
  const guildId = body.guildId;

  const results = await runTests(guildId, userToken, botToken, module);
  return NextResponse.json({ success: true, ...results }, { status: 200 });
}
