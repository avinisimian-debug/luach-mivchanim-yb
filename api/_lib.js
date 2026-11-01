import crypto from 'node:crypto';
import { put, get, del, list } from '@vercel/blob';
import { EXAMS, ALL_DAYS } from './_exams.js';

export const CLASSES = ['יב1', 'יב2', 'יב3', 'יב4'];
export const REMIND_OPTIONS = [7, 3, 1];
export const MAJORS = { eretz: 'ארץ', agri: 'חקלאות', bio: 'ביולוגיה', phys: 'פיזיקה', cs: 'מדעי המחשב', bees: 'כוורות' };
const MAJOR_OF = { 'בגרות בארץ': 'eretz', 'סיור ארץ': 'eretz', 'חפירות ארכיאולוגיות מגמת ארץ': 'eretz', 'בגרות בחקלאות': 'agri', 'בגרות ביולוגיה': 'bio', 'בגרות ביולוגיה מעבדה': 'bio', 'בגרות בפיזיקה': 'phys', 'בגרות בפיזיקה מעבדה': 'phys', 'בגרות במדמח ושפות': 'cs', 'מבחן מחשבים': 'cs' };
export const majorOf = (t) => MAJOR_OF[t] || null;
export const relevant = (i, cls, majors) => i.c.includes(cls) && (!majors || !majors.length || !majorOf(i.t) || majors.includes(majorOf(i.t)));
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'aviya.nish@gmail.com').split(',').map((e) => e.trim().toLowerCase());
export const isAdmin = (s) => !!s && ADMIN_EMAILS.includes(String(s.email).toLowerCase());
const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
export const KIND = { bagrut: 'בגרות', mock: 'מתכונת', exam: 'מבחן', event: 'אירוע' };

export const siteUrl = () =>
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://luach-mivchanim-yb.vercel.app');
export const meUrl = (id) => `${siteUrl()}/#/me?t=${id}`;
export const unsubUrl = (id) => `${siteUrl()}/api/unsubscribe?id=${id}`;

const hmac = (s) => crypto.createHmac('sha256', process.env.CRON_SECRET || 'x').update(s).digest('hex').slice(0, 32);
export const subId = (email) => hmac(email.toLowerCase().trim());
export const legacyIds = (email) => CLASSES.map((c) => hmac(email.toLowerCase().trim() + '|' + c));
export const isId = (s) => /^[a-f0-9]{32}$/.test(String(s || ''));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function getSub(id) {
  if (!isId(id)) return null;
  try {
    const r = await get(`subs/${id}.json`, { access: 'private' });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch { return null; }
}
export async function saveSub(sub) {
  sub.updatedAt = new Date().toISOString();
  await put(`subs/${sub.id}.json`, JSON.stringify(sub), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
  return sub;
}
export async function deleteSub(id) { try { await del(`subs/${id}.json`); return true; } catch { return false; } }
export async function listSubs() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: 'subs/', cursor, limit: 1000 });
    for (const b of page.blobs) {
      const id = b.pathname.slice(5, -5);
      const s = await getSub(id);
      if (s) out.push(s);
    }
    cursor = page.cursor;
  } while (cursor);
  return out;
}
export const normalize = (s) => ({
  remind: [7], paused: false, majors: [], ...s,
  remind: Array.isArray(s.remind) ? s.remind.filter((d) => REMIND_OPTIONS.includes(d)) : [7],
  majors: Array.isArray(s.majors) ? s.majors.filter((m) => MAJORS[m]) : [],
});
export const cleanMajors = (a) => (Array.isArray(a) ? [...new Set(a)].filter((m) => MAJORS[m]) : []);
export const publicSub = (s) => ({ name: s.name, cls: s.cls, email: s.email, remind: s.remind, majors: s.majors || [], paused: !!s.paused, createdAt: s.createdAt, isAdmin: isAdmin(s), channels: s.channels || { email: true, push: false }, kinds: s.kinds || ['bagrut', 'mock', 'exam', 'event'], pushCount: Array.isArray(s.push) ? s.push.length : 0 });

export const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const prettyDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ב${MONTHS[m - 1]}`; };

export const examsOn = (iso, cls, majors) => {
  const day = EXAMS.find((x) => x.d === iso);
  if (!day) return null;
  const items = day.items.filter((i) => relevant(i, cls, majors));
  return items.length ? { ...day, items } : null;
};
// Everything on a date for this class, including events (שבת ישיבה, trips...). Used by reminders.
export const daysOn = (iso, cls, majors) => {
  const day = ALL_DAYS.find((x) => x.d === iso);
  if (!day) return null;
  const items = day.items.filter((i) => relevant(i, cls, majors));
  return items.length ? { ...day, items } : null;
};
export const upcomingFor = (cls, fromIso, limit = 5, majors) =>
  EXAMS.filter((d) => d.d >= fromIso)
    .map((d) => ({ ...d, items: d.items.filter((i) => relevant(i, cls, majors)) }))
    .filter((d) => d.items.length)
    .slice(0, limit);
export const examsForClass = (cls, majors) =>
  EXAMS.map((d) => ({ ...d, items: d.items.filter((i) => relevant(i, cls, majors)) })).filter((d) => d.items.length);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { ink: '#0E1A2B', muted: '#5B6779', line: '#DFE4EA', bg: '#F3F5F7', bagrut: '#2547B8', mock: '#B8700F', exam: '#0F7B66', event: '#7A3FB8' };
const button = (href, label) => `<a href="${href}" style="display:inline-block;background:${C.ink};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:10px">${label}</a>`;
const shell = (pre, inner, id) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden">${esc(pre)}</span>
<div style="max-width:560px;margin:0 auto;padding:24px 14px" dir="rtl">
<p style="margin:0 0 12px;font-size:13px;font-weight:bold;color:${C.muted}">לוח מבחנים י״ב</p>
<div style="background:#ffffff;border:1px solid ${C.line};border-radius:14px;padding:26px 22px;text-align:right">${inner}</div>
<p style="font-size:12px;color:${C.muted};text-align:center;margin:18px 0 0;line-height:1.7">
<a href="${siteUrl()}" style="color:${C.muted}">לוח המבחנים</a>${id ? ` &nbsp;|&nbsp; <a href="${meUrl(id)}" style="color:${C.muted}">האזור האישי וההגדרות</a> &nbsp;|&nbsp; <a href="${unsubUrl(id)}" style="color:${C.muted}">הסרה מהתזכורות</a>` : ''}</p>
</div></body></html>`;
const itemRow = (i) => `<table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0"><tr>
<td style="width:4px;background:${C[i.k]};border-radius:2px"></td>
<td style="padding:10px 14px;background:#F7F8FA;border-radius:0 8px 8px 0">
<div style="font-size:12px;font-weight:bold;color:${C[i.k]}">${KIND[i.k]}</div>
<div style="font-size:18px;font-weight:bold;color:${C.ink}">${esc(i.t)}</div></td></tr></table>`;
const whenWord = (n) => (n === 1 ? 'מחר' : n === 7 ? 'בעוד שבוע' : `בעוד ${n} ימים`);

export const reminderEmail = (sub, day, n) => ({
  subject: `${whenWord(n)}: ${day.items.map((i) => i.t).join(' + ')} (${prettyDate(day.d)})`,
  html: shell(`${whenWord(n)} יש ל${sub.cls} ${day.items.map((i) => i.t).join(' ו')}`, `
<p style="font-size:16px;margin:0 0 6px">שלום ${esc(sub.name)},</p>
<p style="font-size:16px;margin:0 0 16px;color:${C.muted}">${whenWord(n)} יש ל${esc(sub.cls)}:</p>
<p style="font-size:22px;font-weight:bold;margin:0">יום ${esc(day.w)}, ${prettyDate(day.d)}</p>
<p style="font-size:14px;color:${C.muted};margin:2px 0 10px">${esc(day.h)}</p>
${day.items.map(itemRow).join('')}
${day.items.some((i) => i.k !== 'event') ? '<p style="font-size:15px;margin:20px 0 18px">בהצלחה!</p>' : '<p style="margin:0 0 18px"></p>'}
${button(meUrl(sub.id), 'לאזור האישי')}`, sub.id),
});

export const welcomeEmail = (sub, upcoming) => ({
  subject: `נרשמת לתזכורות המבחנים של ${sub.cls}`,
  html: shell('ההרשמה הצליחה. כאן גם הקישור לאזור האישי שלך.', `
<p style="font-size:20px;font-weight:bold;margin:0 0 8px">שלום ${esc(sub.name)}, נרשמת בהצלחה</p>
<p style="font-size:15px;margin:0 0 18px;color:${C.muted};line-height:1.6">מעכשיו תקבל מייל שבוע לפני כל מבחן ואירוע של ${esc(sub.cls)}${sub.majors && sub.majors.length ? ` ושל המגמות שלך (${sub.majors.map((m) => MAJORS[m]).join(', ')})` : ''}. באזור האישי אפשר להוסיף תזכורת גם יום לפני, להחליף כיתה ולחבר את הלוח ליומן בטלפון.</p>
${button(meUrl(sub.id), 'לאזור האישי')}
${upcoming.length ? `<p style="font-size:15px;font-weight:bold;margin:26px 0 4px">המבחנים הקרובים</p>
${upcoming.map((d) => `<p style="margin:14px 0 0;font-weight:bold">יום ${esc(d.w)}, ${prettyDate(d.d)} <span style="font-weight:normal;color:${C.muted};font-size:13px">${esc(d.h)}</span></p>${d.items.map(itemRow).join('')}`).join('')}` : ''}`, sub.id),
});

export const loginEmail = (sub) => ({
  subject: 'הקישור לאזור האישי שלך',
  html: shell('לחיצה על הכפתור תכניס אותך לאזור האישי.', `
<p style="font-size:18px;font-weight:bold;margin:0 0 8px">שלום ${esc(sub.name)},</p>
<p style="font-size:15px;margin:0 0 20px;color:${C.muted};line-height:1.6">ביקשת להיכנס לאזור האישי בלוח המבחנים. הכפתור מכניס אותך ישר, בלי סיסמה.</p>
${button(meUrl(sub.id), 'כניסה לאזור האישי')}
<p style="font-size:13px;margin:20px 0 0;color:${C.muted}">אם לא ביקשת את זה, אפשר להתעלם מהמייל.</p>`, sub.id),
});

export async function sendEmail(to, name, { subject, html }, id) {
  const key = process.env.BREVO_API_KEY;
  if (!key || !process.env.SENDER_EMAIL) return { ok: false, error: 'email_not_configured' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.SENDER_NAME || 'לוח מבחנים י״ב', email: process.env.SENDER_EMAIL },
      to: [{ email: to, name }],
      subject,
      htmlContent: html,
      headers: id ? { 'List-Unsubscribe': `<${unsubUrl(id)}>` } : undefined,
    }),
  });
  return r.ok ? { ok: true } : { ok: false, error: `brevo_${r.status}: ${(await r.text()).slice(0, 200)}` };
}

export const readBody = (req) => {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
};
