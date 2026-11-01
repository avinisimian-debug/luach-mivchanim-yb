import { CLASSES, REMIND_OPTIONS, getSub, saveSub, deleteSub, normalize, publicSub, cleanMajors, readBody } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const id = String(req.query.t || '');
  const sub = await getSub(id);
  if (!sub) return res.status(404).json({ ok: false, error: 'not_found' });
  if (req.method === 'GET') return res.status(200).json({ ok: true, sub: publicSub(normalize(sub)) });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = readBody(req);
  if (b.action === 'delete') { await deleteSub(sub.id); return res.status(200).json({ ok: true, deleted: true }); }

  const next = normalize(sub);
  if (typeof b.name === 'string') {
    const n = b.name.trim().slice(0, 60);
    if (n.length < 2) return res.status(400).json({ ok: false, error: 'name' });
    next.name = n;
  }
  if (b.cls !== undefined) {
    if (!CLASSES.includes(b.cls)) return res.status(400).json({ ok: false, error: 'cls' });
    next.cls = b.cls;
  }
  if (Array.isArray(b.remind)) next.remind = [...new Set(b.remind.map(Number))].filter((d) => REMIND_OPTIONS.includes(d)).sort((a, b) => b - a);
  if (Array.isArray(b.majors)) next.majors = cleanMajors(b.majors);
  if (typeof b.paused === 'boolean') next.paused = b.paused;
  await saveSub(next);
  return res.status(200).json({ ok: true, sub: publicSub(next) });
}
