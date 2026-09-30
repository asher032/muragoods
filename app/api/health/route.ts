import { NextResponse } from 'next/server';
import { probeDatabase } from '@/app/lib/db-health';
import { probeCluster, clusterUriSource, CLUSTERS, type ClusterName } from '@/app/lib/db/clusters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/health — lightweight service health for uptime monitors,
// Vercel cron keep-alive pings and the bot's keep-alive loop.
// Returns 200 when core dependencies respond, 503 when degraded.
//
// `database` stays a simple online/offline flag (the dashboard maps it that
// way) while `databaseDetail` carries a safe, classified reason
// (READY / CONFIGURATION_ERROR / AUTHENTICATION_FAILED / ENDPOINT_UNAVAILABLE /
// TIMEOUT / DATABASE_UNAVAILABLE) that never includes the connection string.
//
// `clusters` reports EVERY cluster separately, so "the site is up but the
// dashboard is pointed at the wrong cluster" is visible here instead of
// presenting as one healthy database. It contains a cluster name, a database
// name, a variable NAME and a state — never a URI, user or password. The
// legacy `players` cluster appears here too, with `status: 'legacy'`, so an
// operator can see it exists rather than rediscovering it from a missing
// screen; it is never connected to by the app.
export async function GET() {
  const health = await probeDatabase();
  const names = Object.keys(CLUSTERS) as ClusterName[];

  const clusters = await Promise.all(
    names.map(async (name) => {
      // probeCluster pings with a real connection; fall back to a pure config
      // read if the cluster is not configured at all, so the response still
      // lists every cluster with an actionable state.
      if (!clusterUriSource(name)) {
        return {
          cluster: name,
          clusterStatus: CLUSTERS[name].status,
          configuredFrom: null,
          expectedVariable: CLUSTERS[name].primary,
          owns: CLUSTERS[name].owns,
          state: 'CONFIGURATION_ERROR',
          ok: false,
        };
      }
      const status = await probeCluster(name);
      return {
        cluster: status.cluster,
        clusterStatus: CLUSTERS[name].status,
        configuredFrom: status.configuredFrom,
        expectedVariable: CLUSTERS[name].primary,
        owns: CLUSTERS[name].owns,
        database: status.database,
        state: status.state,
        ok: status.ok,
        responseTimeMs: status.responseTimeMs,
      };
    }),
  );

  const ok = health.state === 'READY';

  return NextResponse.json(
    {
      ok,
      service: 'muragoods-site',
      database: health.database,
      databaseDetail: health.detail,
      clusters,
      responseTimeMs: health.responseTimeMs,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
