import { createHash } from 'node:crypto';
export const sourceCollections = ['partners', 'offers', 'routes', 'bookings'];
export const keyFor = text => createHash('sha256').update(text).digest('hex');
const clean = text => String(text || '').replace(/[\r\n]/g, ' ').slice(0, 100);

// Recipients and message text are derived here, never supplied by mobile clients.
export function statusNotifications(collection, id, current, previous, adminUids = []) {
  if (current.isSample || current.isDemo || current.status === previous?.status || !current.status) return [];
  const status = clean(current.status), name = clean(current.title || current.name || current.flightNo || 'your listing');
  const result = [];
  const add = (uid, app, title, body, category) => {
    if (typeof uid === 'string' && uid && !uid.includes('/') && !result.some(r => r.uid === uid && r.app === app)) result.push({ uid, app, title, body, category, sourceCollection: collection, sourceId: id });
  };
  const admins = (title, body) => adminUids.forEach(uid => add(uid, 'admin', title, body, 'review'));
  if (collection === 'partners') {
    if (status === 'Pending') admins('Partner application awaiting review', 'A partner account is awaiting SkyConnect review.');
    else add(current.uid || id, 'partner', 'Partner application updated', `Your SkyConnect partner status is now ${status}.`, 'approval');
  } else if (collection === 'offers' || collection === 'routes') {
    const pending = status.toLowerCase() === 'pending';
    if (pending) admins('Listing awaiting review', `${name} is awaiting SkyConnect review.`);
    if (previous || !pending) add(current.partnerId || current.airlineId, 'partner', 'Listing status updated', `${name}: ${status}.`, collection === 'routes' ? 'slot' : 'approval');
  } else if (collection === 'bookings') {
    add(current.userId, 'traveler', previous ? 'Booking status updated' : 'Booking request received', `Your booking request is ${status}.`, 'booking');
    add(current.partnerId || current.airlineId, 'partner', previous ? 'Booking status updated' : 'New booking request', `A booking request is ${status}. Open SkyConnect to review it.`, 'booking');
  }
  return result;
}

export function pushMessage(token, id, notification) {
  return {
    token,
    notification: { title: notification.title, body: notification.body },
    data: { notificationId: id, recipientUid: notification.uid, app: notification.app, sourceCollection: notification.sourceCollection || '', sourceId: notification.sourceId || '' },
    android: { priority: 'high', collapseKey: id, notification: { tag: id } },
    apns: { headers: { 'apns-collapse-id': id }, payload: { aps: { sound: 'default' } } },
    webpush: { notification: { tag: id } },
  };
}
export const invalidToken = code => ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(code);
export const retryAt = (attempt, now) => new Date(now + Math.min(3600000, 60000 * 2 ** Math.max(0, attempt - 1))).toISOString();
