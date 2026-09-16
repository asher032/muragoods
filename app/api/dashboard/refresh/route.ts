import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/dashboard/refresh — refresh Discord data (channels, roles, members)
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const guildId = req.headers.get('x-guild-id');

  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const DISCORD_API = 'https://discord.com/api/v10';

  try {
    const [channelsRes, rolesRes, membersRes] = await Promise.all([
      fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` },
      }),
      fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${botToken}` },
      }),
      fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000`, {
        headers: { Authorization: `Bot ${botToken}` },
      }),
    ]);

    if (!channelsRes.ok || !rolesRes.ok) {
      const status = channelsRes.ok ? rolesRes.status : channelsRes.status;
      return NextResponse.json({
        success: false,
        error: `Discord API returned ${status} — check bot permissions and try again.`,
      }, { status });
    }

    const channels = await channelsRes.json();
    const roles = await rolesRes.json();
    const members = await membersRes.json();

    return NextResponse.json({
      success: true,
      channels: channels.filter((c: { type: number }) => [0, 2, 4, 5].includes(c.type)).map((c: { id: string; name: string; type: number; parent_id?: string | null }) => ({
        id: c.id, name: c.name, type: c.type, parentId: c.parent_id || null,
      })),
      roles: roles
        .filter((r: { managed: boolean; id: string; guild_id?: string }) => !r.managed && r.id !== guildId)
        .sort((a: { position: number }, b: { position: number }) => b.position - a.position)
        .map((r: { id: string; name: string; color?: number; position?: number; hoist?: boolean }) => ({
          id: r.id, name: r.name, color: r.color || 0, position: r.position || 0, hoist: r.hoist || false,
        })),
      members: (members || [])
        .filter((m: { user?: { id: string; username: string; global_name?: string | null } }) => m.user)
        .map((m: { user: { id: string; username: string; global_name?: string | null }; nick?: string | null }) => ({
          id: m.user.id,
          name: m.nick || m.user.global_name || m.user.username,
          username: m.user.username,
          userId: m.user.id,
        })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Failed to refresh data: ${err}` }, { status: 500 });
  }
}
