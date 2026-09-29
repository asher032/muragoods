import dbConnect from '@/app/lib/mongodb';
import { DEFAULT_FAIL_RATE, type JobDef } from '@/app/lib/jobs';

// Admin tuning for Jobs, stored on the GameDefinition 'jobs' row:
//   config.failRate (0.05–0.9, default 0.3)
//   config.cooldownOverrides { [jobId]: seconds }
//   config.disabledJobs [jobId, ...]
//   enabled false → whole system in maintenance.
export interface JobsTuning {
  failRate: number;
  disabledJobs: Set<string>;
  enabled: boolean;
  cooldownFor: (job: JobDef) => number;
}

export async function jobsTuning(): Promise<JobsTuning> {
  let failRate = DEFAULT_FAIL_RATE;
  let overrides: Record<string, number> = {};
  let disabled: string[] = [];
  let enabled = true;
  try {
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    const def = await GameDefinition.findOne({ gameId: 'jobs' }).select('config enabled').lean() as {
      config?: { failRate?: number; cooldownOverrides?: Record<string, number>; disabledJobs?: string[] };
      enabled?: boolean;
    } | null;
    if (def) {
      if (def.enabled === false) enabled = false;
      const r = Number(def.config?.failRate);
      if (Number.isFinite(r)) failRate = Math.max(0.05, Math.min(0.9, r));
      if (def.config?.cooldownOverrides && typeof def.config.cooldownOverrides === 'object') {
        overrides = def.config.cooldownOverrides;
      }
      if (Array.isArray(def.config?.disabledJobs)) disabled = def.config.disabledJobs.map(String);
    }
  } catch {
    // Defaults stand when the store is unreachable.
  }
  return {
    failRate,
    disabledJobs: new Set(disabled),
    enabled,
    cooldownFor: (job: JobDef) => {
      const raw = Number(overrides[job.id]);
      if (Number.isFinite(raw)) return Math.max(60, Math.min(86400, Math.floor(raw)));
      return Math.max(60, job.cooldownMin * 60);
    },
  };
}
