import { NextResponse } from 'next/server';
import { resolveAccess, describeAccess, STAFF_SCOPES } from '@/app/lib/access-control';
import { FEATURES, FEATURE_AREAS } from '@/app/lib/feature-registry';

export const dynamic = 'force-dynamic';

// Who am I, and what exists?
//
// The panel and the dashboard used to each invent their own idea of what a
// signed-in person may see. This returns the single server-side answer, so
// both surfaces render from the same authority — and so an unauthorized
// visitor gets a LEVEL instead of a blank page.
//
// The level is deliberately readable by anyone, including signed-out visitors:
// that is what lets the app send a stranger to the Discord dashboard instead
// of showing them an error. The feature registry is not — it is the map of
// the admin panel, so it is included only for people who may use the panel.

export async function GET(req: Request) {
  const access = await resolveAccess(req);
  const summary = describeAccess(access);

  return NextResponse.json({
    success: true,
    level: access.level,
    summary,
    identity: {
      userId: access.userId ?? null,
      email: access.email ?? null,
      name: access.name ?? null,
      discordId: access.discordId ?? null,
      discordUsername: access.discordUsername ?? null,
      scopes: access.scopes,
    },
    staffScopes: STAFF_SCOPES,
    canUse: {
      adminPanel: access.level === 'muragoods_owner' || access.level === 'muragoods_staff',
      // The dashboard is for Discord server admins — and for the owner, who
      // is welcome to use it but does not NEED to.
      discordDashboard: access.level === 'muragoods_owner'
        || access.level === 'muragoods_staff'
        || access.discordId !== undefined,
      fullEcosystemControl: access.level === 'muragoods_owner',
    },
    // Null for anyone outside the panel: the map of admin surfaces is not
    // something a random visitor should be able to enumerate.
    registry: access.level === 'muragoods_owner' || access.level === 'muragoods_staff'
      ? { areas: FEATURE_AREAS, features: FEATURES, count: FEATURES.length }
      : null,
  });
}
