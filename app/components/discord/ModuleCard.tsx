// Renders a single module card (e.g. 🎵 Music) driven by its ModuleDef.
// Handles toggles, selectors, numbers, text, selects + save/test/reset.
'use client';

import { useState } from 'react';
import { ModuleDef, FieldDef } from '@/app/lib/discord-modules';
import { useModules } from './ModuleProvider';
import { getPath, setPath } from './moduleUtils';
import { ResourceSelect } from './ResourceSelect';
import { PermissionChecker } from './PermissionChecker';
import { DiscordChannel, DiscordRole } from './types';

interface ModuleCardProps {
  module: ModuleDef;
  requiredPerms?: string[];
}

const REQUIRED_PERMS: Record<string, string[]> = {
  music: ['View Channels', 'Connect', 'Speak', 'Send Messages', 'Embed Links'],
  moderation: ['Manage Roles', 'Kick Members', 'Ban Members', 'Manage Channels', 'Manage Messages'],
  security: ['Manage Roles', 'Manage Channels', 'Manage Server', 'View Channels', 'Kick Members', 'Ban Members'],
  leveling: ['Manage Messages', 'View Channels', 'Embed Links'],
  economy: ['Manage Messages', 'View Channels', 'Embed Links', 'Attach Files'],
  fun: ['Send Messages', 'View Channels', 'Embed Links', 'Attach Files'],
  tickets: ['Manage Channels', 'Manage Roles', 'View Channels', 'Send Messages', 'Embed Links', 'Manage Messages'],
  giveaways: ['Manage Messages', 'Manage Channels', 'Embed Links', 'View Channels', 'Add Reactions'],
  suggestions: ['Manage Messages', 'View Channels', 'Embed Links', 'Add Reactions'],
  reminders: ['Send Messages', 'View Channels', 'Embed Links'],
  reputation: ['Manage Messages', 'View Channels', 'Embed Links'],
  murastream: ['View Channels', 'Embed Links'],
};

function FieldControl({
  field, value, onChange, guildId,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  guildId: string;
}) {
  const isToggle = field.type === 'toggle';
  const isSelect = field.type === 'select';

  if (isToggle) {
    return (
      <label className="switch-control">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track">
          <span className="switch-thumb" />
        </span>
      </label>
    );
  }

  if (isSelect && field.options) {
    return (
      <select
        className="deco-select"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'channel' || field.type === 'category' || field.type === 'role' || field.type === 'member') {
    return (
      <ResourceSelect
        kind={field.type === 'category' ? 'category' : field.type}
        guildId={guildId}
        value={String(value ?? '')}
        onChange={(id) => onChange(id)}
        placeholder={field.placeholder}
        label={field.label}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        className="deco-input"
        value={(value as number) ?? ''}
        step={field.default !== undefined ? (Number(field.default) % 1 === 0 ? 1 : 0.1) : 1}
        min={0}
        onChange={(e) => onChange(e.target.value === '' ? (field.default ?? 0) : Number(e.target.value))}
      />
    );
  }

  // text
  return (
    <input
      type="text"
      className="deco-input"
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ModuleCard({ module, requiredPerms }: ModuleCardProps) {
  const { config, setField, saveConfig, guildId, resetConfig, pushToast } = useModules();
  const [testing, setTesting] = useState(false);
  const perms = requiredPerms ?? REQUIRED_PERMS[module.id] ?? [];

  const enabled = config ? !!getPath(config, `modules.${module.id}`) : false;

  const onToggle = (v: boolean) => {
    setField(`modules.${module.id}`, v);
    if (v) pushToast('info', `${module.icon} ${module.label} enabled.`);
  };

  const onTest = async () => {
    setTesting(true);
    // Test is the permission check result; surface it via toast.
    pushToast('info', `🧪 Testing ${module.label}… check permissions below.`);
    setTimeout(() => setTesting(false), 600);
  };

  return (
    <div className={`module-card ${enabled ? '' : 'disabled'}`}>
      <div className="module-card-header">
        <span className="module-card-icon">{module.icon}</span>
        <h3 className="module-card-title">{module.label}</h3>
        <label className="switch-control toggle-enable">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
        </label>
      </div>

      <div className="module-card-body">
        {module.fields.map((field) => (
          <div key={field.key} className="module-field">
            <label className="module-field-label">
              {field.icon && <span className="field-icon">{field.icon}</span>}
              {field.label}
              {field.help && <span className="field-help">{field.help}</span>}
            </label>
            <div className="module-field-control">
              <FieldControl
                field={field}
                value={config ? getPath(config!, field.key) : field.default}
                onChange={(v) => setField(field.key, v)}
                guildId={guildId}
              />
            </div>
          </div>
        ))}

        {config && guildId && (
          <div className="module-perms">
            <PermissionChecker guildId={guildId} required={perms} />
          </div>
        )}

        <div className="module-actions">
          <button
            type="button"
            className="deco-btn deco-btn-sm deco-btn-gold"
            onClick={onTest}
            disabled={testing || !enabled || !guildId}
          >
            {testing ? '…' : '🧪 Test'}
          </button>
          <button
            type="button"
            className="deco-btn deco-btn-sm"
            onClick={saveConfig}
            disabled={!enabled || !guildId}
          >
            💾 Save Changes
          </button>
          <button
            type="button"
            className="deco-btn deco-btn-sm deco-btn-crimson"
            onClick={() => { resetConfig(); }}
            disabled={!guildId}
          >
            ↺ Reset
          </button>
        </div>
      </div>
    </div>
  );
}
