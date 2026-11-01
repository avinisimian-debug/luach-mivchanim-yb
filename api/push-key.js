import { channelsAvailable } from './_notify.js';
export default function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=3600');
  res.status(200).json({ ok: true, key: process.env.VAPID_PUBLIC_KEY || null, channels: channelsAvailable() });
}
