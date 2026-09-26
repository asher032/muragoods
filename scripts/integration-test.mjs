#!/usr/bin/env node
// Integration tests for the MuraGoods + MuraStream APIs.
// Runs against ANY environment:
//   node scripts/integration-test.mjs                        → http://localhost:3000
//   BASE_URL=https://muragoods.vercel.app node scripts/integration-test.mjs
//
// Covers: account/profile (GET/PATCH validation), orders → Delivered →
// coins (idempotent), and the watch-party lifecycle (create → join → chat →
// host control → guest 403 → end). Creates its own throwaway user, order,
// and party, and deletes what it can afterward.
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

// Cookie jar: signup/login set an httpOnly session cookie and every
// subsequent call sends it — mirrors how the browser actually behaves.
const COOKIE_JAR = new Map();

function jarHeader() {
  return [...COOKIE_JAR.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(COOKIE_JAR.size ? { cookie: jarHeader() } : {}), ...(opts.headers || {}) },
    ...opts,
  });
  for (const raw of res.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value && value !== '') COOKIE_JAR.set(name, value);
    }
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const stamp = Date.now().toString(36).toUpperCase();
const EMAIL = `itest-${stamp}@muragoods.test`;
const PASSWORD = 'Integration123!';

console.log(`\nIntegration tests against ${BASE}\n`);

// ─── 0. Dashboard auth codes (no session at all) ──────────────────────
// An expired/invalid session must read as AUTH_REQUIRED (401) — never as
// "no permission" (403) and never as "bot not installed". Plain fetch here:
// no cookies are sent, mirroring a dead/expired session cookie.
console.log('[0] dashboard auth codes (sessionless)');
{
  const anon = (path) => fetch(`${BASE}${path}`).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }));

  const cfgNoAuth = await anon('/api/dashboard/config?guildId=997389969448517632');
  check('config without session → 401 AUTH_REQUIRED',
    cfgNoAuth.status === 401 && cfgNoAuth.body?.code === 'AUTH_REQUIRED',
    `status ${cfgNoAuth.status} code ${cfgNoAuth.body?.code}`);

  const cfgBadId = await anon('/api/dashboard/config?guildId=abc');
  check('config without session still 401 (auth checked first)',
    cfgBadId.status === 401, `status ${cfgBadId.status}`);

  const serversNoAuth = await anon('/api/dashboard/servers');
  check('servers without session → 401', serversNoAuth.status === 401,
    `status ${serversNoAuth.status}`);

  const statusBadId = await anon('/api/discord/guilds/abc/status');
  check('status endpoint rejects malformed guildId → 400 INVALID_GUILD_ID',
    statusBadId.status === 400 && statusBadId.body?.code === 'INVALID_GUILD_ID',
    `status ${statusBadId.status} code ${statusBadId.body?.code}`);

  const statusNoAuth = await anon('/api/discord/guilds/997389969448517632/status');
  check('status endpoint without session → 401 AUTH_REQUIRED',
    statusNoAuth.status === 401 && statusNoAuth.body?.code === 'AUTH_REQUIRED',
    `status ${statusNoAuth.status} code ${statusNoAuth.body?.code}`);

  const guildsNoAuth = await anon('/api/dashboard/guilds');
  check('guilds without session → 401', guildsNoAuth.status === 401,
    `status ${guildsNoAuth.status}`);
}

// ─── 1. Account profile ─────────────────────────────────────────────
console.log('[1] account profile (session-based — the old ?email= IDOR is closed)');
{
  const missing = await api('/api/account/profile');
  check('GET without session → 401', missing.status === 401, `status ${missing.status}`);

  const signup = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'Integration Tester' }),
  });
  check('signup succeeds', signup.status === 200 || signup.status === 201, `status ${signup.status}`);

  const prof = await api('/api/account/profile');
  check('GET (session) returns the user', prof.status === 200 && prof.body?.data?.email === EMAIL);
  check('new user coinBalance is 0', prof.body?.data?.coinBalance === 0, JSON.stringify(prof.body?.data));

  const badName = await api('/api/account/profile', {
    method: 'PATCH', body: JSON.stringify({ name: 'x' }),
  });
  check('PATCH short name → 400', badName.status === 400);

  const badAvatar = await api('/api/account/profile', {
    method: 'PATCH', body: JSON.stringify({ avatar: 'javascript:alert(1)' }),
  });
  check('PATCH non-image avatar → 400', badAvatar.status === 400);

  const good = await api('/api/account/profile', {
    method: 'PATCH', body: JSON.stringify({ name: 'Integration Tester II' }),
  });
  check('PATCH valid name → 200', good.status === 200 && good.body?.data?.name === 'Integration Tester II');
}

// ─── 2. Orders → Delivered → coins (idempotent) ─────────────────────
console.log('[2] order → delivered → coins');
let orderId = '';
{
  const order = await api('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      userId: EMAIL,
      customer: 'Integration Tester',
      phone: '09000000000',
      zone: 'Main Gate',
      address: 'Test address 123',
      payment: 'Cash',
      deliveryDate: new Date().toISOString().slice(0, 10),
      deliveryType: 'Delivery',
      total: 95,
      items: ['musubi'],
      pointsEarned: 50,
      status: 'Pending Payment',
    }),
  });
  check('order created', order.status === 201 && !!order.body?.data?._id, `status ${order.status}`);
  orderId = order.body?.data?._id || '';

  const noId = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({}) });
  check('award-coins without orderId → 400', noId.status === 400);

  // before delivery: award must refuse (order not Delivered yet)
  const early = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({ orderId }) });
  check('award-coins on non-delivered → 400', early.status === 400, JSON.stringify(early.body));

  const patch = await api(`/api/orders?id=${orderId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Delivered' }),
  });
  check('PATCH status → Delivered', patch.status === 200 && patch.body?.data?.status === 'Delivered');

  // give the after() callback a moment
  await new Promise(r => setTimeout(r, 1500));

  const after = await api('/api/account/profile');
  check('coins awarded automatically on Delivered (server PATCH chain)', after.body?.data?.coinBalance === 50, `balance ${after.body?.data?.coinBalance}`);

  const award = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({ orderId }) });
  check('explicit award after auto-award → alreadyAwarded', award.body?.data?.alreadyAwarded === true, JSON.stringify(award.body?.data));

  const again = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({ orderId }) });
  check('double award stays idempotent', again.body?.data?.alreadyAwarded === true);

  const final = await api('/api/account/profile');
  check('balance still exactly 50 after retries', final.body?.data?.coinBalance === 50, `balance ${final.body?.data?.coinBalance}`);
}

// ─── 3. Watch party lifecycle (incl. chat) ──────────────────────────
console.log('[3] watch party');
{
  const junk = await api('/api/murastream/party', {
    method: 'POST', body: JSON.stringify({ email: EMAIL, name: 'Host', state: { type: 'movie', id: -3 } }),
  });
  check('create with junk state → accepted but state nulled', junk.status === 201 && junk.body?.data?.code, JSON.stringify(junk.body));

  const create = await api('/api/murastream/party', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, name: 'Host', state: { type: 'movie', id: 27205, season: 1, episode: 1, source: 'vidlink' } }),
  });
  check('party created', create.status === 201 && /^[A-Z0-9]{6}$/.test(create.body?.data?.code || ''));
  const code = create.body?.data?.code;

  const guestEmail = `guest-${stamp}@muragoods.test`;
  const join = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'join', email: guestEmail, name: 'Guest One' }),
  });
  check('guest joins', join.status === 200 && join.body?.data?.joined === true);

  const dupe = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'join', email: guestEmail, name: 'Guest One' }),
  });
  check('duplicate join does not duplicate the member', dupe.status === 200);

  const snap = await api(`/api/murastream/party?code=${code}`);
  check('snapshot lists exactly 2 members', (snap.body?.data?.members || []).length === 2, JSON.stringify(snap.body?.data?.members?.length));
  check('snapshot includes host state', snap.body?.data?.state?.id === 27205);

  // chat
  const noText = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'chat', email: guestEmail, name: 'Guest One', text: '   ' }),
  });
  check('empty chat message → 400', noText.status === 400);

  const outsider = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'chat', email: 'not-a-member@x.test', name: 'Lurker', text: 'hi' }),
  });
  check('non-member chat → 403', outsider.status === 403);

  const chat = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'chat', email: guestEmail, name: 'Guest One', text: 'hello party' }),
  });
  check('member chat accepted', chat.status === 200);

  const longText = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'chat', email: guestEmail, name: 'Guest One', text: 'x'.repeat(500) }),
  });
  check('overlong message accepted but truncated', longText.status === 200);

  const snap2 = await api(`/api/murastream/party?code=${code}`);
  const msgs = snap2.body?.data?.messages || [];
  check('messages stored (max 50 kept)', msgs.length === 2 && msgs[0].text === 'hello party', JSON.stringify(msgs.map(m => m.text)));
  check('overlong message truncated to 300', msgs[1]?.text?.length === 300);

  // typing indicators
  const typ = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ action: 'typing', email: guestEmail, name: 'Guest One' }),
  });
  check('typing signal accepted', typ.status === 200);
  const snap3 = await api(`/api/murastream/party?code=${code}`);
  check('typing flag visible to pollers', (snap3.body?.data?.typing || []).some(t => t.name === 'Guest One'), JSON.stringify(snap3.body?.data?.typing));

  // ── SSE live stream (replaces the old 4s polling) ────────────────────
  if (code) {
    const events = [];
    const controller = new AbortController();
    const streamDone = (async () => {
      const res = await fetch(`${BASE}/api/murastream/party-events?code=${code}`, { signal: controller.signal });
      check('SSE endpoint returns an event-stream', res.status === 200 && (res.headers.get('content-type') || '').includes('text/event-stream'), `status ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
        }
      }
    })().catch(() => { /* aborted at the end */ });

    // Initial snapshot: deadline-based, not a fixed sleep — a cold serverless
    // lambda can take several seconds to spin up the stream on the first hit.
    const snapDeadline = Date.now() + 15000;
    while (Date.now() < snapDeadline && events.length === 0) await sleep(300);
    check('initial snapshot arrives over SSE', events.length >= 1 && events[0].state?.id === 27205, JSON.stringify(events[0]));

    await api(`/api/murastream/party?code=${code}`, {
      method: 'PATCH', body: JSON.stringify({ action: 'chat', email: guestEmail, name: 'Guest One', text: 'sse push test' }),
    });
    const chatDeadline = Date.now() + 8000;
    while (Date.now() < chatDeadline && !events.some(e => (e.messages || []).some(m => m.text === 'sse push test'))) {
      await sleep(300);
    }
    check('chat change pushed over SSE within 8s', events.some(e => (e.messages || []).some(m => m.text === 'sse push test')));

    await api(`/api/murastream/party?code=${code}`, {
      method: 'PATCH', body: JSON.stringify({ state: { type: 'movie', id: 155, season: 1, episode: 1, source: 'vidlink' }, email: EMAIL }),
    });
    const stateDeadline = Date.now() + 8000;
    while (Date.now() < stateDeadline && !events.some(e => e.state?.id === 155)) {
      await sleep(300);
    }
    check('host state change pushed over SSE within 8s', events.some(e => e.state?.id === 155));

    controller.abort();
    await streamDone;
  }

  // host-only control
  const guestControl = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ state: { type: 'movie', id: 155, season: 1, episode: 1, source: 'vidlink' }, email: guestEmail }),
  });
  check('guest state push → 403', guestControl.status === 403);

  const hostPush = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ state: { type: 'movie', id: 155, season: 1, episode: 1, source: 'videasy' }, email: EMAIL }),
  });
  check('host state push → 200', hostPush.status === 200 && hostPush.body?.data?.state?.source === 'videasy');

  const badState = await api(`/api/murastream/party?code=${code}`, {
    method: 'PATCH', body: JSON.stringify({ state: { type: 'movie', id: 155, season: -2, source: 'vidlink' }, email: EMAIL }),
  });
  check('negative season clamped to 1', badState.body?.data?.state?.season === 1, JSON.stringify(badState.body?.data?.state));

  const guestEnd = await api(`/api/murastream/party?code=${code}&email=${encodeURIComponent(guestEmail)}`, { method: 'DELETE' });
  check('guest cannot end party → 403', guestEnd.status === 403);

  const end = await api(`/api/murastream/party?code=${code}&email=${encodeURIComponent(EMAIL)}`, { method: 'DELETE' });
  check('host ends party', end.status === 200);

  const gone = await api(`/api/murastream/party?code=${code}`);
  check('party deleted → 404', gone.status === 404);
}

// ─── 3b. Leaderboard must not publish account identifiers ───────────
// The leaderboard is intentionally unauthenticated, which is precisely why its
// payload is asserted here: it used to serialise the order's userId (the
// account email) as `email`, so one anonymous request returned the whole
// customer list. This guard fails if that shape ever comes back.
console.log('[3b] leaderboard privacy');
{
  // Deliberately cookie-less: the helpers above carry this suite's session, and
  // the threat model here is a stranger with no session at all.
  const anonRes = await fetch(`${BASE}/api/leaderboard`);
  const body = await anonRes.json().catch(() => null) || {};
  const rows = Array.isArray(body.data) ? body.data : [];
  const blob = JSON.stringify(body);

  check('leaderboard responds 200 (public by design)', anonRes.status === 200,
    `status ${anonRes.status}`);
  check('no row carries an `email` field', rows.every((r) => !('email' in r)));
  check('no identifier-shaped value anywhere in the payload', !blob.includes('@'));
  check('every row exposes an opaque playerKey',
    rows.every((r) => typeof r.playerKey === 'string' && r.playerKey.length >= 16));
  check('playerKeys are unique per row',
    new Set(rows.map((r) => r.playerKey)).size === rows.length);
  check('an anonymous request gets no `you`', !('you' in body));

  // Signed in (this suite's own session), the caller learns only its own key.
  const authed = await api('/api/leaderboard');
  const you = authed.body?.you;
  check('a session request receives `you`', typeof you === 'string' && you.length >= 16);
  check('`you` never contains an identifier', typeof you === 'string' && !you.includes('@'));
  check('`you` matches at most one row',
    rows.filter((r) => r.playerKey === you).length <= 1);
}

// ─── 4. Cleanup (best effort) ───────────────────────────────────────
console.log('[4] cleanup');
{
  if (orderId) {
    const del = await fetch(`${BASE}/api/orders?id=${orderId}`, { method: 'DELETE' });
    check('test order deleted', del.ok || del.status === 404);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
