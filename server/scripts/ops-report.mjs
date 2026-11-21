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

console.log('\n-- funnel events (all time) --');
console.log(q("SELECT name, COUNT(*) c FROM events GROUP BY name ORDER BY c DESC LIMIT 25"));
const picks = q("SELECT name, data FROM events WHERE name LIKE 'round_%_picked'");
let right = 0;
for (const p of picks) { try { if (JSON.parse(p.data || '{}').correct) right++; } catch {} }
console.log(`round picks: ${picks.length}, correct: ${right} (${picks.length ? Math.round((100 * right) / picks.length) : 0}%)`);
console.log('webhook_ok (verified Stripe events that landed):', one("SELECT COUNT(*) c FROM events WHERE name='webhook_ok'").c);
console.log('markpaid_pending (client claims we could NOT verify — fine, webhook is truth):', one("SELECT COUNT(*) c FROM events WHERE name='markpaid_pending'").c);
console.log('shared_back (recipients sent a note back):', one("SELECT COUNT(*) c FROM events WHERE name='shared_back'").c);

console.log('\n-- reconcile (manual steps) --');
console.log('1. Stripe dashboard → Developers → Webhooks → we_… → "Recent deliveries": all 2xx?');
console.log('   Compare count with webhook_ok above — a gap means lost paid events.');
console.log('2. Stripe → Balance → payouts for the same window vs estimated gross above.');
console.log('3. SandBase + Recraft dashboards → spend in the same window (drafts included).');
console.log('   DIGITAL-HUNT.md models ~10p/read per draft; if drafts(7d) × 10p is large vs paid revenue, tighten or gate the read behind payment.');
