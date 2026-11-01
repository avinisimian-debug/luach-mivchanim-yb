import { EMAIL_RE, subId, getSub, saveSub, loginEmail, sendEmail, readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const email = String(readBody(req).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email' });
  const sub = await getSub(subId(email));
  if (sub) {
    const last = sub.lastLoginMail ? Date.parse(sub.lastLoginMail) : 0;
    if (Date.now() - last > 60 * 1000) {
      const r = await sendEmail(sub.email, sub.name, loginEmail(sub), sub.id);
      if (!r.ok) console.warn('login email', r.error);
      sub.lastLoginMail = new Date().toISOString();
      await saveSub(sub);
    }
  }
  return res.status(200).json({ ok: true });
}
