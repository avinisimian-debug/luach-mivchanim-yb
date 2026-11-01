// Reminder delivery: email (existing Brevo sender) and Web Push.
// Push is enabled only when the VAPID env vars exist, so a missing key never breaks the cron.
import webpush from 'web-push';

export const CHANNELS = ['email', 'push'];
export const KINDS = ['bagrut', 'mock', 'exam', 'event'];

export function channelsAvailable() {
  return {
    email: !!process.env.BREVO_API_KEY,
    push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  };
}

// ---------- subscriber prefs ----------
export function normalizeNotify(sub) {
  const ch = sub.channels || {};
  const push = Array.isArray(sub.push) ? sub.push.filter((s) => s && s.endpoint).slice(-5) : [];
  const channels = { email: ch.email !== false, push: !!ch.push && push.length > 0 };
  const kinds = Array.isArray(sub.kinds) && sub.kinds.length ? sub.kinds.filter((k) => KINDS.includes(k)) : [...KINDS];
  const { phone, ...rest } = sub; // drop the old phone field
  return { ...rest, channels, kinds, push };
}

export function applyNotifyPrefs(next, b) {
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
const whenHe = (n) => (n === 1 ? 'מחר' : n === 0 ? 'היום' : n === 7 ? 'בעוד שבוע' : `בעוד ${n} ימים`);
export function shortText(sub, items, n) {
  const list = items.map((i) => (KIND_HE[i.k] ? `${KIND_HE[i.k]} ${i.t}` : i.t)).join(', ');
  return `${whenHe(n)}: ${list}`.slice(0, 200);
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
  const run = async (channel, fn) => {
    if (!sub.channels[channel] || !avail[channel]) return;
    if (dry) return out.push({ channel, ok: true, dry: true });
    try { out.push({ channel, ...(await fn()) }); } catch (e) { out.push({ channel, ok: false, error: String(e.message || e) }); }
  };
  await run('email', emailFn);
  await run('push', () => sendPush(sub, `תזכורת, ${sub.name}`, shortText(sub, items, n), siteUrl));
  return out;
}
