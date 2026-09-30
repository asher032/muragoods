// ── Owner-only economic values ──────────────────────────────────────────
//
// These keys define economic value: currency identity, reward amounts,
// cooldowns, risk limits, ticket pricing and item economics.
//
// The rule is enforced in THREE places, deliberately:
//
//   1. the UI disables these controls for non-owners (courtesy),
//   2. /api/dashboard/economy/config refuses a non-owner economic write,
//   3. Murabot re-checks the caller server-side before persisting.
//
// Only (2) and (3) are security. (1) exists so the page is not a wall of dead
// buttons. Keeping the set in its own module means the client and the API
// cannot drift by accident — importing a route file into a component would
// pull server-only code across the boundary.

export const ECONOMIC_KEYS: ReadonlySet<string> = new Set([
  'currencyName',
  'currencySymbol',
  'startBalance',
  'dailyAmount',
  'weeklyAmount',
  'monthlyAmount',
  'workMin',
  'workMax',
  'begMin',
  'begMax',
  'gambleMax',
  'gambleCooldownSec',
  'workCooldownSec',
  'begCooldownSec',
  'crimeCooldownSec',
  'activityCooldownSec',
  'robCooldownSec',
  'robMinTarget',
  'lotteryTicketPrice',
  'lotteryMaxTickets',
  'jobCooldownSec',
  'jobFailRate',
  'jobCooldownOverrides',
  'disabledJobs',
  'disabledItems',
  'bankCapacity',
]);

/** Human-readable name for a key, used in validation and rejection messages. */
export const ECONOMIC_LABELS: Readonly<Record<string, string>> = {
  currencyName: 'Currency name',
  currencySymbol: 'Currency symbol',
  startBalance: 'Starting balance',
  dailyAmount: 'Daily reward',
  weeklyAmount: 'Weekly reward',
  monthlyAmount: 'Monthly reward',
  workMin: 'Work minimum payout',
  workMax: 'Work maximum payout',
  begMin: 'Beg minimum',
  begMax: 'Beg maximum',
  gambleMax: 'Maximum bet',
  gambleCooldownSec: 'Gambling cooldown',
  workCooldownSec: 'Work cooldown',
  begCooldownSec: 'Beg cooldown',
  crimeCooldownSec: 'Crime cooldown',
  activityCooldownSec: 'Activity cooldown',
  robCooldownSec: 'Rob cooldown',
  robMinTarget: 'Rob minimum target balance',
  lotteryTicketPrice: 'Lottery ticket price',
  lotteryMaxTickets: 'Max tickets per round',
  jobCooldownSec: 'Job cooldown',
  jobFailRate: 'Job failure rate',
  jobCooldownOverrides: 'Per-job cooldowns',
  disabledJobs: 'Disabled jobs',
  disabledItems: 'Disabled items',
  bankCapacity: 'Base bank capacity',
};
