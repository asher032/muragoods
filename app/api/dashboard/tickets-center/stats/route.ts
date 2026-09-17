import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

type TicketRecord = Record<string, unknown>;

interface HttpError extends Error {
  status: number;
}

function isSnowflake(value: string): boolean {
  return /^\d{17,25}$/.test(value);
}

function asRecord(value: unknown): TicketRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as TicketRecord
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

function getTickets(document: TicketRecord | null): TicketRecord[] {
  if (!Array.isArray(document?.tickets_list)) return [];
  return document.tickets_list.map(asRecord);
}

function statusOf(ticket: TicketRecord): 'open' | 'closed' {
  return stringValue(ticket.status) === 'closed' ? 'closed' : 'open';
}

function errorWithStatus(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

async function getManagedGuild(accessToken: string, guildId: string): Promise<void> {
  const response = await fetch(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw errorWithStatus(response.status === 401 ? 'Discord authentication is required' : 'Discord authentication failed', response.status === 401 ? 401 : 403);
  }

  const guilds = (await response.json()) as Array<{
    id: string;
    owner: boolean;
    permissions: string | number;
  }>;
  const guild = guilds.find((candidate) => candidate.id === guildId);
  if (!guild) throw errorWithStatus('You do not have permission to manage this server', 403);

  const permissions = BigInt(guild.permissions);
  if (!guild.owner && (permissions & MANAGE_GUILD) === BigInt(0) && (permissions & ADMINISTRATOR) === BigInt(0)) {
    throw errorWithStatus('You do not have permission to manage this server', 403);
  }
}

function staffIds(ticket: TicketRecord): string[] {
  const ids = stringArray(ticket.assignedStaff || ticket.assignees || ticket.assignedTo || []);
  const assigneeId = stringValue(ticket.assigneeId);
  if (assigneeId) ids.unshift(assigneeId);
  const closedBy = stringValue(ticket.closedBy);
  if (closedBy) ids.unshift(closedBy);
  return Array.from(new Set(ids.filter(Boolean)));
}

export async function GET(req: NextRequest) {
  const accessToken = (await sessionToken()) || '';
  const guildId = req.nextUrl.searchParams.get('guildId') || '';

  if (!accessToken) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!isSnowflake(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  try {
    await getManagedGuild(accessToken, guildId);
    const collection = await discordConfigCollection();
    const document = asRecord(await collection.findOne({ guildId }));
    const tickets = getTickets(document);
    const open = tickets.filter((ticket) => statusOf(ticket) === 'open').length;
    const closed = tickets.filter((ticket) => statusOf(ticket) === 'closed').length;

    const resolutionTimes: number[] = [];
    const handled = new Map<string, number>();
    const perDay = new Map<string, number>();

    for (const ticket of tickets) {
      for (const userId of staffIds(ticket)) {
        handled.set(userId, (handled.get(userId) || 0) + 1);
      }

      const createdAt = dateValue(ticket.createdAt);
      const closedAt = statusOf(ticket) === 'closed' ? dateValue(ticket.closedAt) : null;
      if (createdAt && closedAt) {
        const duration = closedAt.getTime() - createdAt.getTime();
        if (duration >= 0) resolutionTimes.push(duration);
      }

      if (createdAt) {
        const date = createdAt.toISOString().slice(0, 10);
        perDay.set(date, (perDay.get(date) || 0) + 1);
      }
    }

    const avgResolutionMs = resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((total, duration) => total + duration, 0) / resolutionTimes.length)
      : 0;
    const staffActivity = Array.from(handled.entries())
      .map(([userId, ticketsHandled]) => ({ userId, ticketsHandled }))
      .sort((a, b) => b.ticketsHandled - a.ticketsHandled || a.userId.localeCompare(b.userId));
    const ticketsPerDay = Array.from(perDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      open,
      closed,
      avgResolutionMs,
      staffActivity,
      ticketsPerDay,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load ticket statistics';
    const status = error instanceof Object && 'status' in error ? Number((error as { status: unknown }).status) : 500;
    return NextResponse.json({ success: false, error: message }, { status: Number.isFinite(status) ? status : 500 });
  }
}
