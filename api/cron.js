import { todayIL, addDays, daysOn, reminderEmail, sendEmail, listSubs, normalize, saveSub, siteUrl } from './_lib.js';
import { dispatch, normalizeNotify, filterKinds } from './_notify.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  const today = (req.query.today && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today)) ? req.query.today : todayIL();
  const dry = req.query.dry === '1';
  const only = req.query.only ? String(req.query.only) : null; // limit a test run to one subscriber id

  const subs = (await listSubs()).map((s) => normalizeNotify(normalize(s))).filter((s) => !only || s.id === only);
  const results = [];
  for (const s of subs) {
    if (s.paused) continue;
    const deadPush = [];
    for (const n of s.remind) {
      const day = daysOn(addDays(today, n), s.cls, s.majors);
      if (!day) continue;
      const items = filterKinds(day.items, s.kinds);
      if (!items.length) continue;
      const out = await dispatch(s, items, n, {
        dry, siteUrl: siteUrl(),
        emailFn: () => sendEmail(s.email, s.name, reminderEmail(s, { ...day, items }, n), s.id),
      });
      for (const o of out) { results.push({ cls: s.cls, n, channel: o.channel, ok: o.ok, error: o.error }); if (o.dead) deadPush.push(...o.dead); }
    }
    if (deadPush.length && !dry) { try { await saveSub({ ...s, push: s.push.filter((p) => !deadPush.includes(p.endpoint)) }); } catch (e) { console.error('prune push', e); } }
  }
  const sent = results.filter((r) => r.ok).length;
  const byChannel = results.reduce((a, r) => { a[r.channel] = (a[r.channel] || 0) + (r.ok ? 1 : 0); return a; }, {});
  console.log(`reminders ${today}: ${sent}/${results.length}`, JSON.stringify(byChannel), `subscribers ${subs.length}`);
  return res.status(200).json({ ok: true, today, subscribers: subs.length, sent, byChannel, failed: results.filter((r) => !r.ok) });
}
