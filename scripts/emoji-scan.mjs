// Dev utility: report any emoji left in UI source (server /api kept out).
import fs from 'fs';
import path from 'path';

const skip = new Set(['node_modules', '.next', '.git', '.kilo', '.freebuff', '.vercel', '.vscode', 'types', 'scripts', 'public']);
const out = {};
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!skip.has(f)) walk(p); continue; }
    if (!/\.(tsx?|jsx?)$/.test(f)) continue;
    if (p.replace(/\\/g, '/').split('/').includes('api')) continue;
    const t = fs.readFileSync(p, 'utf8');
    const m = t.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    if (m) out[p] = [...new Set(m)].join(' ');
  }
}
walk('.');
for (const [k, v] of Object.entries(out)) console.log(k, '=>', v);
console.log('FILES WITH EMOJIS:', Object.keys(out).length);
