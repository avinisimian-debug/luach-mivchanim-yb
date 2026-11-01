import { CLASSES, EMAIL_RE, subId, legacyIds, getSub, saveSub, deleteSub, normalize, publicSub, cleanMajors, todayIL, upcomingFor, welcomeEmail, sendEmail, readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  const b = readBody(req);
  if (b.website) return res.status(200).json({ ok: true });
  const name = String(b.name || '').trim().slice(0, 60);
  const cls = String(b.cls || '').trim();
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'name' });
  if (!CLASSES.includes(cls)) return res.status(400).json({ ok: false, error: 'cls' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email' });

  const id = subId(email);
  const existing = await getSub(id);
  const sub = normalize({ ...(existing || {}), id, name, cls, email, majors: cleanMajors(b.majors), createdAt: existing?.createdAt || new Date().toISOString() });
  try { await saveSub(sub); } catch (e) { console.error('save', e); return res.status(500).json({ ok: false, error: 'save' }); }
  for (const lid of legacyIds(email)) if (lid !== id) await deleteSub(lid);

  const mail = await sendEmail(email, name, welcomeEmail(sub, upcomingFor(cls, todayIL(), 5, sub.majors)), id);
  if (!mail.ok) console.warn('welcome email', mail.error);
  return res.status(200).json({ ok: true, token: id, sub: publicSub(sub), emailed: mail.ok, existing: !!existing });
}
