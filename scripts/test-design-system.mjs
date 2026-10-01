// Muragoods design-system contract tests.
//
//   node scripts/test-design-system.mjs
//
// The bug these pin is DRIFT. Muragoods shipped as several sites wearing one
// name: the shop was yellow, Murastream was Netflix red with the OS UI font,
// the dashboard was indigo on its own near-black canvas, and every area had
// invented its own radius and button. Nothing failed — each page looked fine
// alone. That is exactly the failure mode a reviewer cannot see and a user
// feels immediately on navigation.
//
// So the guarantees are asserted structurally, not by sampling a few pages:
//
//   1. There is ONE token layer, and every legacy token DERIVES from it
//      rather than repeating a literal.
//   2. The brand is Muragoods yellow, and it is the primary accent.
//   3. Murastream's red is a declared SECONDARY accent, never an identity.
//   4. The dashboard's primary accent is the brand, not its own hue.
//   5. One font family, loaded once, applied through tokens.
//   6. One radius scale; one transition scale; one shadow ramp.
//   7. Shared primitives exist for cards, buttons, inputs, badges and states.
//
// A new page that hardcodes #E50914 or invents a 7px radius fails here rather
// than in a screenshot review six weeks later.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function section(t) { console.log(`\n── ${t} ──`); }

/** Source with comments removed, so prose about a rule is not the rule. */
function code(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

const uiFiles = walk('app');
const tokens = readFileSync('app/design/tokens.css', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');

/** Every file that renders chrome, excluding data/catalog modules. */
function chromeFiles() {
  return uiFiles.filter((f) => !/\/api\//.test(f) && !/\/(lib|types|hooks|data)\//.test(f));
}

// ═══════════════════════════════════════════════════════════════════════════
section('The token layer is the single source of truth');

check('a design-token file exists and is loaded by the global stylesheet', () => {
  assert.ok(tokens.length > 2000, 'app/design/tokens.css looks empty');
  assert.ok(
    globals.includes('@import "./design/tokens.css"'),
    'globals.css must import the token layer, or nothing else can resolve it'
  );
});

check('the token layer is imported before any rule that consumes it', () => {
  const importAt = globals.indexOf('@import "./design/tokens.css"');
  const firstRule = globals.indexOf(':root');
  assert.ok(importAt > -1 && importAt < firstRule,
    'the @import must precede the legacy :root block that reads its tokens');
});

check('every token group is declared: brand, neutral, semantic, radius, shadow, motion', () => {
  for (const t of [
    '--mg-brand', '--mg-brand-hover', '--mg-brand-ink',
    '--mg-bg', '--mg-surface', '--mg-border',
    '--mg-text', '--mg-text-muted',
    '--mg-success', '--mg-warning', '--mg-error', '--mg-info',
    '--mg-radius-sm', '--mg-radius-md', '--mg-radius-lg', '--mg-radius-xl',
    '--mg-shadow-sm', '--mg-shadow-md', '--mg-shadow-lg',
    '--mg-transition-fast', '--mg-transition-normal', '--mg-transition-slow',
  ]) {
    assert.ok(tokens.includes(`${t}:`), `missing design token ${t}`);
  }
});

check('legacy tokens derive from the design system instead of repeating literals', () => {
  // The mario-*/gold/crimson aliases predate the system. If they hold their own
  // hex values, the site has two palettes again — the exact bug this fixes.
  for (const legacy of ['--mario-bg', '--mario-yellow', '--gold', '--mario-text', '--surface']) {
    const m = globals.match(new RegExp(`${legacy}:\\s*([^;]+);`));
    assert.ok(m, `legacy token ${legacy} should still exist for existing call sites`);
    assert.ok(m[1].includes('var(--mg-'),
      `${legacy} must resolve to a --mg-* token, but it holds "${m[1].trim()}"`);
  }
});

check('the body uses the shared type ramp, not a page-local font', () => {
  assert.ok(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/s.test(globals),
    'body must set the shared sans stack');
});

check('Tailwind utilities are generated from the same tokens', () => {
  assert.ok(globals.includes('@theme inline'), 'globals.css must expose tokens to Tailwind');
  assert.ok(globals.includes('--color-brand: var(--mg-brand)'),
    'bg-brand / text-brand must resolve to the canonical brand token');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Muragoods yellow is the brand');

check('the brand is a Muragoods gold, and the ink on it is dark', () => {
  const brand = tokens.match(/--mg-brand:\s*(#[0-9a-fA-F]{6})/);
  assert.ok(brand, '--mg-brand must be an explicit hex');
  const hex = brand[1].toLowerCase();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Gold/yellow: red and green high, blue clearly the lowest channel.
  assert.ok(r > 200 && g > 170 && b < 120,
    `the brand must read as Muragoods gold, got ${hex}`);
  assert.ok(tokens.includes('--mg-brand-ink:'), 'a fill needs a defined ink colour for its text');
});

check('the brand colour is the project\'s established gold, not an invented hue', () => {
  assert.ok(tokens.includes('#ffd60a'),
    'Muragoods already had a gold (#ffd60a) on the logo, CTAs and points — reuse it');
});

check('the unified surfaces read the brand as a token, not a raw hex', () => {
  // Scoped deliberately. Older pages still spell the gold out (#ffd60a) and
  // look identical, so rewriting fifty files buys nothing but diff risk. The
  // bar this sets is for the surfaces the design system now owns: if a NEW
  // page joins the unified set it must reach for the token, not the hex.
  const owned = chromeFiles().filter((f) =>
    f.startsWith('app/murastream/') || f.startsWith('app/dashboard/') || f.startsWith('app/components/ui/'));
  const offenders = owned.filter((f) => /#ffd60a/i.test(code(f)));
  assert.deepEqual(offenders, [],
    `these files hardcode the brand hex instead of using var(--mg-brand):\n      ${offenders.join('\n      ')}`);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Murastream is Muragoods with a cinematic accent');

check('Murastream tokens resolve to the shared foundation', () => {
  const src = code('app/murastream/MuraStreamLayoutClient.tsx');
  for (const pair of [
    ['--ms-bg', '--mg-bg'],
    ['--ms-surface', '--mg-surface'],
    ['--ms-text', '--mg-text'],
  ]) {
    const m = src.match(new RegExp(`${pair[0]}:\\s*([^;]+);`));
    assert.ok(m, `${pair[0]} must exist`);
    assert.ok(m[1].includes(pair[1]),
      `${pair[0]} must resolve to ${pair[1]}, but it holds "${m[1].trim()}"`);
  }
});

check('Murastream\'s accent is the brand, with red declared as secondary', () => {
  const src = code('app/murastream/MuraStreamLayoutClient.tsx');
  assert.ok(/--ms-accent:\s*var\(--mg-brand\)/.test(src),
    'Murastream\'s primary accent must be the Muragoods brand');
  assert.ok(/--ms-cinema:\s*var\(--mg-accent-stream\)/.test(src),
    'the cinematic red must exist, but as a named secondary accent');
});

check('no page still paints itself Netflix red', () => {
  const offenders = chromeFiles().filter((f) => /#E50914|229,\s*9,\s*20/.test(code(f)));
  assert.deepEqual(offenders, [],
    `these files still hardcode the streaming-site red:\n      ${offenders.join('\n      ')}`);
});

check('Murastream uses the Muragoods font, not the OS UI stack', () => {
  const offenders = uiFiles.filter((f) =>
    /-apple-system|BlinkMacSystemFont|Segoe UI/.test(code(f)));
  assert.deepEqual(offenders, [],
    `these files still name an OS font stack instead of var(--font-sans):\n      ${offenders.join('\n      ')}`);
});

check('the Murastream wordmark is the brand colour', () => {
  const nav = code('app/murastream/components/MuraStreamLayout.tsx');
  assert.ok(/\.ms-topnav-logo\s*\{[^}]*color:\s*var\(--ms-accent\)/s.test(nav),
    'the Murastream wordmark must use the brand accent, not its own red');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Murabot is Muragoods with module accents');

check('the dashboard accent is the Muragoods brand', () => {
  const cc = readFileSync('app/dashboard/cc.css', 'utf8');
  assert.ok(/--cc-accent:\s*var\(--mg-brand\)/.test(cc),
    'the dashboard primary accent must be the brand, not an indigo of its own');
  assert.ok(!/--cc-accent:\s*#/.test(cc),
    'the dashboard accent must not be a hardcoded hex');
});

check('dashboard module accents are declared as SECONDARY tokens', () => {
  const cc = readFileSync('app/dashboard/cc.css', 'utf8');
  for (const m of ['moderation', 'music', 'economy', 'leveling', 'tickets']) {
    assert.ok(new RegExp(`--cc-mod-${m}:`).test(cc),
      `module accent --cc-mod-${m} must be declared once, centrally`);
  }
});

check('dashboard chrome reads the shared surfaces and motion', () => {
  const cc = readFileSync('app/dashboard/cc.css', 'utf8');
  assert.ok(/--cc-bg:\s*var\(--mg-bg\)/.test(cc), 'dashboard canvas must be the shared background');
  assert.ok(/--cc-panel:\s*var\(--mg-glass-bg\)/.test(cc), 'panels must use the shared glass fill');
  assert.ok(cc.includes('var(--mg-transition-fast)'), 'dashboard must use the shared motion scale');
});

check('no dashboard module invents its own dashboard-local brand colour', () => {
  const indigo = ['#6366f1', '#7c7ff5', 'rgba(88,101,242'];
  const offenders = walk('app/dashboard').filter((f) => {
    const src = code(f);
    return indigo.some((c) => src.includes(c));
  });
  assert.deepEqual(offenders, [],
    `the dashboard's old indigo identity survives in:\n      ${offenders.join('\n      ')}`);
});

// ═══════════════════════════════════════════════════════════════════════════
section('One set of primitives');

check('the shared card, button, input, badge and state components exist', () => {
  for (const f of [
    'app/components/ui/GlassCard.tsx',
    'app/components/ui/GlassButton.tsx',
    'app/components/ui/GlassInput.tsx',
    'app/components/ui/Badge.tsx',
    'app/components/ui/States.tsx',
    'app/components/ui/index.ts',
  ]) {
    let ok = true;
    try { readFileSync(f); } catch { ok = false; }
    assert.ok(ok, `missing shared primitive ${f}`);
  }
});

check('the button system defines the five intents on one geometry', () => {
  const src = code('app/components/ui/GlassButton.tsx');
  for (const v of ['primary', 'secondary', 'ghost', 'danger', 'success']) {
    assert.ok(src.includes(`'${v}'`), `button variant ${v} must exist`);
  }
  assert.ok(tokens.includes('.mg-btn-primary'), 'primary must be a brand fill');
  assert.ok(/--mg-brand-ink/.test(tokens), 'text on the brand fill needs the ink token');
});

check('the primary button is yellow, and danger is the only red button', () => {
  const btn = code('app/design/tokens.css');
  const primary = btn.match(/\.mg-btn-primary\s*\{([^}]*)\}/);
  assert.ok(primary, '.mg-btn-primary must exist');
  assert.ok(primary[1].includes('var(--mg-brand)'), 'the primary button is the brand colour');
  const danger = btn.match(/\.mg-btn-danger\s*\{([^}]*)\}/);
  assert.ok(danger && danger[1].includes('var(--mg-error)'), 'danger uses the error token');
  assert.ok(!primary[1].includes('var(--mg-error)'), 'the primary button must never be red');
});

check('status colours are semantic and consistent', () => {
  assert.ok(/--mg-success:\s*#06d6a0/.test(tokens), 'success is green');
  assert.ok(/--mg-warning:\s*#fbbf24/.test(tokens), 'warning is amber');
  assert.ok(/--mg-error:\s*#f87171/.test(tokens), 'error is red');
  assert.ok(/--mg-info:\s*#60a5fa/.test(tokens), 'info is blue');
});

check('loading and error states are shared, not re-invented per page', () => {
  const states = code('app/components/ui/States.tsx');
  for (const s of ['LoadingState', 'EmptyState', 'ErrorState']) {
    assert.ok(states.includes(s), `${s} must exist`);
  }
  assert.ok(tokens.includes('.mg-spinner') && tokens.includes('.mg-state-error'),
    'the shared spinner and error surface must be token-backed');
});

check('there is one focus treatment, defined once', () => {
  assert.ok(tokens.includes(':where(a, button, input, select, textarea, [tabindex]):focus-visible'),
    'focus rings must be defined once in the design system');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Geometry and motion are standardised');

check('the radius scale is a single ramp', () => {
  const steps = ['sm', 'md', 'lg', 'xl']
    .map((n) => {
      const m = tokens.match(new RegExp(`--mg-radius-${n}:\\s*(\\d+)px`));
      return m ? parseInt(m[1], 10) : null;
    });
  assert.ok(steps.every((v) => Number.isFinite(v)), 'all four radius steps must be declared in px');
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b),
    'the radius scale must increase monotonically');
  assert.ok(tokens.includes('--mg-radius-pill:'), 'a pill radius is needed for chips and badges');
});

check('the motion scale is a single ramp with shared easing', () => {
  const steps = [...tokens.matchAll(/--mg-transition-(fast|normal|slow):\s*([^;]+);/g)]
    .map((m) => ({ name: m[1], ms: parseInt(m[2], 10) }));
  assert.equal(steps.length, 3, 'all three motion steps must be declared');
  assert.ok(steps.every((s) => Number.isFinite(s.ms)),
    'each motion step must start with a duration');
  const order = ['fast', 'normal', 'slow'].map((n) => steps.find((s) => s.name === n).ms);
  assert.deepEqual(order, [...order].sort((a, b) => a - b),
    'motion must escalate fast → normal → slow, not be redefined per page');
});

check('the glass effect is one definition, reused', () => {
  const glassBlocks = [...tokens.matchAll(/\.(mg-glass|mg-card)\s*\{([^}]*)\}/g)];
  assert.equal(glassBlocks.length, 2, 'glass is defined once for a surface and once for a card');
  for (const [, , body] of glassBlocks) {
    assert.ok(body.includes('var(--mg-glass-bg)'), 'both must read the shared glass fill');
  }
  assert.ok(tokens.includes('--mg-glass-blur:'), 'one blur value, not one per page');
});

check('animation respects reduced-motion', () => {
  assert.ok(tokens.includes('prefers-reduced-motion'),
    'shared motion must degrade for users who ask it to');
});

// ═══════════════════════════════════════════════════════════════════════════
section('The brand survives the unification');

check('brand assets are still referenced, not replaced with placeholders', () => {
  // The goal was to unify the INTERFACE, not to erase the personality. The
  // logo, the game artwork and the product photography all stay.
  const logoUsers = ['app/components/NavBar.tsx', 'app/admin/page.tsx', 'app/components/NotificationSetup.tsx'];
  for (const f of logoUsers) {
    assert.ok(code(f).includes('muragoods-logo'), `${f} must keep the Muragoods logo`);
  }
  const home = code('app/page.tsx');
  assert.ok(/mario-hero|mario-waving|menu-/.test(home),
    'the homepage illustrations must survive the unification');
});

check('the game palette is preserved as CONTENT colour, not flattened into the brand', () => {
  for (const g of ['--mario-red', '--mario-green', '--mario-blue', '--mario-orange']) {
    assert.ok(globals.includes(`${g}:`), `${g} is part of the illustrated game world and must stay`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks\n`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log(`All ${passed} design-system checks passed.`);
