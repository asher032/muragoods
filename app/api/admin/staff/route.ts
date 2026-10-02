import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { requireOwner, STAFF_SCOPES, type StaffScope } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Staff access — the granular level between owner and Discord admin.
//
// "Admin" used to be a boolean, which meant the only way to give someone
// support access was to make them a super-admin over the economy ledger, the
// user table and Murabot. Staff are now scoped, and only the Muragoods owner
// can change scopes — a staff member cannot grant themselves a scope.
// ─────────────────────────────────────────────────────────────────────────

interface StaffRecord {
  _id: string;
  email: string;
  name: string;
  userId?: string | null;
  role: string;
  staffScopes: string[];
}

export async function GET(req: Request) {
  const guard = await requireOwner(req);
  if (!guard.ok) return guard.response;

  await dbConnect();
  const rows = await User.find({ $or: [{ role: 'admin' }, { staffScopes: { $exists: true, $ne: [] } }] })
    .select('email name userId role staffScopes')
    .lean<Array<{ _id: unknown; email: string; name: string; userId?: string; role: string; staffScopes?: string[] }>>();

  const staff: StaffRecord[] = rows.map((r) => ({
    _id: String(r._id),
    email: r.email,
    name: r.name,
    userId: r.userId ?? null,
    role: r.role,
    staffScopes: Array.isArray(r.staffScopes) ? r.staffScopes : [],
  }));

  return NextResponse.json({
    success: true,
    scopes: STAFF_SCOPES,
    staff,
    // Readable by the owner and by staff themselves, so the panel can show
    // "what can this person actually do" without inventing a client-side model.
    levels: [
      { id: 'muragoods_owner', label: 'Muragoods owner', grants: 'Everything, ecosystem-wide.' },
      { id: 'muragoods_staff', label: 'Muragoods staff', grants: 'Only the scopes listed here.' },
      { id: 'guild_admin', label: 'Discord server admin', grants: 'Only servers they manage in Discord.' },
      { id: 'user', label: 'Member', grants: 'Normal website and bot features.' },
    ],
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireOwner(req);
  if (!guard.ok) return guard.response;

  let body: { email?: string; scopes?: string[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ success: false, error: 'email required' }, { status: 400 });

  const requested = Array.isArray(body.scopes) ? body.scopes.map((s) => String(s).trim().toLowerCase()) : [];
  const invalid = requested.filter((s) => !(STAFF_SCOPES as readonly string[]).includes(s));
  if (invalid.length > 0) {
    return NextResponse.json({
      success: false,
      error: `Unknown scope(s): ${invalid.join(', ')}`,
      code: 'UNKNOWN_SCOPE',
      allowed: STAFF_SCOPES,
    }, { status: 400 });
  }
  const scopes = [...new Set(requested)] as StaffScope[];

  await dbConnect();
  const target = await User.findOne({ email });
  if (!target) {
    return NextResponse.json({ success: false, error: 'No Muragoods account with that email' }, { status: 404 });
  }

  // The owner is never demoted through this endpoint. Removing the ecosystem
  // owner is a deliberate act on the account itself, not a side effect of
  // editing scopes.
  if (target.role === 'admin') {
    return NextResponse.json({
      success: false,
      error: 'This account is the Muragoods owner. Scope changes do not apply to it.',
      code: 'OWNER_ACCOUNT',
    }, { status: 409 });
  }

  target.staffScopes = scopes;
  await target.save();

  return NextResponse.json({
    success: true,
    email,
    scopes,
    // An empty scope list means the person is no longer staff — said plainly
    // so the panel can say "access removed", not "updated".
    accessRemoved: scopes.length === 0,
  });
}
