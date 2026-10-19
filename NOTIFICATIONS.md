# Notifications on Firebase Spark

The three frontends register FCM tokens and read private Firestore inboxes. The current sender is a trusted Node worker. It uses Firestore and FCM on Spark; it does not deploy Cloud Functions or change billing. The worker must remain running on an awake computer or another host. Hosting that process is separate from Firebase's no-cost FCM delivery. A Cloud Functions replacement is prepared locally; see [functions/README.md](functions/README.md). It requires Blaze to deploy and remains inactive until an explicit mode switch. Keep the live worker running until cutover.

## Run the sender

Dependencies are installed in this folder. The local ignored `.env.notifications.local` selects `skyconnect-sl-e4cdd`, the supplied current admin UID, and a 60-second polling interval. To configure another machine, copy `.env.notifications.example` to `.env.notifications.local` and fill in the administrator Auth UIDs.

```powershell
cd "C:\Users\User\Documents\SkyConnect\skyconnect-backend"
npx.cmd firebase login
npm.cmd run notifications:worker
```

Keep that terminal open. Stop with Ctrl+C. For one processing cycle use `npm.cmd run notifications:worker -- --once`. The script refreshes your authorized CLI token in memory and never copies it to the frontends. For a server using an authorized Application Default Credential, run `node scripts/notifications-worker.mjs` with GOOGLE_CLOUD_PROJECT and NOTIFICATION_ADMIN_UIDS set, omitting `--firebase-cli`.

The updated worker also processes authenticated account-deletion requests before notification
cycles and removes expired security receipts. Restart an existing process to load this change;
see [PRIVACY.md](PRIVACY.md). A failed deletion remains pending and is counted in the tick log
without stopping unrelated notification processing. Configure the public FIREBASE_STORAGE_BUCKET
identifier for checking account-owned uploads. This does not create a bucket or enable billing.

On first start the worker records a baseline of existing partners/offers/routes/bookings and sends no historical alerts. Subsequent app writes carry `notificationUpdatedAt: serverTimestamp()`. The worker queries that timestamp with a persisted cursor, compares authoritative statuses, writes inbox records, and dispatches pending pushes. Rapid changes between polls can coalesce into the latest status; this is polling, not a Firestore trigger. Direct Console writes without this timestamp are not picked up. A restart resumes the saved cursor. One worker lease prevents simultaneous senders.

It handles new partner/listing review requests, review status changes, and booking requests/status updates. Sample/demo records are excluded. Notification wording does not claim external aviation or tourism authority approval. Administrator recipients come from NOTIFICATION_ADMIN_UIDS and their current Auth claims are checked. Manual sends from the admin bell use an admin-only Firestore queue whose sender is reauthorized by the worker.

## Frontend setup

All three apps have a notification inbox, read/unread persistence, explicit Enable/Disable controls, foreground message handling, and notification-tap handling. Partner Settings switches use the same saved preference. The traveler inbox is under Profile → Notifications. The admin bell contains the inbox and a Send a notification form. Fake operational notifications have been removed.

### Browsers

In Firebase Console → Project settings → Cloud Messaging → Web Push certificates, generate a key pair. Only the **public VAPID key** belongs in frontend environment files:

- Both Expo apps: `EXPO_PUBLIC_FIREBASE_VAPID_KEY=PUBLIC_KEY`
- Admin: `VITE_FIREBASE_VAPID_KEY=PUBLIC_KEY`

Restart the frontend servers after adding it. Enable push from the signed-in app; permission is requested only after that action. `public/firebase-messaging-sw.js` receives background notifications and handles clicks inside its own app origin. Firebase client config and SDK version are passed to the worker in its registration URL; these are public client settings. The SDK scripts use the matching installed Firebase version. The sender sends notification payloads, so the service worker does not display duplicates.

Use HTTPS or localhost in a supported browser. An HTTP LAN URL is not a secure browser push origin. The supplied public VAPID key is configured in all three local frontend `.env` files. Restart the frontend servers after changing these files. Browser permission, token registration and delivery still need testing. Denying permission still leaves the Firestore inbox available.

### Android

Native Firebase Messaging dependencies and Expo plugins are installed. Native FCM auto-initialization is disabled until opt-in and disabled again when its token is removed. The two existing package IDs were registered with the Firebase project and matching client configurations downloaded to the app folders:

- Partner: `com.skyconnect.airline.partner`
- Traveler: `com.skyconnectsl.demo`

The generated `google-services.json` files are ignored by Git. `app.config.js` includes the native plugins when the configuration file is present, and declares notification permission. Keep the config available when building; remote builds must also receive this file (Git-ignored files may be excluded from EAS uploads).

With Android Studio/SDK configured, run `npx.cmd expo run:android` from each mobile app folder to create and install a native development build. Expo Go cannot load React Native Firebase Messaging. The existing email/password and Firestore inbox flows remain usable in Expo Go; the push control explains that a native build is needed. Grant Android notification permission when prompted. Physical-device/background/killed-state delivery has not been tested from this workspace.

### iOS

Client handlers are included, but native iOS push still needs each app registered in Firebase, its matching `GoogleService-Info.plist`, APNs credentials uploaded to Firebase, and Apple signing/provisioning. None of those Apple credentials are fabricated or generated by this change. The config enables remote-notification background mode and push entitlement when a plist is present. Check the entitlement against the actual signing profile. Build and test on a real iOS device using the required Apple setup.

## Ownership, retries and limits

- `users/{uid}/devices/{id}`: private per-account device tokens; clients write only their own registrations.
- `users/{uid}/settings/notifications`: per-app account push preferences.
- `users/{uid}/notifications/{id}`: worker-created inbox content and delivery state; the owner can read, delete, or change only read/readAt.
- `notificationRequests`: admins can queue bounded messages; only the backend processes them.
- `notificationWorker` and `notificationSourceState`: private worker cursors/status/lease; client access is denied.

Sign-out invalidates the platform token and removes the Firestore device binding before Firebase Auth sign-out. Permission prompts check that the same account is still signed in before registering. Token refresh updates only an opted-in account. Expired registrations are removed with update-time preconditions so a newly rotated token is preserved. Failed devices retry with capped exponential delay, up to six attempts; successful devices are skipped on retry. OS notification tags/collapse IDs reduce duplicates. A crash after FCM accepts a message can still cause a repeat; delivery is not exactly-once. Inbox IDs and source checkpoints are committed together.

With no opted-in devices, a notification remains in the inbox and is marked no-devices. Old inbox entries are not pushed retroactively when a device later opts in. The UI loads the latest 50 account notifications and filters them by app. Read state is preserved during concurrent delivery updates.

The idle worker performs approximately twelve Firestore document/query reads and one lease write per polling cycle, plus actual event/device/delivery work. These share the project's Spark quotas with the apps. Increase the polling interval if needed. No billing upgrade is automatic, and continuous availability is not provided by Spark itself.

## Verification

`npm.cmd test` covers notification recipient selection, historical baselines, repeated cycles, worker leases, partial retries, invalid token removal, concurrent read flags, disabled preferences and admin queue authorization. `npm.cmd run test:rules` verifies private tokens/inboxes and admin-only requests alongside the existing ownership tests. The FCM sender passed a live validate-only request with zero notifications delivered. This proves API/payload permission, not device delivery.

After a device is registered, use the admin bell's Send a notification form with its Auth UID and correct app. Keep the backend worker running. Confirm the inbox updates, foreground feedback appears, a background push arrives, tapping opens the inbox, disabling push stops delivery, and signing out/account switching does not expose another account's inbox.

References: [FCM pricing](https://firebase.google.com/pricing), [web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), [native messaging](https://rnfirebase.io/messaging/usage).

Live verification on 2026-10-18: the FCM/registration/installation APIs are enabled, billing remains disabled, notification rules match the tested local file, and the delivery index is READY. The worker baselined 32 existing source records with no historical alerts and completed a clean live cycle (zero new changes/requests/deliveries). It is not installed as an always-running service; use the command above. The FCM validate-only check sent zero messages. The public VAPID key is configured in all three local frontend environments. Browser token registration and delivery, Android device delivery and iOS/APNs delivery remain unverified.
