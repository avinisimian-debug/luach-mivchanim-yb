import { CLASSES, KIND, MAJORS, examsForClass, addDays, siteUrl } from './_lib.js';

const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const fold = (line) => {
  if (Buffer.byteLength(line, 'utf8') <= 74) return line;
  const out = []; let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
};

export default function handler(req, res) {
  const c = Number(req.query.c);
  const cls = CLASSES[c - 1];
  if (!cls) return res.status(400).send('bad class');
  const majors = String(req.query.m || '').split(',').filter((x) => MAJORS[x]);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//luach-mivchanim-yb//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:מבחנים ${cls}`, 'X-WR-TIMEZONE:Asia/Jerusalem', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
  ];
  for (const d of examsForClass(cls, majors)) {
    d.items.forEach((i, idx) => {
      const ds = d.d.replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ds}-${c}-${idx}@luach-mivchanim-yb`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ds}`,
        `DTEND;VALUE=DATE:${addDays(d.d, 1).replace(/-/g, '')}`,
        `SUMMARY:${escIcs(i.t)}`,
        `DESCRIPTION:${escIcs(`${KIND[i.k]} · ${cls}\n${d.h}\n${siteUrl()}`)}`,
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escIcs(i.t + ' מחר')}`, 'TRIGGER:-PT6H', 'END:VALARM',
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  res.setHeader('content-type', 'text/calendar; charset=utf-8');
  res.setHeader('content-disposition', `inline; filename="exams-yb${c}.ics"`);
  res.setHeader('cache-control', 'public, max-age=3600');
  res.status(200).send(lines.map(fold).join('\r\n') + '\r\n');
}
