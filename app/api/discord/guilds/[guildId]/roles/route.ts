import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botToken } from '@/app/lib/discord-bot';

// GET /api/discord/guilds/:guildId/roles — real roles for dashboard role
// selectors. Same auth/permission model as the member finder: session cookie,
// caller-must-manage, this-guild-only. Managed integration roles and
// @everyone are flagged (not silently dropped) so the UI can label them;
// sorted by position descending.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';

type RestRole = {
  id: string; name: string; position: number; color: number; managed: boolean;
  permissions: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }

  const guard = await requireSession();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: guard.error },
      { status: guard.status },
    );
  }
  const manage = await requireGuildManage(guard.accessToken, guildId);
  if (!manage.ok) {
    return NextResponse.json(
      { success: false, code: manage.code, error: manage.error, retryable: manage.retryable, debug: manage.debug },
      { status: manage.status },
    );
  }

  const bToken = botToken();
  if (!bToken) {
    return NextResponse.json(
      { success: false, code: 'BOT_NOT_CONFIGURED', error: 'Dashboard resource access is not configured (DISCORD_BOT_TOKEN).' },
      { status: 503 },
    );
  }

  let status = 0;
  let roles: RestRole[] | null = null;
  try {
    const resp = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${bToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    status = resp.status;
    if (resp.ok) {
      const data = (await resp.json().catch(() => null)) as RestRole[] | null;
      if (Array.isArray(data)) roles = data;
    }
  } catch {
    status = 0;
  }

  if (!roles) {
    if (status === 404) {
      return NextResponse.json(
        { success: false, code: 'BOT_NOT_INSTALLED', error: 'MuraBot is not installed on this server.' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        success: false, code: 'ROLE_FETCH_FAILED', error: 'Roles could not be loaded — retry in a moment.',
        retryable: true, debug: { guildId, discordStatus: status },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    roles: roles
      .slice()
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        color: r.color || 0,
        managed: r.managed,
        everyone: r.id === guildId,
      })),
  });
}
