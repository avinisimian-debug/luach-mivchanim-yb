import { isId, deleteSub, siteUrl } from './_lib.js';

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  const ok = isId(id) && (await deleteSub(id));
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.status(ok ? 200 : 400).send(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>הסרה מהתזכורות</title>
<body style="font-family:Arial,sans-serif;background:#F3F5F7;color:#0E1A2B;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">
<div style="background:#fff;border:1px solid #DFE4EA;padding:30px 26px;border-radius:14px;max-width:420px;text-align:center">
<h1 style="font-size:22px;margin:0 0 10px">${ok ? 'הוסרת מהתזכורות' : 'הקישור לא תקין'}</h1>
<p style="margin:0 0 18px;color:#5B6779;line-height:1.6">${ok ? 'לא יישלחו אליך יותר מיילים. אפשר להירשם שוב בכל זמן.' : 'נסה ללחוץ שוב על הקישור מהמייל.'}</p>
<a href="${siteUrl()}" style="display:inline-block;background:#0E1A2B;color:#fff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:10px">ללוח המבחנים</a></div></body></html>`);
}
