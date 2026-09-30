#!/usr/bin/env node
// CI guard for the Murabot economy read model.
//
//   node scripts/test-economy-store.mjs
//
// Two jobs, because both failure modes here are silent:
//
//   1. PARITY with discord-bot/bot/economy.py + shop.py. The dashboard reads
//      the same collections the slash commands read, with the same filters.
//      If the two implementations drift, the dashboard starts showing numbers
//      Discord disagrees with — and nothing crashes, so nothing complains.
//      This asserts the collection names, the guild key, the ledger type lists
//      and the defaults are identical, and that the site still resolves those
//      collections on the `murabot` cluster (never a new one).
//
//   2. BEHAVIOUR against an in-memory double: real rows produce real numbers,
//      an empty database produces zeros AND an `empty` state, and a database
//      that throws produces an `error` state — never an empty result. That
//      distinction is the whole point: "the read failed" and "there is nothing
//      to read" must never render the same.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

// ── Load the store under test ──────────────────────────────────────────
// The store imports the cluster registry and the generated catalog snapshot by
// alias. The registry is replaced with a stub (the test owns the fake
// database) and the catalog is the REAL file, so the shop assertions run
// against the same snapshot the build ships.
const outDir = mkdtempSync(join(tmpdir(), 'economy-store-test-'));
{
  const { outputText } = ts.transpileModule(
    readFileSync(join(root, 'app/lib/economy-store.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: 'economy-store.ts' },
  );
  writeFileSync(
    join(outDir, 'economy-store.js'),
    outputText
      .replace(/require\("@\/app\/lib\/db\/clusters"\)/g, 'require("./clusters.stub.js")')
      .replace(/require\("@\/app\/lib\/items-table\.json"\)/g, 'require("./items-table.json")'),
  );
  writeFileSync(join(outDir, 'clusters.stub.js'), `
    exports.clusterDbName = () => 'murastream_bot';
    exports.clusterUriSource = () => 'MURABOT_MONGODB_URI';
    exports.withDatabase = async (_c, fn) => {
      try { return { ok: true, data: await fn(globalThis.__FAKE_DB__), error: null }; }
      catch (e) { return { ok: false, data: null, error: { state: e && e.state || 'UNAVAILABLE', message: 'stub' } }; }
    };
  `);
  writeFileSync(join(outDir, 'items-table.json'), readFileSync(join(root, 'app/lib/items-table.json'), 'utf8'));
}
const require = createRequire(import.meta.url);
const store = require(join(outDir, 'economy-store.js'));
const table = require(join(outDir, 'items-table.json'));

// ── 1. Parity with the bot ─────────────────────────────────────────────
section('[1] parity with discord-bot/bot/economy.py and shop.py');
{
  const eco = readFileSync(join(root, 'discord-bot/bot/economy.py'), 'utf8');
  const shop = readFileSync(join(root, 'discord-bot/bot/shop.py'), 'utf8');

  check('the wallets collection is the bot\'s `economy`',
    store.ECONOMY_COLLECTIONS.wallets === 'economy' && /\bdb\.economy\b/.test(eco));
  check('the ledger collection is the bot\'s `economy_tx`',
    store.ECONOMY_COLLECTIONS.ledger === 'economy_tx' && /\bdb\.economy_tx\b/.test(eco));
  check('the stock collection is the bot\'s `economy_shop_stock`',
    store.ECONOMY_COLLECTIONS.stock === 'economy_shop_stock' && /\bdb\.economy_shop_stock\b/.test(shop));
  check('the config collection is the bot\'s `guild_config`',
    store.ECONOMY_COLLECTIONS.config === 'guild_config' && /guild_config/.test(eco));

  // Ledger type lists. A drift here silently changes what "rewards paid" or
  // "gambling volume" means, with no error anywhere.
  const pyTuple = (name) => {
    const m = eco.match(new RegExp(`${name}:\\s*tuple\\[str,\\s*\\.\\.\\.\\]\\s*=\\s*\\(([\\s\\S]*?)\\n\\)`));
    return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
  };
  check('_DESTROYING_TYPES matches the bot', JSON.stringify(store.DESTROYING_TYPES) === JSON.stringify(pyTuple('_DESTROYING_TYPES')),
    `bot: ${pyTuple('_DESTROYING_TYPES').join(',')} store: ${store.DESTROYING_TYPES.join(',')}`);
  check('_REWARD_TYPES matches the bot', JSON.stringify(store.REWARD_TYPES) === JSON.stringify(pyTuple('_REWARD_TYPES')),
    `bot: ${pyTuple('_REWARD_TYPES').join(',')} store: ${store.REWARD_TYPES.join(',')}`);
  check('_GAMBLE_TYPES matches the bot', JSON.stringify(store.GAMBLE_TYPES) === JSON.stringify(pyTuple('_GAMBLE_TYPES')),
    `bot: ${pyTuple('_GAMBLE_TYPES').join(',')} store: ${store.GAMBLE_TYPES.join(',')}`);

  const acts = eco.match(/TRANSACTION_ACTIONS:\s*tuple\[str,\s*\.\.\.\]\s*=\s*\(([\s\S]*?)\n\)/);
  const pyActions = acts ? [...acts[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : [];
  check('TRANSACTION_ACTIONS matches the bot', JSON.stringify(store.TRANSACTION_ACTIONS) === JSON.stringify(pyActions),
    `bot: ${pyActions.length} types, store: ${store.TRANSACTION_ACTIONS.length}`);

  // Defaults must be identical, because a dashboard showing 250 as the daily
  // reward while the bot pays something else is worse than showing nothing.
  const defBlock = eco.match(/ECONOMY_DEFAULTS:\s*dict\s*=\s*\{([\s\S]*?)\n\}/);
  check('ECONOMY_DEFAULTS is parseable in economy.py', !!defBlock);
  const pyDefaults = {};
  for (const m of (defBlock?.[1] ?? '').matchAll(/"([A-Za-z_][A-Za-z0-9_]*)":\s*("[^"]*"|\d+(?:\.\d+)?|\{\}|\[\])/g)) {
    pyDefaults[m[1]] = m[2] === '{}' ? {} : m[2] === '[]' ? [] : m[2].startsWith('"') ? m[2].slice(1, -1) : Number(m[2]);
  }
  const storeKeys = Object.keys(store.ECONOMY_DEFAULTS);
  const missing = Object.keys(pyDefaults).filter((k) => !storeKeys.includes(k));
  check('every bot default exists in the store', missing.length === 0, missing.join(', '));
  const wrong = Object.entries(pyDefaults).filter(([k, v]) => JSON.stringify(store.ECONOMY_DEFAULTS[k]) !== JSON.stringify(v));
  check('every default has the same value', wrong.length === 0,
    wrong.map(([k, v]) => `${k}: bot=${JSON.stringify(v)} store=${JSON.stringify(store.ECONOMY_DEFAULTS[k])}`).join('; '));

  // Shop sections and the section_for rule must match, or the same item would
  // appear in two different shops on the two surfaces.
  const secBlock = shop.match(/SECTIONS:\s*dict\[str,\s*dict\]\s*=\s*\{([\s\S]*?)\n\}\n/);
  const pySections = [];
  for (const m of (secBlock?.[1] ?? '').matchAll(/"(\w+)":\s*\{([\s\S]*?)\},?\n?/g)) {
    const id = m[1];
    const body = m[2];
    const label = body.match(/"label":\s*"([^"]+)"/)?.[1];
    const hours = body.match(/"hours":\s*(\d+)/)?.[1];
    const blurb = body.match(/"blurb":\s*"([^"]+)"/)?.[1];
    if (label && hours) pySections.push({ id, label, hours: Number(hours), blurb });
  }
  check('SHOP_SECTIONS matches the bot', JSON.stringify(store.SHOP_SECTIONS) === JSON.stringify(pySections),
    `bot: ${JSON.stringify(pySections)}\nstore: ${JSON.stringify(store.SHOP_SECTIONS)}`);
  check('section_for keeps fishing first', shop.includes('if "fish" in sources or "fishing_bonus" in sources')
    && /sources\.includes\('fish'\)/.test(store.SHOP_SECTIONS ? require('node:fs').readFileSync(join(outDir, 'economy-store.js'), 'utf8') : ''));
  check('section_for routes epic/godly to special', /rarity === 'epic' \|\| item\.rarity === 'godly'/.test(
    readFileSync(join(outDir, 'economy-store.js'), 'utf8')));

  // The dashboard must read the bot's cluster. A new cluster, or a second
  // client, would be a second economy — the exact thing this guards.
  const clusters = readFileSync(join(root, 'app/lib/db/clusters.ts'), 'utf8');
  check('the murabot cluster still owns the economy',
    /owns: 'guild config, economy, inventory/.test(clusters));
  check('the murabot database name matches the bot\'s',
    /defaultDb: 'murastream_bot'/.test(clusters));
  const storeSrc = readFileSync(join(root, 'app/lib/economy-store.ts'), 'utf8');
  check('the store only ever opens the murabot cluster', !/clusterDb\('(muragoods|players)'\)/.test(storeSrc));
  check('the store declares itself read-only', /Nothing here writes/.test(storeSrc));
  check('the store never writes to the economy collections',
    !/\.(insertOne|updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|bulkWrite|replaceOne)\(/.test(storeSrc));
}

// ── 2. Behaviour against an in-memory double ───────────────────────────
section('[2] behaviour against real rows');
const GUILD = '900000000000000001';
const U1 = '111111111111111111';
const U2 = '222222222222222222';
const U3 = '333333333333333333';

/** Minimal Mongo double: enough of the driver surface the store uses. */
function fakeDb({ wallets = [], ledger = [], stock = [], config = null, fail = false } = {}) {
  const gid = Number(GUILD);
  const sameGuild = (d) => {
    const v = d.guildId;
    return v === gid || v === String(GUILD);
  };
  const norm = (d) => ({
    ...d,
    balance: d.balance == null ? 0 : d.balance,
    bank: d.bank == null ? 0 : d.bank,
  });
  const run = (rows, pipeline) => {
    // Only the stages the store actually uses are implemented, and they are
    // implemented for real — a test double that trivially returns [] would
    // make every assertion vacuous.
    let docs = rows.map(norm);
    const apply = (stage) => {
      if (stage.$match) {
        const m = stage.$match;
        docs = docs.filter((d) => {
          for (const [k, want] of Object.entries(m)) {
            if (k === '$or') continue;
            const have = d[k];
            if (want && typeof want === 'object' && '$in' in want) {
              if (!want.$in.some((v) => String(v) === String(have))) return false;
            } else if (want && typeof want === 'object' && '$gte' in want) {
              if (!(new Date(have).getTime() >= new Date(want.$gte).getTime())) return false;
            } else if (want && typeof want === 'object' && '$gt' in want) {
              if (!(have > want.$gt)) return false;
            } else if (want && typeof want === 'object' && '$lt' in want) {
              if (!(have < want.$lt)) return false;
            } else if (String(want) !== String(have)) return false;
          }
          if (m.$or) {
            const ok = m.$or.some((clause) => Object.entries(clause).every(([k, want]) => {
              if (k === '$or') return true;
              if (want && typeof want === 'object' && '$lt' in want) return d[k] < want.$lt;
              return String(d[k]) === String(want);
            }));
            if (!ok) return false;
          }
          return true;
        });
      } else if (stage.$addFields) {
        docs = docs.map((d) => {
          const out = { ...d };
          for (const [k, expr] of Object.entries(stage.$addFields)) {
            out[k] = evalExpr(expr, d);
          }
          return out;
        });
      } else if (stage.$group) {
        const g = stage.$group;
        if (g._id === null) {
          const acc = {};
          for (const d of docs) {
            for (const [k, expr] of Object.entries(g)) {
              if (k === '_id') continue;
              acc[k] = combine(acc[k], k, expr, d);
            }
          }
          docs = docs.length ? [{ _id: null, ...acc }] : [];
        } else {
          const groups = new Map();
          for (const d of docs) {
            const key = JSON.stringify(evalExpr(g._id, d));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(d);
          }
          docs = [...groups.entries()].map(([key, rows]) => {
            const out = { _id: JSON.parse(key) };
            for (const [k, expr] of Object.entries(g)) {
              if (k === '_id') continue;
              out[k] = rows.reduce((acc, d) => combine(acc, k, expr, d), undefined);
            }
            return out;
          });
        }
      } else if (stage.$sort) {
        const [key, dir] = Object.entries(stage.$sort)[0];
        docs.sort((a, b) => {
          const av = a[key] ?? 0;
          const bv = b[key] ?? 0;
          return (av < bv ? -1 : av > bv ? 1 : 0) * (dir < 0 ? -1 : 1);
        });
      } else if (stage.$skip) {
        docs = docs.slice(stage.$skip);
      } else if (stage.$limit) {
        docs = docs.slice(0, stage.$limit);
      } else if (stage.$project) {
        docs = docs.map((d) => {
          const out = {};
          for (const [k, v] of Object.entries(stage.$project)) {
            if (k === '_id' && v === 0) continue;
            if (v === 1) out[k] = d[k];
          }
          return out;
        });
      }
      return docs;
    };
    let result = [];
    for (const stage of pipeline) result = apply(stage);
    return result;
  };
  const evalExpr = (expr, d) => {
    if (expr === null) return null;
    if (typeof expr === 'string') return expr.startsWith('$') ? d[expr.slice(1)] : expr;
    if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, d));
    if (typeof expr !== 'object') return expr;
    if ('$ifNull' in expr) {
      const [v, fallback] = expr.$ifNull;
      const have = evalExpr(v, d);
      return have == null ? fallback : have;
    }
    if ('$add' in expr) return expr.$add.map((e) => Number(evalExpr(e, d) ?? 0)).reduce((a, b) => a + b, 0);
    if ('$abs' in expr) return Math.abs(Number(evalExpr(expr.$abs, d) ?? 0));
    if ('$in' in expr) {
      const [needle, arrayExpr] = expr.$in;
      const haystack = evalExpr(arrayExpr, d);
      return Array.isArray(haystack) && haystack.map(String).includes(String(evalExpr(needle, d)));
    }
    if ('$cond' in expr) {
      const [test, then, other] = expr.$cond;
      return truthy(evalExpr(test, d)) ? evalExpr(then, d) : evalExpr(other, d);
    }
    if ('$and' in expr) return expr.$and.every((e) => truthy(evalExpr(e, d)));
    if ('$or' in expr) return expr.$or.some((e) => truthy(evalExpr(e, d)));
    if ('$eq' in expr) {
      const [a, b] = expr.$eq;
      const av = evalExpr(a, d);
      const bv = evalExpr(b, d);
      return av === bv || String(av) === String(bv);
    }
    if ('$ne' in expr) {
      const [a, b] = expr.$ne;
      const av = evalExpr(a, d);
      const bv = evalExpr(b, d);
      return !(av === bv || String(av) === String(bv));
    }
    if ('$gt' in expr) {
      const [a, b] = expr.$gt;
      return Number(evalExpr(a, d) ?? 0) > Number(evalExpr(b, d) ?? 0);
    }
    if ('$lt' in expr) {
      const [a, b] = expr.$lt;
      return Number(evalExpr(a, d) ?? 0) < Number(evalExpr(b, d) ?? 0);
    }
    if ('$max' in expr) {
      const [a, b] = expr.$max;
      return Math.max(Number(evalExpr(a, d) ?? 0), Number(evalExpr(b, d) ?? 0));
    }
    return undefined;
  };
  const truthy = (v) => !(v === false || v == null);
  const combine = (acc, key, expr, d) => {
    if (key === 'wallets' || key === 'rows') return (acc ?? 0) + 1;
    if (expr && '$sum' in expr) return (acc ?? 0) + Number(evalExpr(expr.$sum, d) ?? 0);
    if (expr && '$avg' in expr) {
      const v = Number(evalExpr(expr.$avg, d) ?? 0);
      return { _sum: (acc?._sum ?? 0) + v, _n: (acc?._n ?? 0) + 1 };
    }
    if (expr && '$max' in expr) return Math.max(acc ?? 0, Number(evalExpr(expr.$max, d) ?? 0));
    if (expr && '$min' in expr) return Math.min(acc ?? Number.POSITIVE_INFINITY, Number(evalExpr(expr.$min, d) ?? 0));
    if (expr && '$cond' in expr) {
      const [test, then, other] = expr.$cond;
      const picked = truthy(evalExpr(test, d)) ? then : other;
      return (acc ?? 0) + Number(evalExpr(picked, d) ?? 0);
    }
    return acc;
  };
  const cursor = (rows) => {
    let out = [...rows];
    const applySort = (sort) => {
      const [key, dir] = Object.entries(sort)[0];
      out = [...out].sort((a, b) => {
        const av = a[key] instanceof Date ? a[key].getTime() : a[key];
        const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
        return (av < bv ? -1 : av > bv ? 1 : 0) * (dir < 0 ? -1 : 1);
      });
      return self;
    };
    const self = {
      sort: applySort,
      skip: (n) => { out = out.slice(n); return self; },
      limit: (n) => { out = out.slice(0, n); return self; },
      toArray: async () => out,
    };
    return self;
  };
  return {
    collection: (name) => {
      if (fail) throw new Error('connection refused');
      const data = { economy: wallets, economy_tx: ledger, economy_shop_stock: stock }[name];
      if (name === 'guild_config') {
        return {
          findOne: async () => (fail ? null : config),
        };
      }
      if (!data) throw new Error(`unknown collection ${name}`);
      return {
        aggregate: (pipeline) => cursor(run(data, pipeline)),
        find: (filter) => cursor(data.filter((d) => {
          for (const [k, want] of Object.entries(filter || {})) {
            if (k === '$or') continue;
            const have = d[k];
            if (want && typeof want === 'object' && '$in' in want) {
              if (!want.$in.some((v) => String(v) === String(have))) return false;
            } else if (want && typeof want === 'object' && '$gte' in want) {
              if (!(new Date(have).getTime() >= new Date(want.$gte).getTime())) return false;
            } else if (String(want) !== String(have)) return false;
          }
          return true;
        }).map(norm)),
        countDocuments: async (filter) => data.filter((d) => {
          let ok = true;
          for (const [k, want] of Object.entries(filter || {})) {
            if (k === '$or') continue;
            const have = d[k];
            if (want && typeof want === 'object' && '$in' in want) {
              if (!want.$in.some((v) => String(v) === String(have))) ok = false;
            } else if (want && typeof want === 'object' && '$gte' in want) {
              if (!(new Date(have) >= new Date(want.$gte))) ok = false;
            } else if (want && typeof want === 'object' && '$gt' in want) {
              if (!(have > want.$gt)) ok = false;
            } else if (want && typeof want === 'object' && '$lt' in want) {
              if (!(have < want.$lt)) ok = false;
            } else if (String(want) !== String(have)) ok = false;
          }
          if (ok && filter && filter.$or) {
            ok = filter.$or.some((clause) => Object.entries(clause).every(([k, want]) => {
              if (k === '$or') return true;
              if (want && typeof want === 'object' && '$lt' in want) return d[k] < want.$lt;
              return String(d[k]) === String(want);
            }));
          }
          return ok;
        }).length,
        distinct: async (field, filter) => [...new Set(data.filter((d) => d.guildId === filter.guildId || d.guildId === String(filter.guildId)).map((d) => d[field]))],
      };
    },
  };
}

const wallets = [
  { guildId: Number(GUILD), userId: U1, balance: 1000, bank: 500 },
  { guildId: Number(GUILD), userId: U2, balance: 300, bank: 200 },
  // A wallet whose `bank` key is missing entirely — the $ifNull case that once
  // sank the top holder out of the leaderboard.
  { guildId: Number(GUILD), userId: U3, balance: 50 },
  // A legacy row written with the guild id as a STRING. A strict integer filter
  // hides it, which is how a real holder goes missing.
  { guildId: GUILD, userId: '444444444444444444', balance: 250, bank: 0 },
];
const now = Date.now();
const ledger = [
  { txId: 'a1', guildId: Number(GUILD), userId: U1, type: 'daily', amount: 250, itemId: null, source: 'discord', metadata: {}, createdAt: new Date(now - 60_000) },
  { txId: 'a2', guildId: Number(GUILD), userId: U2, type: 'shop_buy', amount: -400, itemId: 'medkit', source: 'discord', metadata: {}, createdAt: new Date(now - 120_000) },
  { txId: 'a3', guildId: Number(GUILD), userId: U1, type: 'work', amount: 700, itemId: null, source: 'discord', metadata: {}, createdAt: new Date(now - 5 * 24 * 3600_000) },
];
const db = fakeDb({
  wallets, ledger, stock: [],
  config: { guildId: GUILD, economy: { currencyName: 'gems', dailyAmount: 500 } },
});
globalThis.__FAKE_DB__ = db;

{
  const ov = await store.economyOverview(db, GUILD);
  check('wallets counted include the legacy string-guild row', ov.users === 4, `users=${ov.users}`);
  check('circulation is SUM(balance)+SUM(bank)', ov.circulation.total === 2300, `total=${ov.circulation.total}`);
  check('pocket and bank are split correctly', ov.circulation.pocket === 1600 && ov.circulation.bank === 700,
    `${ov.circulation.pocket}/${ov.circulation.bank}`);
  check('highest balance is the largest single wallet', ov.circulation.highest === 1500, `${ov.circulation.highest}`);
  check('transaction count is the real ledger size', ov.transactions === 3, `${ov.transactions}`);
  check('recent rows come back newest first',
    ov.recent[0].txId === 'a1' && ov.recent[1].txId === 'a2', JSON.stringify(ov.recent.map((r) => r.txId)));
  check('a recent row carries type, amount, item and time',
    ov.recent[1].action === 'shop_buy' && ov.recent[1].amount === -400 && ov.recent[1].itemId === 'medkit');

  const top = await store.topWallets(db, GUILD, 'net', 10);
  check('the leaderboard is ordered by net worth',
    top[0].canonicalUserId === U1 && top[0].total === 1500, JSON.stringify(top.map((t) => [t.canonicalUserId, t.total])));
  check('a wallet with no `bank` key still appears with a real total',
    top.some((t) => t.canonicalUserId === U3 && t.total === 50), JSON.stringify(top));
  check('every row keeps its canonical id, never a name',
    top.every((t) => typeof t.canonicalUserId === 'string' && /^\d+$/.test(t.canonicalUserId)));

  const page = await store.economyTransactions(db, GUILD, { limit: 10, hours: 24 });
  check('the 24h filter excludes older rows', page.total === 2, `total=${page.total}`);
  check('the action filter composes', (await store.economyTransactions(db, GUILD, { action: 'shop_buy', hours: 0 })).total === 1);
  check('the direction filter composes', (await store.economyTransactions(db, GUILD, { direction: 'negative', hours: 0 })).total === 1);
  check('a text search by transaction id works',
    (await store.economyTransactions(db, GUILD, { txId: 'a3', hours: 0 })).rows.length === 1);
  check('rows carry the metadata the ledger stored',
    (await store.economyTransactions(db, GUILD, { hours: 0 })).rows.every((r) => r.metadata && typeof r.metadata === 'object'));
  check('an unmatched filter is genuinely empty, not an error',
    (await store.economyTransactions(db, GUILD, { action: 'lottery', hours: 0 })).total === 0);

  const health = await store.economyHealth(db, GUILD);
  check('health counts created coins in the window', health.createdToday === 250, `${health.createdToday}`);
  check('health counts removed coins in the window', health.removedToday === 400, `${health.removedToday}`);
  check('health reconciles with circulation', health.circulation === ov.circulation.total);
  check('health counts shop spending', health.shopSpending === 400, `${health.shopSpending}`);
  check('health counts reward payouts', health.rewardPayouts === 250, `${health.rewardPayouts}`);

  const audit = await store.antiExploitAudit(db, GUILD);
  check('the audit is read-only and says so', audit.wallet_audit === 'read-only');
  check('the audit finds no negative balance in healthy data',
    !audit.findings.some((f) => f.code === 'NEGATIVE_BALANCE'));
  check('the audit reports the peak payout', audit.peakSinglePayout === 700, `${audit.peakSinglePayout}`);
  check('the audit finds no buy/sell arbitrage in the shipped catalog',
    !audit.findings.some((f) => f.code === 'BUY_SELL_ARBITRAGE'),
    audit.findings.filter((f) => f.code === 'BUY_SELL_ARBITRAGE').map((f) => f.detail).join('; '));

  const cfg = await store.economyConfig(db, GUILD);
  check('a stored section overrides the default', cfg.state === 'found' && cfg.config.currencyName === 'gems');
  check('unstored keys fall back to the bot defaults', cfg.config.weeklyAmount === 1500);

  const shop = await store.shopSnapshot(db, GUILD);
  const catalogCount = table.items.filter((i) => i.shopEnabled === true && i.active !== false).length;
  check('the shop lists every enabled catalog item', shop.items.length === catalogCount,
    `${shop.items.length} of ${catalogCount}`);
  check('the shop reports its four rotation sections', shop.sections.length === 4);
  check('every shop item has a section', shop.items.every((i) => ['coin', 'fishing', 'special', 'skin'].includes(i.section)));
  check('no catalog item is both disabled and listed',
    shop.items.every((i) => table.items.find((t) => t.id === i.id)?.shopEnabled === true));
  check('stock is null for unlimited items and a number for limited ones',
    shop.items.every((i) => (i.stock === null) === (i.stockLimit === null || i.stockLimit === undefined)));
  check('every limited item is purchasable at full stock',
    shop.items.filter((i) => i.stockLimit != null).every((i) => i.purchaseAvailable === true));
}

// An empty database must read as empty, not as an error and not as data.
section('[3] an empty database is EMPTY, not broken');
{
  const empty = fakeDb({ wallets: [], ledger: [], stock: [] });
  const ov = await store.economyOverview(empty, GUILD);
  check('an empty database produces zero users', ov.users === 0);
  check('an empty database produces zero circulation', ov.circulation.total === 0);
  check('an empty database produces no recent rows', ov.recent.length === 0);
  check('an empty database is not an error', !('error' in ov));

  const wrapped = await store.section('overview', () => store.economyOverview(empty, GUILD), (d) => d.users);
  check('an empty result is reported as `empty`', wrapped.state === 'empty', wrapped.state);
  check('an empty result carries no error', wrapped.error === null);
  check('an empty result still returns its data', wrapped.data !== null);
  check('an empty result reports zero records', wrapped.records === 0);
}

// A broken database must read as an error. This is the case the page used to
// render as "No transactions yet".
section('[4] a broken database is an ERROR, never empty data');
{
  const broken = fakeDb({ fail: true });
  const wrapped = await store.section('overview', () => store.economyOverview(broken, GUILD), (d) => d.users);
  check('a failing read is reported as `error`', wrapped.state === 'error', wrapped.state);
  check('a failing read carries an error object', !!wrapped.error && typeof wrapped.error.message === 'string');
  check('a failing read has a machine-readable code', wrapped.error?.code === 'DATABASE_UNAVAILABLE', wrapped.error?.code);
  check('a failing read is marked retryable', wrapped.error?.retryable === true);
  check('a failing read returns NO data', wrapped.data === null);
  check('a failing read reports no record count', wrapped.records === null);
  check('the error message never contains a connection string',
    !/mongodb:\/\//.test(wrapped.error?.message ?? ''), wrapped.error?.message);
  check('a failing read never says "no transactions"', !/no transactions/i.test(wrapped.error?.message ?? ''));
}

// Another guild's rows must never leak into this one.
section('[5] the guild filter is exact');
{
  const other = [
    { guildId: 999999999999999999, userId: U1, balance: 999999, bank: 999999 },
  ];
  const scoped = fakeDb({ wallets: [...wallets, ...other], ledger });
  const ov = await store.economyOverview(scoped, GUILD);
  check("another guild's wallets are excluded", ov.circulation.total === 2300, `${ov.circulation.total}`);
  check("another guild's wallets are not counted", ov.users === 4, `${ov.users}`);
}

// The same reads against a REAL mongod with the REAL driver. The in-memory
// double above proves the logic; this proves the pipelines are valid MongoDB —
// a malformed `$group` or an operator the server rejects cannot be caught by a
// double, and it would surface in production as a section stuck in `error`.
section('[6] the same reads against a real MongoDB');
{
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  let live = false;
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    live = true;
  } catch {
    live = false;
  }
  if (!live) {
    console.log('  skip  no mongod reachable — set MONGODB_URI to run these');
  } else {
    const db = client.db(`economy_store_e2e_${Math.random().toString(36).slice(2, 8)}`);
    const gid = Number(GUILD);
    try {
      await db.collection('economy').insertMany([
        { guildId: gid, userId: U1, balance: 1000, bank: 500 },
        { guildId: gid, userId: U2, balance: 300, bank: 200 },
        { guildId: gid, userId: U3, balance: 50 },
        { guildId: GUILD, userId: '444444444444444444', balance: 250, bank: 0 },
        { guildId: 999999999999999999, userId: U1, balance: 999999, bank: 999999 },
      ]);
      await db.collection('economy_tx').insertMany([
        { txId: 'b1', guildId: gid, userId: U1, type: 'daily', amount: 250, itemId: null, source: 'discord', metadata: { rewardKey: 'k1' }, createdAt: new Date(Date.now() - 60_000) },
        { txId: 'b2', guildId: gid, userId: U2, type: 'shop_buy', amount: -400, itemId: 'medkit', source: 'discord', metadata: {}, createdAt: new Date(Date.now() - 120_000) },
        { txId: 'b3', guildId: gid, userId: U1, type: 'work', amount: 700, itemId: null, source: 'discord', metadata: {}, createdAt: new Date(Date.now() - 5 * 24 * 3600_000) },
      ]);
      // A limited-stock item from the shipped catalog, seeded into the CURRENT
      // rotation window of ITS OWN section, so the read must find the seeded
      // remainder rather than falling back to the full limit.
      const limited = table.items.find((i) => i.shopEnabled === true && i.shopStock != null);
      const soldOut = table.items.filter((i) => i.shopEnabled === true && i.shopStock != null)[1];
      const windowFor = (item) => {
        const section = store.shopSectionFor({
          dropSources: item.dropSources, effectType: item.effectType,
          rarity: item.rarity, category: item.category,
        });
        return Math.floor(Date.now() / (store.SHOP_SECTIONS.find((s) => s.id === section).hours * 3600));
      };
      await db.collection('economy_shop_stock').insertMany([
        { guildId: gid, itemId: limited.id, remaining: 1, window: windowFor(limited) },
        { guildId: gid, itemId: soldOut.id, remaining: 0, window: windowFor(soldOut) },
      ]);
      await db.collection('guild_config').insertOne({ guildId: GUILD, economy: { currencyName: 'gems', dailyAmount: 500 } });

      const ov = await store.economyOverview(db, GUILD);
      check('real driver: wallets counted', ov.users === 4, `users=${ov.users}`);
      check('real driver: circulation is SUM(balance)+SUM(bank)', ov.circulation.total === 2300, `${ov.circulation.total}`);
      check('real driver: another guild is excluded', ov.circulation.total < 2000000);
      check('real driver: the missing-bank wallet is counted, not nulled', ov.circulation.highest === 1500, `${ov.circulation.highest}`);
      check('real driver: $percentile median runs', typeof ov.circulation.median === 'number', `${ov.circulation.median}`);
      check('real driver: transactions counted', ov.transactions === 3, `${ov.transactions}`);
      check('real driver: recent rows are sorted newest first', ov.recent[0].txId === 'b1');

      const top = await store.topWallets(db, GUILD, 'net', 10);
      check('real driver: leaderboard sorts by net', top[0].canonicalUserId === U1 && top[0].total === 1500,
        JSON.stringify(top.map((t) => [t.canonicalUserId, t.total])));
      check('real driver: a string guildId row is not lost', top.some((t) => t.canonicalUserId === '444444444444444444'));

      const page = await store.economyTransactions(db, GUILD, { hours: 24 });
      check('real driver: the time filter works', page.total === 2, `${page.total}`);
      check('real driver: the action filter works', (await store.economyTransactions(db, GUILD, { action: 'shop_buy', hours: 0 })).total === 1);
      check('real driver: metadata survives the projection',
        (await store.economyTransactions(db, GUILD, { hours: 0 })).rows.some((r) => r.txId === 'b1' && r.metadata.rewardKey === 'k1'));

      const health = await store.economyHealth(db, GUILD);
      check('real driver: created/removed split by ledger type',
        health.createdToday === 250 && health.removedToday === 400, `${health.createdToday}/${health.removedToday}`);
      check('real driver: shop spending aggregates', health.shopSpending === 400, `${health.shopSpending}`);
      check('real driver: reward payouts aggregate', health.rewardPayouts === 250, `${health.rewardPayouts}`);

      const audit = await store.antiExploitAudit(db, GUILD);
      check('real driver: the audit runs', audit.wallet_audit === 'read-only');
      check('real driver: the peak payout is found', audit.peakSinglePayout === 700, `${audit.peakSinglePayout}`);

      const cfg = await store.economyConfig(db, GUILD);
      check('real driver: the stored config overrides the default', cfg.state === 'found' && cfg.config.dailyAmount === 500);
      check('real driver: absent keys fall back to defaults', cfg.config.lotteryMaxTickets === 10);

      const shop = await store.shopSnapshot(db, GUILD);
      const stocked = shop.items.find((i) => i.id === limited.id);
      const empty2 = shop.items.find((i) => i.id === soldOut.id);
      check('real driver: the shop reads the seeded stock remainder',
        stocked && stocked.stock === 1, JSON.stringify(stocked));
      check('real driver: an in-stock item is purchasable', stocked && stocked.purchaseAvailable === true);
      check('real driver: a sold-out item shows zero and cannot be bought',
        empty2 && empty2.stock === 0 && empty2.purchaseAvailable === false, JSON.stringify(empty2));
      check('real driver: unlimited items report no limit',
        shop.items.filter((i) => i.stockLimit == null).every((i) => i.stock === null));
      check('real driver: every item has a section', shop.items.every((i) => i.section));

      const empty = store.section('overview', () => store.economyOverview(db, '987654321098765432'), (d) => d.users);
      const emptyResult = await empty;
      check('real driver: an unknown guild reads as EMPTY', emptyResult.state === 'empty', emptyResult.state);
      check('real driver: an empty read is not an error', emptyResult.error === null);
    } finally {
      await db.dropDatabase().catch(() => { /* best effort */ });
      await client.close().catch(() => { /* best effort */ });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
if (failed) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
