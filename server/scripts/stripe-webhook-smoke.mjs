// Internal operator smoke test: sign a synthetic checkout.session.completed
// with the machine's webhook secret and post it to the local server. This
// proves our webhook verification/payment handling without involving Stripe.
// It does NOT prove Stripe dashboard delivery and must never be treated as a
// real payment. Requires explicit confirmation because it mutates the gift.
//
//   node /app/scripts/stripe-webhook-smoke.mjs <gift-id> --confirm
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const [giftId, confirm] = process.argv.slice(2);
if (!giftId || confirm !== '--confirm') {
  console.error('usage: node stripe-webhook-smoke.mjs <gift-id> --confirm');
  process.exit(2);
}
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) {
  console.error('STRIPE_WEBHOOK_SECRET is not configured');
  process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || '/data/enigmagift.db', { readOnly: true });
const gift = db.prepare('SELECT id, tier, referred_by FROM gifts WHERE id=?').get(giftId);
db.close();
if (!gift) {
  console.error('gift not found');
  process.exit(1);
}
const prices = { trail: 499, hide: 999, set: 1900 };
const amount = prices[gift.tier] ?? (gift.tier == null ? prices.hide : null);
if (!amount) {
  console.error(`unknown gift tier: ${gift.tier}`);
  process.exit(1);
}

const stamp = Date.now();
const payload = JSON.stringify({
  id: `evt_ops_smoke_${stamp}`,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: `cs_ops_smoke_${stamp}`,
      client_reference_id: giftId,
      amount_total: amount,
      payment_status: 'paid',
      currency: 'gbp',
    },
  },
});
const t = Math.floor(Date.now() / 1000);
const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
const res = await fetch('http://127.0.0.1:8787/api/stripe/webhook', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': `t=${t},v1=${v1}`,
  },
  body: payload,
});
console.log(`webhook_status=${res.status}`);
console.log(await res.text());
process.exit(res.ok ? 0 : 1);
