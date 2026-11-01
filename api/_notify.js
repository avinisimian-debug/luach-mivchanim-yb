// Multi-channel reminder delivery: email (existing Brevo sender), SMS, WhatsApp, Web Push.
// Each channel is enabled only when its env vars exist, so missing credentials never break the cron.
import webpush from 'web-push';

export const CHANNELS = ['email', 'sms', 'whatsapp', 'push'];
export const KINDS = ['bagrut', 'mock', 'exam', 'event'];

// ---------- phone ----------
// Accepts 05X-XXXXXXX, +9725XXXXXXXX, 9725XXXXXXXX. Returns E.164 without "+" (9725XXXXXXXX) or null.
export function cleanPhone(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '972' + p.slice(1);
  return /^9725\d{8}$/.test(p) ? p : null;
}
const localPhone = (p) => '0' + p.slice(3);

export function channelsAvailable() {
  return {
    email: !!process.env.BREVO_API_KEY,
    sms: !!(process.env.SMS_PROVIDER && process.env.SMS_TOKEN),
    whatsapp: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_TEMPLATE),
    push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  };
}

// ---------- subscriber prefs ----------
export function normalizeNotify(sub) {
  const ch = sub.channels || {};
  const channels = { email: ch.email !== false, sms: !!ch.sms, whatsapp: !!ch.whatsapp, push: !!ch.push };
  const kinds = Array.isArray(sub.kinds) && sub.kinds.length ? sub.kinds.filter((k) => KINDS.includes(k)) : [...KINDS];
  const phone = cleanPhone(sub.phone);
  if (!phone) { channels.sms = false; channels.whatsapp = false; }
  const push = Array.isArray(sub.push) ? sub.push.filter((s) => s && s.endpoint).slice(-5) : [];
  if (!push.length) channels.push = false;
  return { ...sub, phone, channels, kinds, push };
}

export function applyNotifyPrefs(next, b) {
  if (b.phone !== undefined) {
    if (b.phone === '' || b.phone === null) next.phone = null;
    else { const p = cleanPhone(b.phone); if (!p) return 'phone'; next.phone = p; }
  }
  if (b.channels && typeof b.channels === 'object') {
    next.channels = { ...(next.channels || {}) };
    for (const c of CHANNELS) if (typeof b.channels[c] === 'boolean') next.channels[c] = b.channels[c];
  }
  if (Array.isArray(b.kinds)) next.kinds = b.kinds.filter((k) => KINDS.includes(k));
  if (b.pushSub && b.pushSub.endpoint && b.pushSub.keys) {
    const list = (next.push || []).filter((s) => s.endpoint !== b.pushSub.endpoint);
    list.push({ endpoint: String(b.pushSub.endpoint), keys: { p256dh: String(b.pushSub.keys.p256dh), auth: String(b.pushSub.keys.auth) } });
    next.push = list.slice(-5);
    next.channels = { ...(next.channels || {}), push: true };
  }
  if (b.pushRemove) next.push = (next.push || []).filter((s) => s.endpoint !== b.pushRemove);
  return null;
}

// Keeps only items of kinds the subscriber wants.
export const filterKinds = (items, kinds) => items.filter((i) => kinds.includes(i.k || 'exam'));

// ---------- text ----------
const KIND_HE = { bagrut: 'בגרות', mock: 'מתכונת', exam: 'מבחן', event: '' };
const whenHe = (n) => (n === 1 ? 'מחר' : n === 0 ? 'היום' : `בעוד ${n} ימים`);
export function shortText(sub, items, n, siteUrl) {
  const list = items.map((i) => (KIND_HE[i.k] ? `${KIND_HE[i.k]} ${i.t}` : i.t)).join(', ');
  return `היי ${sub.name}, ${whenHe(n)}: ${list}. בהצלחה! ${siteUrl}`.slice(0, 300);
}

// ---------- SMS ----------
async function sendSMS(phone, text) {
  const prov = process.env.SMS_PROVIDER;
  const sender = process.env.SMS_SENDER || 'LuachYB';
  if (prov === '019') {
    // 019 SMS REST API (docs.019sms.co.il). Bearer token + username.
    const r = await fetch('https://019sms.co.il/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_TOKEN}` },
      body: JSON.stringify({ sms: { user: { username: process.env.SMS_USER }, source: sender, destinations: { phone: [{ _: localPhone(phone) }] }, message: text } }),
    });
    const j = await r.json().catch(() => ({}));
    return j.status === 0 || j.status === '0' ? { ok: true } : { ok: false, error: `019:${j.status} ${j.message || r.status}` };
  }
  if (prov === 'inforu') {
    // InforU JSON API, Basic auth (username:token).
    const r = await fetch('https://capi.inforu.co.il/api/v2/SMS/SendSms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${process.env.SMS_USER}:${process.env.SMS_TOKEN}`).toString('base64') },
      body: JSON.stringify({ Data: { Message: text, Recipients: [{ Phone: localPhone(phone) }], Settings: { Sender: sender } } }),
    });
    const j = await r.json().catch(() => ({}));
    return j.StatusId === 1 ? { ok: true } : { ok: false, error: `inforu:${j.StatusId} ${j.StatusDescription || r.status}` };
  }
  return { ok: false, error: 'sms_provider' };
}

// ---------- WhatsApp (Meta Cloud API, approved utility template with 3 body params: name, when, list) ----------
async function sendWhatsApp(phone, sub, items, n) {
  const list = items.map((i) => (KIND_HE[i.k] ? `${KIND_HE[i.k]} ${i.t}` : i.t)).join(', ');
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_TOKEN}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: phone, type: 'template',
      template: { name: process.env.WA_TEMPLATE, language: { code: process.env.WA_LANG || 'he' },
        components: [{ type: 'body', parameters: [sub.name, whenHe(n), list].map((text) => ({ type: 'text', text })) }] },
    }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: `wa:${j.error?.code} ${j.error?.message || r.status}` };
}

// ---------- Web Push ----------
let vapidSet = false;
async function sendPush(sub, title, body, url) {
  if (!vapidSet) { webpush.setVapidDetails(`mailto:${process.env.SENDER_EMAIL}`, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); vapidSet = true; }
  const dead = [];
  let ok = false;
  for (const s of sub.push) {
    try { await webpush.sendNotification(s, JSON.stringify({ title, body, url }), { TTL: 86400 }); ok = true; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); }
  }
  return { ok, dead };
}

// Sends one reminder on every channel the subscriber enabled. emailFn sends the existing Brevo email.
export async function dispatch(sub, items, n, { emailFn, siteUrl, dry }) {
  const avail = channelsAvailable();
  const out = [];
  const text = shortText(sub, items, n, siteUrl);
  const run = async (channel, fn) => {
    if (!sub.channels[channel] || !avail[channel]) return;
    if (dry) return out.push({ channel, ok: true, dry: true });
    try { out.push({ channel, ...(await fn()) }); } catch (e) { out.push({ channel, ok: false, error: String(e.message || e) }); }
  };
  await run('email', emailFn);
  await run('sms', () => sendSMS(sub.phone, text));
  await run('whatsapp', () => sendWhatsApp(sub.phone, sub, items, n));
  await run('push', () => sendPush(sub, `תזכורת: ${whenHe(n)}`, text.replace(siteUrl, '').trim(), siteUrl));
  return out;
}

// ---------- shared helpers used by me.js / register.js / cron.js ----------
export const siteBase = () => (process.env.SITE_URL || 'https://luach-mivchanim-yb.vercel.app').replace(/\/$/, '');

// Safe public view of the notification prefs (never exposes push endpoints).
export const publicNotify = (s) => ({ phone: s.phone || null, channels: s.channels, kinds: s.kinds, pushCount: (s.push || []).length });
