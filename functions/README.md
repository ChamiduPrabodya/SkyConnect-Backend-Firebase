# Cloud Functions backend (prepared locally; not deployed)

The live project remains on Spark. Firebase requires Blaze to deploy Cloud Functions.
The current worker remains the live sender until an explicit cutover. Installing or testing
this folder does not change billing, deploy functions, or change notification mode.

## Triggers

| Export | Event | Behavior |
| --- | --- | --- |
| onOfferCreated | offers/{id} created | Ensures Pending / verified:false and queues administrator review. |
| onRouteCreated | routes/{id} created | Ensures lowercase pending, matching existing apps/rules; queues administrator review. |
| onOfferUpdated / onRouteUpdated | Listing status changed | Notifies the owner; resubmissions notify administrators too. |
| onPartnerCreated / onPartnerUpdated | Partner status changes | Queues applications and notifies partners of review outcomes. |
| onBookingCreated / onBookingUpdated | Booking created/status changed | Notifies the traveler and assigned tourism/airline provider, including Confirmed and Cancelled. |
| onNotificationRequested | notificationRequests/{id} created | Rechecks the current admin claim and target account; creates an inbox record. |
| dispatchNotification | users/{uid}/notifications/{id} created | Delivers to opted-in FCM devices, removes expired bindings safely, and retries transient failures. |
| onUserCreated | Firebase Auth account created | Creates a default traveler profile and default settings only when missing. |
| requestAccountDeletion | Authenticated callable | Requires a recent sign-in and exact DELETE confirmation; queues only the caller's UID. |
| deleteAccountData | accountDeletionRequests/{uid} created | Removes associated records/media and the Auth account, in functions mode. |
| cleanupDeletionReceipts | Daily schedule | Deletes eligible minimal security receipts after their 24-hour hold. |

See [../PRIVACY.md](../PRIVACY.md) for consent, Spark-compatible deletion processing, data scope
and remaining publication requirements. The scheduled cloud cleanup uses Cloud Scheduler;
it is not enabled or deployed on the Spark project.

Firestore functions are second generation in asia-south1, matching the database region.
The Auth export uses the stable first-generation auth.user().onCreate API. The second-generation
onUserCreated API is currently preview; no Identity Platform blocking function is used.

All frontends share Firebase Authentication. The default users/{uid} profile is an account
baseline, not an administrator grant. Partner business profiles remain in partners/{uid}; admin
access still requires admin:true. The admin directory deduplicates partner UIDs. Traveler
registration uses a transaction so the trigger may run before or after its profile write.

## Local checks

From skyconnect-backend:

```powershell
npm.cmd --prefix functions ci
npm.cmd run functions:check
npm.cmd run test:functions
npm.cmd run test:triggers
npm.cmd run test:rules
```

Node.js 22 is the deployment runtime. Local Node.js 24 can run these checks but npm reports an
engine mismatch at installation. Use Node.js 22 to reproduce the deployment runtime. Java is
required by the Firestore emulator. Handler tests require a localhost emulator and hardcode
demo-skyconnect; they never use the production database. The trigger smoke test starts Auth,
Firestore and Functions together, creates disposable emulator accounts, and verifies the
actual exported triggers. Its runner supplies an emulator-only administrator UID.

To run the actual trigger emulators:

```powershell
npx.cmd firebase emulators:start --only auth,firestore,functions --project demo-skyconnect
```

For this isolated demo emulator, set notificationWorker/config to {mode:"functions"} using
the emulator Admin SDK. Functions are inactive until that document is set. The Functions
emulator FCM adapter is a no-send stub; it does not prove device delivery.

## Production cutover, after the owner enables Blaze

1. Copy functions/.env.example to functions/.env.skyconnect-sl-e4cdd and review administrator
   UIDs. These are public identifiers. The deployed runtime uses its Google-managed service
   account; no CLI token or service-account key is copied into functions.
2. Deploy the functions, explicitly selecting the project and codebase:

```powershell
npx.cmd firebase deploy --only functions:skyconnect --project skyconnect-sl-e4cdd
```

3. Let the existing worker drain its queue, pause app writes during cutover, then stop it with
   Ctrl+C. The mode command refuses to switch while the worker lease is active.
4. Preview and then activate the event-driven sender:

```powershell
node scripts/notification-mode.mjs skyconnect-sl-e4cdd functions
node scripts/notification-mode.mjs skyconnect-sl-e4cdd functions --apply
```

5. Resume writes and test new accounts, new listings, review outcomes, booking confirmation /
   cancellation, manual admin sends, token rotation and account separation. Verify foreground,
   background and notification-tap delivery on devices. Retire the laptop worker after these pass.

Existing records do not emit creation events at deployment. Old accounts are not backfilled;
old pending inbox/requests are not replayed automatically. Drain them before cutover and resolve
remaining records deliberately. Inactive functions acknowledge events without replaying them
on activation, so keep the write pause short and explicit.

Rollback requires care: switch mode to worker, wait at least three minutes for in-flight
Functions deliveries/leases to finish, and baseline/reconcile the worker cursors against the
current source statuses before restarting it. Old cursors can replay transitions already
handled by Functions. There is no automated rollback/backfill in this change.

## Delivery behavior and limits

Event markers and inbox records commit atomically. Concurrent deliveries use a lease, and
per-token results prevent retrying successful devices. Read flags and user preferences are
preserved. Delayed source events whose version has been superseded are skipped, so rapid
changes can coalesce to the latest state. Sample/demo records are excluded from review
notifications and status normalization.

Transient device failures use the platform event retry mechanism, up to six attempts; no
polling scheduler is required. OS collapse IDs reduce duplicates, but a crash after FCM accepts
a message and before its result is saved can repeat a push. FCM acceptance does not guarantee
display, and a token revoked immediately after the final check can receive an in-flight message.

notificationEvents is private deduplication state and grows with events. Choose retention/TTL
before production cleanup, retaining markers for at least the platform retry window. No TTL
cleanup is automatically enabled. These functions do not implement pricing verification,
payments, inventory reservation, or external aviation/tourism verification.

Official references:
- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/functions/firestore-events
- https://firebase.google.com/docs/functions/1st-gen/auth-events
- https://firebase.google.com/docs/functions/auth-events

## Verification on 2026-10-18

The combined local emulator run passed 39 tests: 16 Functions handler tests, 15 existing backend
data/worker tests, and 8 security-rule tests, with no skips. The actual exported Auth/Firestore
trigger smoke test also passed (profile defaults, offer review, booking creation/confirmation/
cancellation and inbox dispatch). The updated traveler suite passed 20 tests. Traveler and
admin web builds passed. Checks ran on the installed Node.js 24 host; deployment is configured
for Node.js 22 and has not been performed. No production data was changed or real pushes sent.
