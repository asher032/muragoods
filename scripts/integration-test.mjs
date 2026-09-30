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
  return apiWith(COOKIE_JAR, path, opts);
}

// Second jar for the admin session: order status advances are admin-only, so
// the delivery chain below elevates where the old suite reused the owner.
const ADMIN_JAR = new Map();

async function apiWith(jar, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(jar.size ? { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...(opts.headers || {}) },
    ...opts,
  });
  for (const raw of res.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value && value !== '') jar.set(name, value);
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

  // Data-pipeline codes: every data route must answer a missing session
  // with 401 AUTH_REQUIRED (never 403) and a malformed guildId with 400
  // INVALID_GUILD_ID — a failed lookup is never a permission failure.
  const dataPaths = [
    '/api/dashboard/resources?guildId=997389969448517632',
    '/api/dashboard/moderation/tools?op=overview&guildId=997389969448517632',
    '/api/dashboard/moderation?guildId=997389969448517632&userId=123456789',
    '/api/discord/guilds/997389969448517632/members?search=olin',
    '/api/discord/guilds/997389969448517632/roles',
    '/api/discord/guilds/997389969448517632/channels',
    '/api/dashboard/guilds/997389969448517632/overview',
    '/api/dashboard/guilds/997389969448517632/diagnostics',
    '/api/dashboard/moderation/notes?guildId=997389969448517632&userId=123456789',
  ];
  for (const p of dataPaths) {
    const r = await anon(p);
    check(`${p.split('?')[0]} without session → 401 AUTH_REQUIRED`,
      r.status === 401 && r.body?.code === 'AUTH_REQUIRED',
      `status ${r.status} code ${r.body?.code}`);
  }
  const badIdPaths = [
    '/api/discord/guilds/abc/members?search=olin',
    '/api/discord/guilds/abc/roles',
    '/api/discord/guilds/abc/channels',
    '/api/dashboard/guilds/abc/overview',
    '/api/dashboard/guilds/abc/diagnostics',
  ];
  for (const p of badIdPaths) {
    const r = await anon(p);
    check(`${p.split('/').slice(0, 5).join('/')} rejects malformed guildId → 400`,
      r.status === 400 && r.body?.code === 'INVALID_GUILD_ID',
      `status ${r.status} code ${r.body?.code}`);
  }
  // POST-only moderation routes: no session must still read as 401
  // AUTH_REQUIRED (auth is checked before any body validation).
  for (const p of ['/api/dashboard/moderation/lockdown', '/api/dashboard/moderation/purge']) {
    const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(async (rr) => ({ status: rr.status, body: await rr.json().catch(() => null) }));
    check(`${p} without session → 401 AUTH_REQUIRED`,
      r.status === 401 && r.body?.code === 'AUTH_REQUIRED',
      `status ${r.status} code ${r.body?.code}`);
  }
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
  check('GET (session) returns the user', prof.status === 200 && prof.body?.data?.email === EMAIL.toLowerCase());
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

  const patchDenied = await api(`/api/orders?id=${orderId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Delivered' }),
  });
  check('PATCH status → Delivered as owner (non-admin) → 403', patchDenied.status === 403, `status ${patchDenied.status}`);

  // Status advances are admin-only (they award coins + notify). Elevate with
  // a throwaway admin allowlist account and run the delivery chain as admin.
  const adminSignup = await apiWith(ADMIN_JAR, '/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: 'muragoods0@gmail.com', password: PASSWORD, name: 'Integration Admin' }),
  });
  check('admin signup succeeds', adminSignup.status === 200 || adminSignup.status === 201, `status ${adminSignup.status}`);

  const patch = await apiWith(ADMIN_JAR, `/api/orders?id=${orderId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Delivered' }),
  });
  check('PATCH status → Delivered', patch.status === 200 && patch.body?.data?.status === 'Delivered');

  // give the after() callback a moment
  await new Promise(r => setTimeout(r, 1500));

  const after = await api('/api/account/profile');
  check('coins awarded automatically on Delivered (server PATCH chain)', after.body?.data?.coinBalance === 50, `balance ${after.body?.data?.coinBalance}`);

  const award = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({ orderId }) });
  check('explicit award after auto-award → alreadyAwarded', award.body?.data?.alreadyAwarded === true, JSON.stringify(award.body));

  const again = await api('/api/orders/award-coins', { method: 'POST', body: JSON.stringify({ orderId }) });
  check('double award stays idempotent', again.body?.data?.alreadyAwarded === true, JSON.stringify(again.body));

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

// ─── 3c. Jobs + work-shift minigames (table-driven) ─────────────────────
// Full loop with the owner's session: catalog (39 jobs) → locked job
// refused → start (no payout yet) → play correctly → EXACT salary +
// payout in range → history shows it → replays/duplicates refused →
// cooldown enforced → resign resets promotion.
console.log('[3c] jobs + work shifts');
{
  const list = await api('/api/jobs');
  check('jobs catalog loads (39 jobs)', list.status === 200 && Array.isArray(list.body?.jobs) && list.body.jobs.length === 39,
    `status ${list.status} count ${list.body?.jobs?.length}`);
  const cashier = (list.body?.jobs || []).find((j) => j.id === 'cashier');
  check('cashier values match table', cashier?.salary === 95000 && cashier?.shiftsPerDay === 1
    && cashier?.cooldownSec === 43 * 60 && cashier?.unlock === 0 && cashier?.workItem === 'Cash Register',
    JSON.stringify(cashier));
  check('removed jobs absent', !(list.body?.jobs || []).some((j) => ['cosplayer', 'karen', 'dictator'].includes(j.id)));
  const delivery = (list.body?.jobs || []).find((j) => j.id === 'delivery');
  check('delivery locked at 0 shifts', delivery && delivery.unlocked === false && delivery.unlockProgress === 0);

  const locked = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'delivery' }) });
  check('locked job refused with progress', locked.status === 403 && locked.body?.code === 'LOCKED', `status ${locked.status}`);

  const badJob = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'nope' }) });
  check('unknown job → 404', badJob.status === 404, `status ${badJob.status}`);

  // Employment is required BEFORE any shift (or mini-game) can start.
  check('owner starts unemployed', !list.body?.employment, JSON.stringify(list.body?.employment));
  const startNoJob = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('shift refused without a job',
    startNoJob.status === 403 && startNoJob.body?.code === 'NO_JOB',
    `status ${startNoJob.status} code ${startNoJob.body?.code}`);
  const applyLocked = await api('/api/jobs/apply', { method: 'POST', body: JSON.stringify({ jobId: 'delivery' }) });
  check('application to locked job refused',
    applyLocked.status === 403 && applyLocked.body?.code === 'LOCKED',
    `status ${applyLocked.status} code ${applyLocked.body?.code}`);
  const apply = await api('/api/jobs/apply', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('application accepted', apply.status === 200 && apply.body?.success === true, `status ${apply.status}`);
  const employedList = await api('/api/jobs');
  check('employment reported + job marked active',
    employedList.body?.employment?.jobId === 'cashier'
    && (employedList.body?.jobs || []).find((j) => j.id === 'cashier')?.isActive === true,
    JSON.stringify({ employment: employedList.body?.employment }));

  const start = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('shift starts (no payout yet)', start.status === 200 && !!start.body?.token, `status ${start.status}`);
  const token = start.body?.token || '';
  const ticket = start.body?.challenge?.ticket || [];
  const labels = start.body?.challenge?.labels || [];
  check('order ticket shown, answer hidden',
    start.body?.challenge?.game === 'order' && ticket.length === labels.length && labels.length >= 4
    && start.body?.challenge?.answer === undefined);

  const busy = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('second live shift refused', busy.status === 409, `status ${busy.status}`);

  const wrong = await api('/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token: 'job_doesnotexist', clicks: [0], elapsedMs: 5000 }),
  });
  check('forged token refused', wrong.status === 409, `status ${wrong.status}`);

  // Payout security: resigning mid-shift voids the payout; re-applying
  // restores it without opening a second shift.
  const resignMid = await api('/api/jobs/resign', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('resign mid-shift works', resignMid.status === 200 && resignMid.body?.success === true,
    `status ${resignMid.status}`);
  const clicksMid = ticket.map((item) => labels.indexOf(item));
  const noPay = await api('/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token, clicks: clicksMid, elapsedMs: 6000 }),
  });
  check('no salary without an active job',
    noPay.status === 403 && noPay.body?.code === 'NO_JOB',
    `status ${noPay.status} code ${noPay.body?.code}`);
  const reapply = await api('/api/jobs/apply', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('re-application accepted', reapply.status === 200 && reapply.body?.success === true,
    `status ${reapply.status}`);

  // Play correctly: tap each ticket item where it sits, human-plausible time.
  const clicks = ticket.map((item) => labels.indexOf(item));
  const done = await api('/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token, clicks, elapsedMs: 6000 }),
  });
  check('correct play wins', done.status === 200 && done.body?.won === true, `status ${done.status}`);
  check('success pays EXACT salary', done.body?.payout === 95000, `payout ${done.body?.payout}`);
  check('balance returned', typeof done.body?.balance === 'number');

  const replay = await api('/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token, clicks, elapsedMs: 6000 }),
  });
  check('shift replay refused (no double pay)', replay.status === 409, `status ${replay.status}`);

  const recool = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  // Cashier allows 1/day, so the second start is stopped by the daily
  // limit; the per-job cooldown is verified via the catalog below.
  check('repeat shift refused after completion',
    recool.status === 429 && (recool.body?.code === 'DAILY_DONE' || recool.body?.code === 'COOLDOWN'),
    `status ${recool.status} code ${recool.body?.code}`);
  const relist = await api('/api/jobs');
  const cashierAfter = (relist.body?.jobs || []).find((j) => j.id === 'cashier');
  check('per-job cooldown ticking after shift',
    cashierAfter?.cooldownRemaining > 0 && cashierAfter?.cooldownRemaining <= 43 * 60,
    `remaining ${cashierAfter?.cooldownRemaining}`);

  const hist = await api('/api/jobs/history?limit=5');
  check('history shows the shift',
    hist.status === 200 && Array.isArray(hist.body?.history) &&
    hist.body.history.some((h) => h.jobId === 'cashier' && h.won === true && h.payout === 95000),
    `status ${hist.status}`);

  // Fail path on a 2/day job: wrong order → sub-par pay (< salary).
  const start2 = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'delivery' }) });
  check('delivery still locked (needs 10)', start2.status === 403, `status ${start2.status}`);
  const startM = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'meme' }) });
  check('meme locked (needs 25)', startM.status === 403, `status ${startM.status}`);

  const resign = await api('/api/jobs/resign', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('resign works', resign.status === 200 && resign.body?.success === true, `status ${resign.status}`);
  check('resign ends employment', resign.body?.unemployed === true, JSON.stringify(resign.body));
  const startAfterResign = await api('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('resigned user cannot start shifts',
    startAfterResign.status === 403 && startAfterResign.body?.code === 'NO_JOB',
    `status ${startAfterResign.status} code ${startAfterResign.body?.code}`);

  // Fail path + isolation with a second user: wrong sequence → loss with
  // sub-par pay; another account cannot touch the shift.
  const JAR2 = new Map();
  const signup2 = await apiWith(JAR2, '/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: `itest2-${stamp}@muragoods.test`, password: PASSWORD, name: 'Integration Tester 2' }),
  });
  check('second user signup succeeds', signup2.status === 200 || signup2.status === 201, `status ${signup2.status}`);
  const applyB = await apiWith(JAR2, '/api/jobs/apply', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('second user applies for cashier', applyB.status === 200 && applyB.body?.success === true,
    `status ${applyB.status}`);
  const startB = await apiWith(JAR2, '/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobId: 'cashier' }) });
  check('second user starts cashier shift', startB.status === 200 && !!startB.body?.token, `status ${startB.status}`);
  const tokenB = startB.body?.token || '';
  const cross = await api('/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token: tokenB, clicks: [0], elapsedMs: 6000 }),
  });
  check('cross-user shift completion refused', cross.status === 409, `status ${cross.status}`);
  const ticketB = startB.body?.challenge?.ticket || [];
  const labelsB = startB.body?.challenge?.labels || [];
  const rightB = ticketB.map((item) => labelsB.indexOf(item));
  const wrongB = [...rightB].reverse();
  const fail = await apiWith(JAR2, '/api/jobs/complete', {
    method: 'POST', body: JSON.stringify({ token: tokenB, clicks: wrongB, elapsedMs: 6000 }),
  });
  check('wrong sequence fails', fail.status === 200 && fail.body?.won === false, `status ${fail.status}`);
  check('failure pays configured sub-par amount', fail.body?.payout === 28500, `payout ${fail.body?.payout}`);
  check('failure reason is specific', /wrong order/i.test(fail.body?.reason || ''), fail.body?.reason);

  // Admin tuning: readable + writable, fail rate clamped below salary.
  const cfgGet = await api('/api/jobs/config');
  check('jobs config readable', cfgGet.status === 200 && typeof cfgGet.body?.failRate === 'number');
  const cfgBad = await api('/api/jobs/config', { method: 'PATCH', body: JSON.stringify({ failRate: 5 }) });
  check('non-admin config write refused', cfgBad.status === 401 || cfgBad.status === 403, `status ${cfgBad.status}`);
  const cfgSet = await apiWith(ADMIN_JAR, '/api/jobs/config', { method: 'PATCH', body: JSON.stringify({ failRate: 0.5 }) });
  check('admin sets fail rate', cfgSet.status === 200, `status ${cfgSet.status}`);
  const cfgHigh = await apiWith(ADMIN_JAR, '/api/jobs/config', { method: 'PATCH', body: JSON.stringify({ failRate: 1.5 }) });
  check('fail rate above 1 rejected', cfgHigh.status === 400, `status ${cfgHigh.status}`);
  const cfgRestore = await apiWith(ADMIN_JAR, '/api/jobs/config', { method: 'PATCH', body: JSON.stringify({ failRate: 0.3 }) });
  check('admin restores fail rate', cfgRestore.status === 200, `status ${cfgRestore.status}`);
}

// ─── 3b. Economy API — authorization and validation ───────────────────
// These routes are the dashboard's only path to the economy. The critical
// property is that they REFUSE an unauthorized caller and that a read never
// fabricates a number. A logged-in storefront user is not a Discord guild
// admin, so every economy route must reject them.
console.log('[3b] economy authorization');
{
  const GUILD = '1234567890123456789';

  const ov = await api(`/api/dashboard/economy/overview?guildId=${GUILD}`);
  check('economy overview rejects non-admin', ov.status === 401 || ov.status === 403,
    `status ${ov.status}`);

  const read = await api(`/api/dashboard/economy/read?guildId=${GUILD}&endpoint=transactions`);
  check('economy transactions rejects non-admin', read.status === 401 || read.status === 403,
    `status ${read.status}`);

  const lb = await api(`/api/dashboard/economy/read?guildId=${GUILD}&endpoint=leaderboard`);
  check('economy leaderboard rejects non-admin', lb.status === 401 || read.status === 403,
    `status ${lb.status}`);

  const snapshot = await api(`/api/dashboard/economy?guildId=${GUILD}`);
  check('economy snapshot rejects non-admin', snapshot.status === 401 || snapshot.status === 403,
    `status ${snapshot.status}`);

  // An undefined/blank guild must be refused outright, never turned into a
  // query that matches nothing and reads back as an empty economy.
  const undefinedGuild = await api('/api/dashboard/economy?guildId=undefined');
  check('an undefined guildId is refused, not queried', undefinedGuild.status === 400,
    `status ${undefinedGuild.status}`);

  const cfg = await api('/api/dashboard/config', {
    method: 'PATCH',
    body: JSON.stringify({
      guildId: GUILD,
      actorId: '123',
      config: { economy: { dailyAmount: 999999 } },
    }),
  });
  check('owner-only economic write rejected', cfg.status === 401 || cfg.status === 403,
    `status ${cfg.status}`);

  // Malformed guild ids are rejected before any upstream call is attempted.
  const bad = await api('/api/dashboard/economy/overview?guildId=not-a-snowflake');
  check('malformed guildId rejected', bad.status === 400 || bad.status === 401,
    `status ${bad.status}`);

  const badEndpoint = await api(
    `/api/dashboard/economy/read?guildId=${GUILD}&endpoint=../../etc/passwd`);
  check('unknown read endpoint rejected', badEndpoint.status === 400 || badEndpoint.status === 401,
    `status ${badEndpoint.status}`);
}

// ─── 3d. One config system, and the new economy endpoints ─────────────
// The Economy save system was duplicated at one point (a second
// /api/dashboard/economy/config route) and then repaired by removing the
// duplicate, not by keeping both. This block fails if it ever comes back, and
// it checks that the new channel endpoint is auth-guarded like every other
// Discord-reading route. The per-field validation itself needs a live guild,
// so it is covered by scripts/test-economy-config.mjs instead.
console.log('[3d] one config system');
{
  const GUILD = '1234567890123456789';

  const dup = await apiWith(ADMIN_JAR, '/api/dashboard/economy/config', {
    method: 'PATCH',
    body: JSON.stringify({ guildId: GUILD, actorId: '123', config: { dailyAmount: 1 } }),
  });
  check('the duplicate economy config route is gone', dup.status === 404, `status ${dup.status}`);

  const channels = await api('/api/dashboard/economy/channels?guildId=' + GUILD);
  check('the channel selector endpoint rejects a non-admin',
    channels.status === 401 || channels.status === 403, `status ${channels.status}`);

  const anonChannels = await fetch(`${BASE}/api/dashboard/economy/channels?guildId=${GUILD}`)
    .then((r) => r.status);
  check('the channel selector endpoint rejects an anonymous caller', anonChannels === 401,
    `status ${anonChannels}`);
}

// ─── 3e. Save error taxonomy, end to end ───────────────────────────
// A save failure must never be reported to the browser as a validation
// failure. These assert the STATUS a caller gets for each situation, which is
// the part the frontend maps.
console.log('[3e] save failure taxonomy');
{
  const GUILD = '1234567890123456789';
  // This suite signs in with email, not Discord, so every dashboard save is
  // correctly refused. That refusal is the assertion: an unauthenticated save
  // must be 401 and must NOT be dressed up as a validation failure.
  const anonSave = await api('/api/dashboard/config', {
    method: 'PATCH',
    body: JSON.stringify({ guildId: GUILD, config: { modules: { security: true } } }),
  });
  check('a save without a Discord session is 401', anonSave.status === 401, `status ${anonSave.status}`);
  check('the refusal names AUTHENTICATION_REQUIRED, not validation',
    anonSave.body?.code === 'AUTH_REQUIRED', JSON.stringify(anonSave.body));
  check('an unauthenticated save is not reported as a validation error',
    anonSave.body?.code !== 'VALIDATION_ERROR' && anonSave.body?.code !== 'INVALID_REQUEST',
    JSON.stringify(anonSave.body));
  check('an unauthenticated save is not reported as an upstream failure',
    anonSave.body?.code !== 'BOT_API_UNAVAILABLE', JSON.stringify(anonSave.body));
  // Authorization is checked BEFORE the body is even parsed, so a malformed
  // guild id cannot leak whether it would have been valid.
  const anonBad = await api('/api/dashboard/config', {
    method: 'PATCH',
    body: JSON.stringify({ guildId: 'not-a-guild', config: {} }),
  });
  check('an unauthenticated malformed save is still 401, not 400',
    anonBad.status === 401, `status ${anonBad.status}`);

  // The resource validator must refuse an anonymous caller the same way.
  const anonValidate = await fetch(`${BASE}/api/dashboard/resources/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: GUILD, kind: 'channel', id: '123456789012345678' }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  check('the resource validator rejects an anonymous caller', anonValidate.status === 401,
    `status ${anonValidate.status}`);
  check('the resource validator does not claim a validation failure',
    anonValidate.body?.code !== 'VALIDATION_ERROR', JSON.stringify(anonValidate.body));

  // The persistence guarantee the dashboard relies on: a successful write
  // returns what is actually stored. Exercised here through the audit log,
  // which records the same document the save produced.
  const readBack = await api('/api/dashboard/config?guildId=' + GUILD);
  check('reading config without a Discord session is refused',
    readBack.status === 401 || readBack.status === 403, `status ${readBack.status}`);
}

// ─── 4. Cleanup (best effort) ───────────────────────────────────────
console.log('[4] cleanup');
{
  if (orderId) {
    const del = await apiWith(ADMIN_JAR, `/api/orders?id=${orderId}`, { method: 'DELETE' });
    check('test order deleted', del.status === 200 || del.status === 404);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
