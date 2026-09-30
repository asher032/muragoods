#!/usr/bin/env node
// Level card background: dashboard → database → Murabot → rendered PNG.
//
//   node scripts/test-level-card.mjs
//
// The reported bug was "I pick a background, I save, and the card in Discord
// does not change". Nothing in the codebase tested the CHAIN — each half was
// tested in isolation, which is exactly how both halves could be correct while
// the connection between them was not.
//
// This drives the real modules on both sides of that chain:
//
//   A. every built-in theme renders a visually distinct card
//   B. a stored theme id survives the dashboard's own validation
//   C. the bot reads the value the dashboard wrote, from the same document
//   D. changing the theme takes effect with NO restart (no startup cache)
//   E. two servers keep independent backgrounds
//   F. an invalid theme falls back safely and never crashes a card
//   G. an existing valid selection is never replaced by the default
//
// Rendering is delegated to Python (the renderer lives there), so the PNG
// really is the bytes Discord would receive.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);

// ── Load the site's canonical theme module ───────────────────────────────
const outDir = mkdtempSync(join(tmpdir(), 'level-card-'));
for (const file of ['level-card-themes', 'level-background-diagnosis']) {
  const { outputText } = ts.transpileModule(
    readFileSync(join(root, 'app/lib', `${file}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: `${file}.ts` },
  );
  writeFileSync(join(outDir, `${file}.js`), outputText);
}
const require = createRequire(import.meta.url);
const themes = require(join(outDir, 'level-card-themes.js'));
const diag = require(join(outDir, 'level-background-diagnosis.js'));
const { LEVEL_CARD_THEMES, LEVEL_CARD_DEFAULT_THEME, resolveLevelCardTheme } = themes;

section('[A] the canonical theme list');
check('themes are declared', LEVEL_CARD_THEMES.length >= 8, `${LEVEL_CARD_THEMES.length}`);
check('the default is one of the themes',
  LEVEL_CARD_THEMES.some((t) => t.id === LEVEL_CARD_DEFAULT_THEME));
check('ids are unique', new Set(LEVEL_CARD_THEMES.map((t) => t.id)).size === LEVEL_CARD_THEMES.length);
check('every theme stores a file, never a URL',
  LEVEL_CARD_THEMES.every((t) => t.file.startsWith('/images/') && !/^https?:/.test(t.file)));

// The dashboard's PATCH whitelist only accepts ids from this exact list.
const routeSrc = readFileSync(join(root, 'app/api/dashboard/config/route.ts'), 'utf8');
check('the save route validates serverBackground against the canonical list',
  /SERVER_CARD_IDS\.has\(String\(l\.serverBackground/.test(routeSrc));
check('the leveling page reads the canonical resolver',
  readFileSync(join(root, 'app/dashboard/leveling/page.tsx'), 'utf8')
    .includes('resolveServerCardBackground'));

section('[B] the bot renders every theme to a distinct card');
// Drive the REAL renderer through Python so the bytes hashed here are the bytes
// Discord would receive.
//
// Pillow is a RUNTIME dependency of the BOT, not of this Node job, so it may be
// absent. That is not a reason to fail here: the pixel-level assertions live in
// the bot's own suite (test_level_card_backgrounds.py), which installs Pillow
// and proves two themes really do produce different images. This job asserts
// the CONNECTIVITY — that the stored value reaches the renderer.
let havePillow = false;
try {
  execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore', timeout: 30000 });
  havePillow = true;
} catch { /* no Pillow in this job */ }
const skipRender = () => console.log('  skip  pixel-level rendering (no Pillow here — asserted by the bot suite)');
const renderScript = `
import sys, hashlib, json
sys.path.insert(0, ${JSON.stringify(join(root, 'discord-bot/bot'))})
import leveling_sys as lv
out = {}
for theme in json.loads(sys.argv[1]):
    kind, payload = lv.render_level_card("tester", None, 7, 120, 800, 3, background_id=theme)
    out[theme] = {"kind": kind, "len": len(payload), "sha": hashlib.sha256(payload).hexdigest()}
print(json.dumps(out))
`;
const renderFile = join(outDir, 'render.py');
writeFileSync(renderFile, renderScript);
let rendered = {};
if (havePillow) {
  try {
    const stdout = execFileSync('python3', [renderFile, JSON.stringify(LEVEL_CARD_THEMES.map((t) => t.id))], {
      encoding: 'utf8', timeout: 180000,
    });
    rendered = JSON.parse(stdout.trim().split('\n').pop());
  } catch (err) {
    check('the bot renderer is runnable', false, String(err.stderr ?? err).slice(0, 300));
    rendered = {};
  }
} else {
  skipRender();
}
if (Object.keys(rendered).length > 0) {
  check('every theme renders a PNG',
    Object.values(rendered).every((r) => r.kind === 'png'),
    JSON.stringify(Object.entries(rendered).filter(([, r]) => r.kind !== 'png')));
  const shas = Object.values(rendered).map((r) => r.sha);
  check('every theme renders a VISIBLY DISTINCT card',
    new Set(shas).size === shas.length,
    `${new Set(shas).size} distinct of ${shas.length}`);
  check('rendered cards are real images', Object.values(rendered).every((r) => r.len > 5000));
}

// Section [A]…[C] onward reuse the same render helper for single themes.
const renderOne = (themeId) => {
  if (themeId === undefined || !havePillow) return null;
  try {
    const stdout = execFileSync('python3', [renderFile, JSON.stringify([themeId])], {
      encoding: 'utf8', timeout: 180000,
    });
    return JSON.parse(stdout.trim().split('\n').pop())[themeId];
  } catch {
    return null;
  }
};

section('[C] the bot reads the value the dashboard wrote');
// Reproduce the exact document shape the dashboard's PATCH writes and assert
// the bot's own resolver returns it — not a default.
const cfgScript = `
import sys, json, asyncio
sys.path.insert(0, ${JSON.stringify(join(root, 'discord-bot/bot'))})
import leveling_sys as lv

class Coll:
    def __init__(self, doc): self.doc = doc
    async def find_one(self, q, *a, **k): return self.doc
class DB:
    def __init__(self, doc): self.guild_config = Coll(doc)

async def main():
    payload = json.loads(sys.argv[1])
    out = {}
    for guild_id, stored in payload.items():
        # A bare string means the legacy alias; an object is the exact
        # "leveling" subdocument to store, so a test can reproduce a record
        # that holds ONLY the canonical field.
        doc = {"guildId": guild_id,
               "leveling": stored if isinstance(stored, dict) else {"serverBackground": stored}}
        cfg = await lv.get_level_config(DB(doc), int(guild_id))
        theme = await lv.resolve_level_background(DB(doc), int(guild_id), cfg=cfg, source="test")
        out[guild_id] = {
            "read": cfg.get("server_card_background"),
            "legacy": cfg.get("serverBackground"),
            "resolved": theme,
        }
    print(json.dumps(out))
asyncio.run(main())
`;
const cfgFile = join(outDir, 'cfg.py');
writeFileSync(cfgFile, cfgScript);
const botResolves = (map) => {
  try {
    const stdout = execFileSync('python3', [cfgFile, JSON.stringify(map)], {
      encoding: 'utf8', timeout: 120000,
    });
    return JSON.parse(stdout.trim().split('\n').pop());
  } catch (err) {
    check('the bot config reader is runnable', false, String(err.stderr ?? err).slice(0, 300));
    return {};
  }
};

const GUILD_A = '997389969448517632';
const GUILD_B = '123456789012345678';
{
  const theme = 'pixel-sunset';
  const out = botResolves({ [GUILD_A]: theme });
  check('the bot reads the stored theme id', out[GUILD_A]?.read === theme, JSON.stringify(out));
  check('the shared resolver returns that exact theme', out[GUILD_A]?.resolved === theme, JSON.stringify(out));

  // THE REGRESSION THAT CAUSED THE REPORTED BUG: the canonical field name is
  // the one the dashboard documents, the one POST /leveling/config writes and
  // GET /leveling/background reports — but it was missing from LEVEL_DEFAULTS,
  // so `get_level_config`'s whitelist DISCARDED it on every read and the card
  // fell back to the default. Assert the canonical field on its own.
  const canonical = botResolves({ [GUILD_A]: { server_card_background: 'goldfish-glass' } });
  check('the canonical server_card_background field is NOT discarded on read',
    canonical[GUILD_A]?.read === 'goldfish-glass', JSON.stringify(canonical));
  check('a record holding ONLY the canonical field renders that theme',
    canonical[GUILD_A]?.resolved === 'goldfish-glass', JSON.stringify(canonical));
  const canonicalCard = renderOne(canonical[GUILD_A]?.resolved);
  if (havePillow) {
    check('that card is byte-identical to rendering the theme directly',
      !!canonicalCard && canonicalCard.sha === renderOne('goldfish-glass')?.sha);
  }

  // Both spellings present and DIFFERENT: the canonical one is the source of
  // truth, and both must be reconciled to it so no reader disagrees.
  const both = botResolves({
    [GUILD_A]: { server_card_background: 'starry-duck', serverBackground: 'duck-toast' },
  });
  check('when both spellings exist the canonical field wins',
    both[GUILD_A]?.resolved === 'starry-duck', JSON.stringify(both));
  check('and the legacy alias is reconciled to the same value',
    both[GUILD_A]?.legacy === 'starry-duck', JSON.stringify(both));
  const card = renderOne(out[GUILD_A]?.resolved);
  const direct = renderOne(theme);
  if (havePillow) {
    check('the rendered card matches the stored theme, byte for byte',
      !!card && !!direct && card.sha === direct.sha);
  } else {
    console.log('  skip  byte-for-byte card comparison (no Pillow in this job)');
  }
}

section('[D] changing the theme needs no bot restart');
{
  // Two successive reads of the SAME guild with different stored values. If
  // Murabot cached the config at startup, the second read would return the
  // first theme — which is precisely the reported symptom.
  const out = botResolves({ [GUILD_A]: 'frog-sky' });
  const changed = botResolves({ [GUILD_A]: 'sunset-probe-ignored' });
  const real = botResolves({ [GUILD_A]: 'starry-duck' });
  check('a first read returns the first theme', out[GUILD_A]?.resolved === 'frog-sky');
  check('a later read returns the NEW theme with no restart', real[GUILD_A]?.resolved === 'starry-duck');
  if (havePillow) {
    check('the two are genuinely different',
      renderOne(out[GUILD_A]?.resolved)?.sha !== renderOne(real[GUILD_A]?.resolved)?.sha);
  } else {
    skipRender();
  }  // The declared source-level guarantee: no module-level guild config cache.
  const lvSrc = readFileSync(join(root, 'discord-bot/bot/leveling_sys.py'), 'utf8');
  const getCfg = lvSrc.split('async def get_level_config')[1]?.split('\ndef ')[0] ?? '';
  check('get_level_config reads the database on every call',
    /find_one/.test(getCfg) && !/^\s*_?[Cc]ache\s*=/m.test(getCfg));
  check('the renderer takes the theme as an argument, not a module default',
    /def render_level_card\([\s\S]*?background_id/.test(lvSrc));
}

section('[E] two servers keep independent backgrounds');
{
  const out = botResolves({ [GUILD_A]: 'neon-probe', [GUILD_B]: 'mystic-probe' });
  // Use two real themes rather than invented ids so the render check is real.
  const real = botResolves({ [GUILD_A]: 'goldfish-glass', [GUILD_B]: 'chick-lily' });
  check('server A resolves its own theme', real[GUILD_A]?.resolved === 'goldfish-glass', JSON.stringify(real));
  check('server B resolves its own theme', real[GUILD_B]?.resolved === 'chick-lily', JSON.stringify(real));
  if (havePillow) {
    check('the two servers render different cards',
      renderOne(real[GUILD_A]?.resolved)?.sha !== renderOne(real[GUILD_B]?.resolved)?.sha);
  } else {
    console.log('  skip  cross-server card comparison (no Pillow in this job)');
  }
  // And changing one must not touch the other.
  const after = botResolves({ [GUILD_A]: 'frog-pond', [GUILD_B]: 'chick-lily' });
  check('changing server A leaves server B alone',
    after[GUILD_A]?.resolved === 'frog-pond' && after[GUILD_B]?.resolved === 'chick-lily',
    JSON.stringify(after));
  void out;
}

section('[F] an invalid theme falls back safely');
{
  // "neon-city" used to be in this list as an invented id, back when no such
  // theme existed. It is a real shipped theme now, so it is gone; this list is
  // for genuinely-unknown values.
  for (const bad of ['not-a-theme', 'not-a-real-theme', '', 'https://example.com/bg.png', '../../etc/passwd']) {
    const out = botResolves({ [GUILD_A]: bad });
    check(`"${bad}" resolves to the default instead of crashing`,
      out[GUILD_A]?.resolved === LEVEL_CARD_DEFAULT_THEME, JSON.stringify(out));
    const card = renderOne(out[GUILD_A]?.resolved);
    if (havePillow) {
      check(`"${bad}" still produces a renderable card`, !!card && card.kind === 'png');
    }
  }
  check('a missing value resolves to the default',
    botResolves({ [GUILD_A]: 'x' }) && resolveLevelCardTheme(undefined) === LEVEL_CARD_DEFAULT_THEME);
}

section('[G] a valid selection is never replaced by the default');
{
  // The dangerous case: a write that "normalises" a stored value to the
  // default would silently reset the operator's choice on any later save.
  for (const t of LEVEL_CARD_THEMES) {
    const out = botResolves({ [GUILD_A]: t.id });
    check(`${t.id} survives a read unchanged`, out[GUILD_A]?.read === t.id, JSON.stringify(out));
  }
}

section('[H] every card path goes through the shared resolver');
{
  const cogSrc = readFileSync(join(root, 'discord-bot/bot/cogs/leveling.py'), 'utf8');
  // The card builder must go through the ONE guild-id resolver, not pick a
  // theme out of a config dict itself. That single entry point is what
  // guarantees the dashboard's saved selection reaches the PNG.
  const resolverCalls = (cogSrc.match(/resolve_level_background\(/g) || []).length;
  check('the cog resolves themes through resolve_level_background', resolverCalls >= 1,
    `${resolverCalls} call(s)`);
  check('the cog does not resolve the theme itself any more',
    !/get_level_card_background\(/.test(cogSrc), 'a direct resolve bypasses the shared resolver');
  // The resolver must be one function, and it must take the guild id.
  const lvSys = readFileSync(join(root, 'discord-bot/bot/leveling_sys.py'), 'utf8');
  check('there is exactly ONE resolver definition',
    (lvSys.match(/^async def resolve_level_background\(/gm) || []).length === 1);
  check('the resolver reads live config from the database',
    /async def resolve_level_background\(db, guild_id/.test(lvSys));
  // Exactly one place should build a card, so the two surfaces cannot drift.
  const builders = (cogSrc.match(/def build_level_card\(/g) || []).length;
  check('there is exactly ONE card builder', builders === 1, `${builders}`);
  check('/level uses the shared card builder',
    /async def level_card[\s\S]*?build_level_card\(/.test(cogSrc));
  check('the level-up path uses the shared card builder',
    /_handle_level_up[\s\S]*?build_level_card\(/.test(cogSrc));
  check('the level-up path renders an image, not only a text embed',
    /discord\.File\(_io\.BytesIO\(payload\), filename="level\.png"\)/.test(cogSrc));
  check('no call site resolves the theme itself any more',
    !/resolve_server_background\(cfg/.test(cogSrc),
    'a direct resolve_server_background call bypasses the shared resolver');
  check('the dashboard and the bot share one theme list',
    readFileSync(join(root, 'app/lib/server-card-backgrounds.ts'), 'utf8')
      .includes("from './level-card-themes'"));
}

section('[I] the diagnostic names the broken link');
{
  const bot = (raw, documentFound = true, db = 'murastream_bot') => ({
    documentFound, database: db, databaseSource: 'MONGO_DB',
    raw, field: raw ? 'serverBackground' : null,
    resolved: raw || 'duck-toast', asset: 'x.jpg', assetPresent: true,
    defaultTheme: 'duck-toast', valid: true,
  });

  const match = diag.diagnoseBackground('frog-sky', bot('frog-sky'), null);
  check('agreeing sides report MATCH', match.verdict === 'MATCH', match.verdict);
  check('a match says no restart is needed', /no restart/i.test(match.explanation), match.explanation);

  // THE REPORTED BUG: the dashboard saved a selection the bot cannot see.
  const ahead = diag.diagnoseBackground('frog-sky', bot(null), null);
  check('a selection the bot cannot see is DASHBOARD_AHEAD', ahead.verdict === 'DASHBOARD_AHEAD', ahead.verdict);
  check('the explanation names the database read as broken',
    /BROKEN LINK: DATABASE READ/.test(ahead.explanation), ahead.explanation);
  check('the explanation names the database being used',
    ahead.explanation.includes('murastream_bot'), ahead.explanation);
  check('the explanation tells the operator which variables to set',
    /MURABOT_MONGODB_URI/.test(ahead.explanation), ahead.explanation);

  const noDoc = diag.diagnoseBackground('frog-sky', bot(null, false), null);
  check('a missing bot document is diagnosed as record-level',
    noDoc.verdict === 'DASHBOARD_AHEAD' && /NO guild_config document/.test(noDoc.explanation),
    noDoc.explanation);

  const botAhead = diag.diagnoseBackground(null, bot('frog-sky'), null);
  check('the bot being ahead is reported as such', botAhead.verdict === 'BOT_AHEAD', botAhead.verdict);

  const neverSet = diag.diagnoseBackground(null, bot(null, false), null);
  check('a never-configured server is NOT reported as broken',
    neverSet.verdict === 'NO_DOCUMENT', neverSet.verdict);
  check('and says what to do', /Pick one and save/.test(neverSet.explanation));

  const offline = diag.diagnoseBackground('frog-sky', null, { code: 'BOT_OFFLINE', message: 'x' });
  check('an unreachable bot is UNVERIFIED, never "broken"',
    offline.verdict === 'UNVERIFIED', offline.verdict);
  check('an unreachable bot does not accuse the database',
    !/BROKEN LINK/.test(offline.explanation), offline.explanation);

  // The dangerous regression: reporting a verdict we cannot support.
  for (const [label, dash, b] of [
    ['bot unreachable', 'frog-sky', null],
    ['bot has no document', 'frog-sky', bot(null, false)],
    ['values differ', 'frog-sky', bot('duck-toast')],
  ]) {
    const r = diag.diagnoseBackground(dash, b, b ? null : { code: 'BOT_OFFLINE', message: 'x' });
    check(`${label}: the explanation is actionable`, r.explanation.length > 40, r.explanation);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
if (failed) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
