// Minimal transactional mailer (Phase 1b — delivery and recovery).
// Uses Resend when RESEND_API_KEY is set; otherwise logs to the server
// console so local/dev runs still "deliver" visibly. Never throws: a
// failed send must not block sealing a paid gift.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'EnigmaGift <gifts@enigmagift.pages.dev>';
const APP_ORIGIN = process.env.APP_ORIGIN || 'https://enigmagift.pages.dev';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);
}

async function send(to, subject, html, text) {
  if (!isEmail(to)) throw new Error('bad recipient address');
  if (!RESEND_API_KEY) {
    console.log(`[mailer:dev] to=${to} subject="${subject}"\n${text}`);
    return { ok: true, dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return { ok: true };
}

const shell = (title, bodyHtml) => `
<div style="font-family:Georgia,serif;max-width:34rem;margin:0 auto;padding:1.5rem;color:#2a2622">
  <p style="font-size:.85rem;letter-spacing:.08em;text-transform:lowercase;color:#8a7f72;margin:0 0 .4rem">enigmagift</p>
  <h1 style="font-size:1.35rem;font-weight:normal;margin:0 0 1rem">${title}</h1>
  ${bodyHtml}
  <p style="font-size:.8rem;color:#8a7f72;margin-top:2rem;border-top:1px solid #e6ded4;padding-top:1rem">
    We store only your photos, the gift text and this email address — see
    <a href="${APP_ORIGIN}/privacy" style="color:#8a5a2b">what's stored</a>.
    You can delete the gift any time from its controls page.
  </p>
</div>`;

/** The gift link, on seal (or on its scheduled morning). */
export function sendGiftLink(to, { trailUrl, direction, sendAt }) {
  const link = `${APP_ORIGIN}${trailUrl}`;
  const when = sendAt ? `It opens on ${new Date(sendAt).toUTCString().slice(0, 16)} — the link works from then.` : 'It is ready to open now.';
  return send(
    to,
    `a gift for ${direction || 'someone'} — your link`,
    shell(
      'Your gift is sealed.',
      `<p>Here is the link to send (or it will arrive with them ${sendAt ? 'on the day' : 'now'}):</p>
       <p style="font-size:1.05rem"><a href="${link}" style="color:#8a5a2b">${link}</a></p>
       <p>${when} Keep this email — it is the only record of the link outside your browser.</p>`,
      `Your gift is sealed.\n\n${link}\n\n${when}\nKeep this email — it is the only record of the link outside your browser.`,
    ),
  );
}

/** GET /api/lookup — email back every link owned by this address. */
export function sendLookup(to, gifts) {
  const rows = gifts
    .map(
      (g) =>
        `<li style="margin:.5rem 0"><a href="${APP_ORIGIN}/?g=${g.id}" style="color:#8a5a2b">gift controls</a>${
          g.trailUrl ? ` · <a href="${APP_ORIGIN}${g.trailUrl}" style="color:#8a5a2b">recipient link</a>` : ''
        } · ${g.status}${g.created_at ? ` · ${g.created_at.slice(0, 10)}` : ''}</li>`,
    )
    .join('');
  return send(
    to,
    'your enigmagift links',
    shell(
      'Your gifts.',
      `<p>Every gift made from this address:</p><ul style="padding-left:1.2rem">${rows}</ul>`,
      `Your gifts:\n${gifts.map((g) => `${APP_ORIGIN}/?g=${g.id} (${g.status})`).join('\n')}`,
    ),
  );
}
