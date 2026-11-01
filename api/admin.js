import { CLASSES, MAJORS, getSub, isAdmin, listSubs, normalize, deleteSub, todayIL, addDays, examsOn, upcomingFor, reminderEmail, sendEmail, readBody } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const me = await getSub(String(req.query.t || ''));
  if (!isAdmin(me)) return res.status(403).json({ ok: false, error: 'forbidden' });

  if (req.method === 'POST') {
    const b = readBody(req);
    if (b.action === 'delete') {
      if (!/^[a-f0-9]{32}$/.test(String(b.id || ''))) return res.status(400).json({ ok: false });
      await deleteSub(b.id);
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'test') {
      const s = normalize(me);
      const next = upcomingFor(s.cls, todayIL(), 1, s.majors)[0];
      if (!next) return res.status(200).json({ ok: false, error: 'no_exams' });
      const r = await sendEmail(s.email, s.name, reminderEmail(s, next, 7), s.id);
      return res.status(r.ok ? 200 : 502).json({ ok: r.ok, error: r.error });
    }
    return res.status(400).json({ ok: false });
  }

  const subs = (await listSubs()).map(normalize);
  const today = todayIL();
  const preview = [];
  for (let k = 0; k < 14; k++) {
    const day = addDays(today, k);
    let count = 0; const subjects = new Set();
    for (const s of subs) {
      if (s.paused) continue;
      for (const n of s.remind) {
        const ex = examsOn(addDays(day, n), s.cls, s.majors);
        if (ex) { count++; ex.items.forEach((i) => subjects.add(i.t)); }
      }
    }
    if (count) preview.push({ date: day, count, subjects: [...subjects] });
  }
  return res.status(200).json({
    ok: true,
    classes: CLASSES, majors: MAJORS,
    subs: subs.map((s) => ({ id: s.id, name: s.name, email: s.email, cls: s.cls, majors: s.majors, remind: s.remind, paused: !!s.paused, createdAt: s.createdAt })),
    preview,
  });
}
