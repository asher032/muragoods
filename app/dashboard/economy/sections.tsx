'use client';

// ── Section registry for the Economy control centre ─────────────────────
//
// The order here IS the page's information architecture, and it is split into
// two groups on purpose:
//
//   FEATURES     — what an authorized person can actually use or manage.
//   INFORMATION  — what happened, and how the system is behaving.
//
// Features come first. Statistics, logs and health are diagnostic, and burying
// them under the controls is what made this page hard to use.

export type SectionId =
  // Features
  | 'overview' | 'shop' | 'inventory' | 'items' | 'market' | 'work'
  | 'rewards' | 'lottery' | 'achievements' | 'fishing' | 'farm' | 'pets'
  | 'minigames' | 'config'
  // Information
  | 'statistics' | 'leaderboards' | 'logs' | 'transactions'
  | 'antiExploit' | 'health' | 'status';

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  blurb: string;
  group: 'features' | 'information';
}

export const SECTIONS: SectionDef[] = [
  // ── FEATURES ──────────────────────────────────────────────────────
  { id: 'overview',    label: 'Overview',      icon: '💰', blurb: 'Circulation and wallet totals',            group: 'features' },
  { id: 'shop',        label: 'Shop',          icon: '🛒', blurb: 'Shop inventory, prices and rotations',    group: 'features' },
  { id: 'inventory',   label: 'Inventory',     icon: '📦', blurb: 'Inspect inventory-related systems',       group: 'features' },
  { id: 'items',       label: 'Items',         icon: '🎒', blurb: 'The canonical Murabot item catalog',      group: 'features' },
  { id: 'market',      label: 'Market',        icon: '🏪', blurb: 'Marketplace functionality',               group: 'features' },
  { id: 'work',        label: 'Jobs / Work',   icon: '⚒️', blurb: 'Job and work configuration',              group: 'features' },
  { id: 'rewards',     label: 'Rewards',       icon: '🎁', blurb: 'Reward sources and item drops',          group: 'features' },
  { id: 'lottery',     label: 'Lottery',       icon: '🎟️', blurb: 'Lottery settings',                       group: 'features' },
  { id: 'achievements', label: 'Achievements', icon: '🏆', blurb: 'Achievements and rewards',                group: 'features' },
  { id: 'fishing',     label: 'Fishing',       icon: '🎣', blurb: 'Fishing economy',                        group: 'features' },
  { id: 'farm',        label: 'Farm',          icon: '🌱', blurb: 'Farming economy',                         group: 'features' },
  { id: 'pets',        label: 'Pets',          icon: '🐾', blurb: 'Pet economy',                             group: 'features' },
  { id: 'minigames',   label: 'Minigames',     icon: '🎮', blurb: 'Economy-related games',                   group: 'features' },
  { id: 'config',      label: 'Configuration', icon: '⚙️', blurb: 'Manage allowed economy settings',        group: 'features' },

  // ── INFORMATION ───────────────────────────────────────────────────
  { id: 'statistics',   label: 'Statistics',      icon: '📊', blurb: 'How the economy is being used',   group: 'information' },
  { id: 'leaderboards', label: 'Leaderboards',    icon: '🏆', blurb: 'One row per canonical user',     group: 'information' },
  { id: 'logs',         label: 'Economy Logs',    icon: '📜', blurb: 'Recent audited mutations',       group: 'information' },
  { id: 'transactions', label: 'Transactions',    icon: '💳', blurb: 'Filter the audit ledger',        group: 'information' },
  { id: 'antiExploit',  label: 'Anti-Exploit',    icon: '🛡️', blurb: 'Protections and anomaly findings', group: 'information' },
  { id: 'health',       label: 'Economy Health',  icon: '❤️', blurb: 'Circulation, flow and volume',   group: 'information' },
  { id: 'status',       label: 'System Status',   icon: '🔌', blurb: 'Where these numbers come from',  group: 'information' },
];

export function EconomyFeatureCards({ active, onSelect, shopItemCount }: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  shopItemCount?: number;
}) {
  const features = SECTIONS.filter((s) => s.group === 'features');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
      {features.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 10,
              background: isActive ? 'var(--cc-accent-soft)' : 'var(--cc-panel-solid)',
              border: `1px solid ${isActive ? 'var(--cc-accent)' : 'var(--cc-border, #2a2a3a)'}`,
              color: 'inherit',
              transition: 'border-color 120ms ease, background 120ms ease',
            }}
          >
            <div style={{ fontSize: 18, lineHeight: 1.2 }}>{section.icon}</div>
            <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>
              {section.label}
              {section.id === 'shop' && shopItemCount
                ? <span style={{ color: 'var(--cc-text-faint)', fontWeight: 400 }}> · {shopItemCount}</span>
                : null}
            </div>
            <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--cc-text-faint)', lineHeight: 1.35 }}>
              {section.blurb}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function EconomyInformationNav({ active, onSelect }: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const info = SECTIONS.filter((s) => s.group === 'information');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {info.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            style={{
              cursor: 'pointer',
              padding: '5px 10px',
              fontSize: 12,
              borderRadius: 999,
              border: `1px solid ${isActive ? 'var(--cc-accent)' : 'var(--cc-border, #2a2a3a)'}`,
              background: isActive ? 'var(--cc-accent-soft)' : 'transparent',
              color: isActive ? '#fff' : 'var(--cc-text-dim)',
            }}
          >
            {section.icon} {section.label}
          </button>
        );
      })}
    </div>
  );
}