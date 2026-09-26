import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botToken } from '@/app/lib/discord-bot';

// GET /api/discord/guilds/:guildId/channels?type=text|voice|category|all —
// real channels for dashboard channel selectors. Same auth/permission model
// as the member/role finders: session cookie, caller-must-manage,
// this-guild-only. Threads are excluded (transient children, not config
// targets); categories carry through so the UI can group.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';

const TEXT_TYPES = [0, 5, 15];
const VOICE_TYPES = [2, 13];
const CATEGORY_TYPES = [4];

type RestChannel = { id: string; name: string; type: number; parent_id?: string | null };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  const filter = (req.nextUrl.searchParams.get('type') || 'all').toLowerCase();
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }
  const wanted =
    filter === 'text' ? TEXT_TYPES
    : filter === 'voice' ? VOICE_TYPES
    : filter === 'category' ? CATEGORY_TYPES
    : [...TEXT_TYPES, ...VOICE_TYPES, ...CATEGORY_TYPES];

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
  let channels: RestChannel[] | null = null;
  try {
    const resp = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${bToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    status = resp.status;
    if (resp.ok) {
      const data = (await resp.json().catch(() => null)) as RestChannel[] | null;
      if (Array.isArray(data)) channels = data;
    }
  } catch {
    status = 0;
  }

  if (!channels) {
    if (status === 404) {
      return NextResponse.json(
        { success: false, code: 'BOT_NOT_INSTALLED', error: 'MuraBot is not installed on this server.' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        success: false, code: 'CHANNEL_FETCH_FAILED', error: 'Channels could not be loaded — retry in a moment.',
        retryable: true, debug: { guildId, discordStatus: status },
      },
      { status: 502 },
    );
  }

  const names = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c.name]));
  return NextResponse.json({
    success: true,
    channels: channels
      .filter((c) => wanted.includes(c.type))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parent_id || null,
        parentName: (c.parent_id && names.get(c.parent_id)) || null,
      })),
  });
}
