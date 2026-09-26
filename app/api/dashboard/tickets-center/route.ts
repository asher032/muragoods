import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
const VIEW_CHANNEL = BigInt(0x400);
const SEND_MESSAGES = BigInt(0x800);
const READ_MESSAGE_HISTORY = BigInt(0x10000);
const STAFF_ALLOW = VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY;

type TicketStatus = 'open' | 'closed';
type TicketAction = 'assign' | 'unassign' | 'claim' | 'close' | 'reopen' | 'lock' | 'unlock' | 'rename' | 'move';
type RecordValue = Record<string, unknown>;

interface ManagedGuild {
  id: string;
  name: string;
}

interface HttpError extends Error {
  status: number;
}

interface DiscordChannel {
  id: string;
  guild_id?: string;
  name?: string;
  type?: number;
  parent_id?: string | null;
}

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
}

function isSnowflake(value: string): boolean {
  return /^\d{17,25}$/.test(value);
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) return fallback;
  return parsed;
}

function httpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

async function getManagedGuild(accessToken: string, guildId: string): Promise<ManagedGuild> {
  const response = await fetch(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw httpError(response.status === 401 ? 'Discord authentication is required' : 'Discord authentication failed', response.status === 401 ? 401 : 403);
  }

  const guilds = (await response.json()) as Array<{
    id: string;
    name: string;
    owner: boolean;
    permissions: string | number;
  }>;
  const guild = guilds.find((candidate) => candidate.id === guildId);
  if (!guild) throw httpError('You do not have permission to manage this server', 403);

  const permissions = BigInt(guild.permissions);
  if (!guild.owner && (permissions & MANAGE_GUILD) === BigInt(0) && (permissions & ADMINISTRATOR) === BigInt(0)) {
    throw httpError('You do not have permission to manage this server', 403);
  }

  return { id: guild.id, name: guild.name };
}

async function discordRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const response = await fetch(`${DISCORD_API}${path}`, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json() as { message?: string; errors?: unknown };
      detail = payload.message || JSON.stringify(payload.errors || payload);
    } catch {
      detail = response.statusText || 'Discord API request failed';
    }
    throw httpError(`Discord API error: ${detail}`, response.status === 404 ? 404 : response.status === 429 ? 429 : 502);
  }

  if (response.status === 204) return null;
  return response.json() as Promise<T>;
}

function asRecord(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {};
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => stringValue(item).trim())
    .filter(Boolean)));
}

function dateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoValue(value: unknown): string | undefined {
  const date = dateValue(value);
  return date ? date.toISOString() : undefined;
}

function getTickets(document: RecordValue | null): RecordValue[] {
  if (!Array.isArray(document?.tickets_list)) return [];
  return document.tickets_list.map(asRecord);
}

function normalizeStatus(value: unknown): TicketStatus {
  return value === 'closed' ? 'closed' : 'open';
}

function normalizeTicket(
  ticket: RecordValue,
  index: number,
  documentUpdatedAt: unknown,
  channels: Map<string, DiscordChannel>,
  members: Map<string, DiscordUser>,
): RecordValue {
  const channelId = stringValue(ticket.channelId || ticket.channel || '');
  const channel = channelId ? channels.get(channelId) : undefined;
  const creatorId = stringValue(ticket.userId || ticket.creatorId || ticket.createdBy || '');
  const creator = creatorId ? members.get(creatorId) : undefined;
  const assignedIds = stringArray(ticket.assignedStaff || ticket.assignees || ticket.assignedTo || []);
  if (stringValue(ticket.assigneeId)) assignedIds.unshift(stringValue(ticket.assigneeId));
  const uniqueAssignees = Array.from(new Set(assignedIds));
  const createdAt = isoValue(ticket.createdAt) || isoValue(documentUpdatedAt) || new Date().toISOString();
  const lastActivity = isoValue(ticket.lastActivity || ticket.updatedAt) || isoValue(documentUpdatedAt) || createdAt;

  return {
    id: stringValue(ticket.id || ticket.ticketId || channelId || `ticket-${index}`),
    channelId,
    channelName: stringValue(ticket.channelName || ticket.name) || channel?.name || `ticket-${channelId.slice(-6) || index + 1}`,
    subject: stringValue(ticket.subject || ticket.title) || 'Support ticket',
    creatorId,
    creatorName: stringValue(ticket.creatorName || ticket.userName) || creator?.global_name || creator?.username || (creatorId ? `User ${creatorId.slice(-6)}` : 'Unknown user'),
    assignedStaff: uniqueAssignees.map((id) => ({
      id,
      name: members.get(id)?.global_name || members.get(id)?.username || `User ${id.slice(-6)}`,
    })),
    assigneeId: uniqueAssignees[0] || '',
    status: normalizeStatus(ticket.status),
    locked: Boolean(ticket.locked),
    categoryId: stringValue(ticket.categoryId || ticket.parentId || channel?.parent_id || ''),
    createdAt,
    lastActivity,
    closedAt: isoValue(ticket.closedAt),
  };
}

function getBotToken(): string {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || '';
}

async function getActorId(accessToken: string): Promise<string> {
  const user = await discordRequest<DiscordUser>('/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!user?.id) throw httpError('Unable to identify the claiming user', 401);
  return user.id;
}

async function putPermissionOverwrite(channelId: string, targetId: string, type: 0 | 1, allow: bigint, deny: bigint): Promise<void> {
  await discordRequest(`/channels/${channelId}/permissions/${targetId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      allow: allow.toString(),
      deny: deny.toString(),
    }),
  });
}

async function deletePermissionOverwrite(channelId: string, targetId: string): Promise<void> {
  await discordRequest(`/channels/${channelId}/permissions/${targetId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${getBotToken()}` },
  });
}

async function patchChannel(channelId: string, data: RecordValue): Promise<DiscordChannel> {
  return discordRequest<DiscordChannel>(`/channels/${channelId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }) as Promise<DiscordChannel>;
}

function assignedTicket(ticket: RecordValue, userId: string): RecordValue {
  const assignedStaff = stringArray(ticket.assignedStaff || ticket.assignees || ticket.assignedTo || []);
  assignedStaff.unshift(stringValue(ticket.assigneeId));
  const unique = Array.from(new Set(assignedStaff.filter(Boolean)));
  return {
    ...ticket,
    assigneeId: unique[0] || '',
    assignedStaff: unique,
  };
}

function unassignedTicket(ticket: RecordValue, userId: string): RecordValue {
  const assignedStaff = stringArray(ticket.assignedStaff || ticket.assignees || ticket.assignedTo || []).filter((id) => id !== userId);
  const assigneeId = stringValue(ticket.assigneeId) === userId ? (assignedStaff[0] || '') : stringValue(ticket.assigneeId);
  return {
    ...ticket,
    assigneeId,
    assignedStaff,
  };
}

function ticketIndex(tickets: RecordValue[], channelId: string): number {
  return tickets.findIndex((ticket) => stringValue(ticket.channelId || ticket.channel) === channelId);
}

async function saveTicket(
  collection: Awaited<ReturnType<typeof discordConfigCollection>>,
  guildId: string,
  channelId: string,
  ticket: RecordValue,
): Promise<void> {
  const result = await collection.updateOne(
    { guildId, 'tickets_list.channelId': channelId },
    {
      $set: {
        'tickets_list.$': ticket,
        updatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) throw httpError('Ticket no longer exists', 404);
}

function discordStatus(status: number): number {
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 429) return status;
  return 502;
}

export async function GET(req: NextRequest) {
  const accessToken = (await sessionToken()) || '';
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const status = req.nextUrl.searchParams.get('status') || 'all';
  const search = (req.nextUrl.searchParams.get('search') || '').trim().toLowerCase();
  const page = parsePositiveInteger(req.nextUrl.searchParams.get('page'), 1, 100000);
  const limit = parsePositiveInteger(req.nextUrl.searchParams.get('limit'), 20, 100);

  if (!accessToken) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!isSnowflake(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!['all', 'open', 'closed'].includes(status)) return NextResponse.json({ success: false, error: 'Invalid status filter' }, { status: 400 });

  try {
    await getManagedGuild(accessToken, guildId);
    const collection = await discordConfigCollection();
    const document = asRecord(await collection.findOne({ guildId }));
    const tickets = getTickets(document);
    const botToken = getBotToken();
    const [channelResponse, memberResponse] = await Promise.all([
      botToken ? discordRequest<DiscordChannel[]>(`/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` },
        next: { revalidate: 0 },
      }).catch(() => null) : Promise.resolve(null),
      botToken ? discordRequest<Array<{ user?: DiscordUser; nick?: string | null }>>(`/guilds/${guildId}/members?limit=1000`, {
        headers: { Authorization: `Bot ${botToken}` },
        next: { revalidate: 0 },
      }).catch(() => null) : Promise.resolve(null),
    ]);

    const channels = new Map((channelResponse || []).map((channel) => [channel.id, channel]));
    const members = new Map<DiscordUser['id'], DiscordUser>();
    for (const member of memberResponse || []) {
      if (member.user?.id) members.set(member.user.id, member.user);
    }

    const normalized = tickets
      .map((ticket, index) => normalizeTicket(ticket, index, document.updatedAt, channels, members))
      .filter((ticket) => status === 'all' || ticket.status === status)
      .filter((ticket) => {
        if (!search) return true;
        return String(ticket.channelName).toLowerCase().includes(search) || String(ticket.creatorName).toLowerCase().includes(search);
      })
      .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
    const total = normalized.length;
    const start = (page - 1) * limit;
    const pageTickets = normalized.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      tickets: pageTickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to list tickets';
    const status = error instanceof Object && 'status' in error ? Number((error as { status: unknown }).status) : 500;
    return NextResponse.json({ success: false, error: message }, { status: Number.isFinite(status) ? status : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const accessToken = (await sessionToken()) || '';
  let body: RecordValue = {};
  try {
    body = asRecord(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const guildId = stringValue(body.guildId);
  const channelId = stringValue(body.channelId);
  const action = stringValue(body.action) as TicketAction;
  const assigneeId = stringValue(body.assigneeId);
  const newName = stringValue(body.newName).trim();
  const newCategoryId = stringValue(body.newCategoryId);

  if (!accessToken) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!isSnowflake(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!isSnowflake(channelId)) return NextResponse.json({ success: false, error: 'Valid channelId required' }, { status: 400 });
  if (!(['assign', 'unassign', 'claim', 'close', 'reopen', 'lock', 'unlock', 'rename', 'move'] as string[]).includes(action)) {
    return NextResponse.json({ success: false, error: 'Invalid ticket action' }, { status: 400 });
  }

  try {
    await getManagedGuild(accessToken, guildId);
    const botToken = getBotToken();
    if (!botToken) throw httpError('Discord bot token is not configured', 503);

    const collection = await discordConfigCollection();
    const document = asRecord(await collection.findOne({ guildId }));
    const tickets = getTickets(document);
    const index = ticketIndex(tickets, channelId);
    if (index < 0) throw httpError('Ticket not found', 404);
    const ticket = { ...tickets[index] };
    const ticketStatus = normalizeStatus(ticket.status);

    if ((action === 'assign' || action === 'claim') && ticketStatus === 'closed') {
      throw httpError('Closed tickets cannot be assigned', 409);
    }
    if (action === 'assign' && !isSnowflake(assigneeId)) {
      throw httpError('assigneeId is required for assign', 400);
    }
    if (action === 'unassign' && !isSnowflake(assigneeId || stringValue(ticket.assigneeId))) {
      throw httpError('assigneeId is required for unassign', 400);
    }
    if (action === 'rename' && (newName.length < 1 || newName.length > 100)) {
      throw httpError('newName must be between 1 and 100 characters', 400);
    }
    if (action === 'move' && !isSnowflake(newCategoryId)) {
      throw httpError('newCategoryId is required for move', 400);
    }

    let updated = ticket;
    const now = new Date().toISOString();

    if (action === 'assign') {
      // The assignee must actually be on this server — the selector only
      // offers members, but a forged request must not grant channel access
      // to an arbitrary user ID.
      const member = await discordRequest(`/guilds/${guildId}/members/${assigneeId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        next: { revalidate: 0 },
      });
      if (!member) throw httpError('Staff member is not on this server', 404);
      await putPermissionOverwrite(channelId, assigneeId, 1, STAFF_ALLOW, BigInt(0));
      updated = assignedTicket(ticket, assigneeId);
    } else if (action === 'claim') {
      const actorId = await getActorId(accessToken);
      await putPermissionOverwrite(channelId, actorId, 1, STAFF_ALLOW, BigInt(0));
      updated = assignedTicket(ticket, actorId);
    } else if (action === 'unassign') {
      const targetId = assigneeId || stringValue(ticket.assigneeId);
      const assignedIds = stringArray(ticket.assignedStaff || ticket.assignees || ticket.assignedTo || []);
      if (stringValue(ticket.assigneeId) !== targetId && !assignedIds.includes(targetId)) {
        throw httpError('Staff member is not assigned to this ticket', 409);
      }
      await deletePermissionOverwrite(channelId, targetId);
      updated = unassignedTicket(ticket, targetId);
    } else if (action === 'close') {
      if (ticketStatus !== 'closed') {
        const creatorId = stringValue(ticket.userId || ticket.creatorId || ticket.createdBy || '');
        const content = creatorId && isSnowflake(creatorId)
          ? `<@${creatorId}> This ticket has been closed. Thank you for contacting support.`
          : 'This ticket has been closed. Thank you for contacting support.';
        await discordRequest(`/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content }),
        });
        updated = { ...ticket, status: 'closed', locked: false, closedAt: now };
      }
    } else if (action === 'reopen') {
      if (ticketStatus !== 'open') {
        // Close locks the channel: creator lost Send Messages and @everyone may
        // have gained denies. Reopen restores both — a REAL Discord change, not
        // just a database status flip.
        await putPermissionOverwrite(channelId, guildId, 0, BigInt(0), VIEW_CHANNEL | SEND_MESSAGES);
        const creatorId = stringValue(ticket.userId || ticket.creatorId || ticket.createdBy || '');
        if (creatorId && isSnowflake(creatorId) && creatorId !== guildId) {
          await putPermissionOverwrite(channelId, creatorId, 1, STAFF_ALLOW, BigInt(0));
        }
        updated = { ...ticket, status: 'open', locked: false, closedAt: undefined };
      }
    } else if (action === 'lock') {
      if (!ticket.locked) {
        const channel = await discordRequest<DiscordChannel>(`/channels/${channelId}`, {
          headers: { Authorization: `Bot ${botToken}` },
          next: { revalidate: 0 },
        });
        if (channel?.guild_id && channel.guild_id !== guildId) throw httpError('Ticket channel does not belong to this server', 403);
        await putPermissionOverwrite(channelId, guildId, 0, BigInt(0), VIEW_CHANNEL | SEND_MESSAGES);
        const creatorId = stringValue(ticket.userId || ticket.creatorId || ticket.createdBy || '');
        if (creatorId && isSnowflake(creatorId) && creatorId !== guildId) {
          await putPermissionOverwrite(channelId, creatorId, 1, VIEW_CHANNEL | READ_MESSAGE_HISTORY, SEND_MESSAGES);
        }
        updated = { ...ticket, locked: true };
      }
    } else if (action === 'unlock') {
      if (ticket.locked) {
        const channel = await discordRequest<DiscordChannel>(`/channels/${channelId}`, {
          headers: { Authorization: `Bot ${botToken}` },
          next: { revalidate: 0 },
        });
        if (channel?.guild_id && channel.guild_id !== guildId) throw httpError('Ticket channel does not belong to this server', 403);
        await putPermissionOverwrite(channelId, guildId, 0, BigInt(0), VIEW_CHANNEL);
        const creatorId = stringValue(ticket.userId || ticket.creatorId || ticket.createdBy || '');
        if (creatorId && isSnowflake(creatorId) && creatorId !== guildId) {
          await putPermissionOverwrite(channelId, creatorId, 1, STAFF_ALLOW, BigInt(0));
        }
        updated = { ...ticket, locked: false };
      }
    } else if (action === 'rename') {
      await patchChannel(channelId, { name: newName });
      updated = { ...ticket, channelName: newName, name: newName };
    } else if (action === 'move') {
      const category = await discordRequest<DiscordChannel>(`/channels/${newCategoryId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        next: { revalidate: 0 },
      });
      if (!category || category.guild_id !== guildId || category.type !== 4) {
        throw httpError('New category is not a channel category in this server', 400);
      }
      await patchChannel(channelId, { parent_id: newCategoryId });
      updated = { ...ticket, categoryId: newCategoryId, parentId: newCategoryId };
    }

    updated = { ...updated, lastActivity: now, updatedAt: now };
    await saveTicket(collection, guildId, channelId, updated);

    return NextResponse.json({
      success: true,
      ticket: normalizeTicket(updated, index, now, new Map(), new Map()),
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error) {
      const status = Number((error as { status: unknown }).status);
      return NextResponse.json({ success: false, error: error.message }, { status: discordStatus(status) });
    }
    return NextResponse.json({ success: false, error: 'Unable to update ticket' }, { status: 500 });
  }
}
