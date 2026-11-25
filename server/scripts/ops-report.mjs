// Ops report — volume, funnel, revenue estimate, and the health signals to
// reconcile against provider dashboards. Runs against the live DB on Fly:
//
//   fly -a enigmagift-api ssh console -C "node /app/scripts/ops-report.mjs"
//
// (locally: DB_PATH=./enigmagift.db node scripts/ops-report.mjs)
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH || '/data/enigmagift.db';
const PRICES_PENCE = { trail: 499, hide: 999, set: 1900 };

let db;
try {
  db = new DatabaseSync(DB_PATH, { readOnly: true });
} catch (e) {
  console.error(`cannot open ${DB_PATH}: ${e.message}`);
  process.exit(1);
}

const q = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
// older DBs may miss newer columns — degrade gracefully instead of dying
const hasCol = (table, col) => q(`PRAGMA table_info(${table})`).some((r) => r.name === col);
const safeOne = (sql, ...args) => { try { return one(sql, ...args); } catch { return { c: 'n/a' }; } };

console.log('=== enigmagift ops report —', new Date().toISOString(), '===\n');

console.log('-- configured capabilities (presence only, never values) --');
for (const key of [
  'SANDBASE_API_KEY',
  'GEMINI_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_API_KEY',
  'RESEND_API_KEY',
  'RECRAFT_API_KEY',
]) console.log(`${key}:`, process.env[key] ? 'configured' : 'missing');
console.log('ENABLE_EXPERIMENTAL_ROUTES:', process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true' ? 'true' : 'false');
console.log('ALLOW_UNPAID_SEAL:', process.env.ALLOW_UNPAID_SEAL === 'true' ? 'true — dangerous in production' : 'false');
console.log('MAIL_FROM:', process.env.MAIL_FROM ? 'configured' : 'missing');

console.log('-- gifts --');
console.log('by status:', q("SELECT status, COUNT(*) c FROM gifts GROUP BY status ORDER BY c DESC"));
console.log('by tier/mode:', q("SELECT COALESCE(tier,'-') tier, mode, COUNT(*) c, SUM(paid) paid FROM gifts GROUP BY tier, mode ORDER BY c DESC"));
const paid = q("SELECT COALESCE(tier,'-') tier, COUNT(*) c FROM gifts WHERE paid=1 GROUP BY tier");
const revenuePence = paid.reduce((s, r) => s + (PRICES_PENCE[r.tier] ?? 0) * r.c, 0);
console.log('paid by tier:', paid, `→ estimated gross £${(revenuePence / 100).toFixed(2)}`);
console.log('drafts (unsealed) total:', one("SELECT COUNT(*) c FROM gifts WHERE status IN ('reading','ready','error')").c,
  '| in last 7d:', one("SELECT COUNT(*) c FROM gifts WHERE status IN ('reading','ready','error') AND created_at > datetime('now','-7 days')").c,
  ' ← drafts burn vision $ before payment');

console.log('\n-- trails --');
console.log('total:', one('SELECT COUNT(*) c FROM trails').c,
  '| unlocked:', one('SELECT COUNT(*) c FROM trails WHERE unlocked=1').c,
  '| expired:', hasCol('trails', 'expires_at')
    ? one("SELECT COUNT(*) c FROM trails WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").c
    : 'n/a (old schema)');

console.log('\n-- packs --');
console.log(q('SELECT id, credits_left, purchase_gift_id FROM packs'));

console.log('\n-- entitlement/payoff integrity --');
console.log('paid but not delivery-entitled:', safeOne('SELECT COUNT(*) c FROM gifts WHERE paid=1 AND COALESCE(delivery_entitled,0)=0').c);
console.log('sealed but not delivery-entitled (legacy rows blocked at read time):', safeOne("SELECT COUNT(*) c FROM gifts WHERE status='sealed' AND COALESCE(delivery_entitled,0)=0").c);
console.log('recipient links attached to unentitled gifts (legacy rows blocked at read time):', safeOne('SELECT COUNT(*) c FROM trails t JOIN gifts g ON g.id=t.gift_id WHERE COALESCE(g.delivery_entitled,0)=0').c);
console.log('worlds ready/failed/worlding/pending:', q("SELECT COALESCE(world_status,'pending') s, COUNT(*) c FROM gifts GROUP BY s ORDER BY c DESC"));
console.log('portraits ready/failed/painting/skipped/pending:', q("SELECT COALESCE(portrait_status,'pending') s, COUNT(*) c FROM gifts GROUP BY s ORDER BY c DESC"));
console.log('stale worlds marked worlding >10min:', safeOne("SELECT COUNT(*) c FROM gifts WHERE world_status='worlding' AND world_started_at < datetime('now','-10 minutes')").c);
console.log('stale portraits marked painting >10min:', safeOne("SELECT COUNT(*) c FROM gifts WHERE portrait_status='painting' AND portrait_started_at < datetime('now','-10 minutes')").c);

console.log('\n-- funnel events (all time) --');
console.log(q("SELECT name, COUNT(*) c FROM events GROUP BY name ORDER BY c DESC LIMIT 25"));
const picks = q("SELECT name, data FROM events WHERE name LIKE 'round_%_picked'");
let right = 0;
for (const p of picks) { try { if (JSON.parse(p.data || '{}').correct) right++; } catch {} }
console.log(`round picks: ${picks.length}, correct: ${right} (${picks.length ? Math.round((100 * right) / picks.length) : 0}%)`);
const webhookRows = q("SELECT data FROM events WHERE name='webhook_ok'");
const syntheticWebhooks = webhookRows.filter((r) => String(r.data || '').includes('evt_ops_smoke_')).length;
console.log('webhook_ok (verified Stripe events that landed):', webhookRows.length, `of which synthetic ops smoke: ${syntheticWebhooks}`);
console.log('markpaid_pending (client claims we could NOT verify — fine, webhook is truth):', one("SELECT COUNT(*) c FROM events WHERE name='markpaid_pending'").c);
console.log('seal_blocked_unpaid (payment boundary held):', one("SELECT COUNT(*) c FROM events WHERE name='seal_blocked_unpaid'").c);
console.log('shared_back (recipients sent a note back):', one("SELECT COUNT(*) c FROM events WHERE name='shared_back'").c);
const dwellRows = q("SELECT name, data FROM events WHERE name LIKE 'round_%_dwell'");
const dwellMs = [];
for (const row of dwellRows) {
  try {
    const ms = Number(JSON.parse(row.data || '{}').ms);
    if (Number.isFinite(ms)) dwellMs.push(ms);
  } catch {}
}
console.log('round dwell events:', dwellRows.length, dwellMs.length
  ? `avg ${Math.round(dwellMs.reduce((a, b) => a + b, 0) / dwellMs.length / 1000)}s, max ${Math.round(Math.max(...dwellMs) / 1000)}s`
  : 'no timing data yet');
for (const name of ['reveal_complete', 'letter_read', 'world_loaded', 'world_failed', 'client_error']) {
  console.log(`${name}:`, one('SELECT COUNT(*) c FROM events WHERE name=?', name).c);
}

console.log('\n-- reconcile (manual steps) --');
console.log('1. Stripe dashboard → Developers → Webhooks → we_… → "Recent deliveries": all 2xx?');
console.log('   Compare count with non-synthetic webhook_ok above — a gap means lost paid events.');
console.log('2. Stripe → Balance → payouts for the same window vs estimated gross above.');
console.log('3. SandBase + Recraft dashboards → spend in the same window (drafts included).');
console.log('   DIGITAL-HUNT.md models ~10p/read per draft; if drafts(7d) × 10p is large vs paid revenue, tighten or gate the read behind payment.');
