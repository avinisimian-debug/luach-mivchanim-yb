import { todayIL, addDays, examsOn, reminderEmail, sendEmail, listSubs, normalize } from './_lib.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  const today = (req.query.today && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today)) ? req.query.today : todayIL();
  const dry = req.query.dry === '1';

  const subs = (await listSubs()).map(normalize);
  const results = [];
  for (const s of subs) {
    if (s.paused) continue;
    for (const n of s.remind) {
      const day = examsOn(addDays(today, n), s.cls, s.majors);
      if (!day) continue;
      const r = dry ? { ok: true } : await sendEmail(s.email, s.name, reminderEmail(s, day, n), s.id);
      results.push({ cls: s.cls, n, ok: r.ok, error: r.error });
    }
  }
  const sent = results.filter((r) => r.ok).length;
  console.log(`reminders ${today}: ${sent}/${results.length}, subscribers ${subs.length}`);
  return res.status(200).json({ ok: true, today, subscribers: subs.length, sent, failed: results.filter((r) => !r.ok) });
}
