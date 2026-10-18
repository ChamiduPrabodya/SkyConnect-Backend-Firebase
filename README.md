# SkyConnect Firestore backend

This folder is separate from the three frontend projects. It owns the database rules, indexes, Storage media rules, migration data/assets, administrator provisioning, and the Spark-compatible FCM notification worker. See [NOTIFICATIONS.md](NOTIFICATIONS.md) for sender setup and remaining device configuration/testing. It does not implement Cloud Functions, recommendation APIs, Hosting, Analytics, Crashlytics, payment processing, or inventory guarantees.

## What changed

The apps load business/catalog datasets from Firestore. `seed/source/` preserves the retired frontend dataset sources for provenance only; the apps never import them. `seed/catalog.json` is the migration input. `seed/assets/` preserves 219 referenced catalog media files. The full-media seed uploads images to Storage and stores HTTPS references. The no-image seed stores empty image fields/lists instead and does not need a bucket. Sample business records retain `isSample: true`; moving them to Firebase does not verify their accuracy or create real provider Auth accounts. Other retired samples are private archives in `legacySamples`, rather than fabricated live bookings or authenticated profiles.

## Database layout

| Collection | Data / access |
| --- | --- |
| destinations | Published destinations with embedded activity records, stable activity IDs, coordinates, images and planning metadata |
| offers | Partner-owned stays and tours; Pending on submission/edit, Published by an admin |
| packages | Admin-managed bundles linked to a partner, destination IDs, prices and inclusions |
| routes | Airline-owned routes; edits return to pending; admin approval publishes them |
| flights | Migrated sample flight inventory; new airline inventory comes from approved routes |
| partners | Auth UID as document ID; pending registration; admin-owned approval and verified fields |
| users | Auth UID as document ID; traveler profile |
| users/{uid}/settings/preferences | Private currency, interests, notification preference and theme |
| users/{uid}/savedPlans | Private saved trip snapshots |
| users/{uid}/likes | Private liked item IDs/types; admin can aggregate |
| bookings | One provider-owned request per selected hotel/package/flight/tour; grouped by tripGroupId and queried by userId, partnerId or airlineId |
| referenceData | Shared airport/country/interest/template/road-connection and partner reference lists |
| legacySamples | Admin-only archives of retired partner/admin sample datasets |

Bookings start Pending. Only the assigned provider or administrator can confirm a request; the traveler may cancel. requestedPriceLKR is a client estimate, never a verified charge. Separate requests in a trip can have different statuses. No payment or automatic stock reservation occurs. Existing manual ISO date strings remain supported. The old shared-device `@skyconnect/demo-v2` storage key is preserved. Its saved plans/preferences have no account ownership metadata and are not silently assigned to whichever account signs in next. Existing legacy records that lack provider ownership or publication status require a deliberate migration; rules do not grant access based on an email match.

## Preview and validate (no live writes)

```powershell
npm.cmd ci
npm.cmd run seed:preview
npm.cmd test
npm.cmd run test:rules
```

The rule tests start a local demo-project Firestore emulator. They never connect to the production Firebase project. Java is required. Generic `npm test` skips rule tests when the emulator is absent; `test:rules` runs them explicitly.

## Reference data without Storage

The ten `referenceData` documents have no bundled-image dependencies and can be migrated independently. This path uses the existing Firebase CLI login through the Firestore REST API; it does not need an Admin SDK credential file or a Storage bucket.

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'skyconnect-sl-e4cdd'
npm.cmd run seed:references:preview
npm.cmd run seed:references
```

The script creates documents only, reads each back, and checks its ID/items against the seed. Reruns preserve existing documents; conflicting values cause an error for manual review. No other collections or images are uploaded. Publishing `referenceData/partnerReference` removes the partner app's missing-reference-data startup blocker. The traveler also needs published destinations; these can be loaded without images through the no-image migration below.

## Catalog migration without images

To migrate the remaining catalog now, without a Storage bucket or image host:

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'skyconnect-sl-e4cdd'
npm.cmd run seed:no-images:preview
node scripts/seed-without-images.mjs --check-live
npm.cmd run seed:no-images
```

This uses your Firebase CLI login. It prepares 50 documents: 28 destinations (187 embedded activities), five packages, six flights, three offers, four sample partners, and four admin-only legacy archives. It clears image/logo fields and image lists recursively while preserving locations, descriptions, prices, IDs and relationships. The ten reference documents already migrated are unchanged. Original photos/manifests stay in `seed/` for later use; no photo files are uploaded and billing is not changed.

Existing target IDs are read first and preserved. All missing documents are committed atomically with `exists: false` preconditions, then read back and verified. Any existing content that differs from the seed is reported for review. The frontend displays neutral placeholders for omitted catalog photos, and listing forms allow photos to be added later. The original full-media seed is create-only too: it will not backfill photos into existing image-free records. Add hosted image URLs through the admin editor or implement a deliberate media backfill when a host is available.

## Live migration and deployment

The seed requires a project-owner-approved Application Default Credential (GOOGLE_APPLICATION_CREDENTIALS pointing to a protected credential file, or gcloud application-default login). Administrator provisioning also supports your existing Firebase CLI login with `npm.cmd run admin -- AUTH_UID --firebase-cli`. Do not copy credentials into any frontend or this repository. Firebase CLI login alone does not authenticate the seed's Admin SDK.

1. Confirm the intended project, correct web app configuration and Storage bucket in Firebase Console. Email/password Auth must be enabled. Confirm at least one real administrator Auth UID and provision it with the script below.
2. Preview `seed/catalog.json`. Sample records remain samples after migration. The seed uses create-only writes and preserves every existing document, so inspect existing conflicting IDs/statuses before launch. The migration is restartable; an error can leave earlier records uploaded.
3. Set the project and bucket explicitly, then apply:

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'skyconnect-sl-e4cdd'
$env:FIREBASE_STORAGE_BUCKET = 'skyconnect-sl-e4cdd.firebasestorage.app'
npm.cmd run seed:preview
npm.cmd run seed
npm.cmd run admin -- YOUR_REAL_ADMIN_AUTH_UID
npx.cmd firebase login
npx.cmd firebase deploy --only firestore,storage --project skyconnect-sl-e4cdd
```

The seed uploads public catalog photos using Firebase download-token URLs, without changing bucket ACLs. You may instead set SEED_ASSET_BASE_URL to an existing HTTPS host containing the hashed assets. Emulator seeds use placeholder image URLs and are intended for data/rules tests only.

4. Configure each mobile app from its `.env.example`; the local `.env` values were aligned with the existing admin Firebase configuration. Check those values against Console before a live launch. Admin reads VITE_FIREBASE_* variables. Restart Expo/Vite after environment changes.
5. Sign the administrator out and in after setting the custom claim. Verify admin creates/publishes a destination, package and partner offer; traveler sees them in list/details/planner; two traveler accounts cannot read each other's saved plans/preferences/likes; partner sees only its requests; confirm/cancel propagates across apps.

Do not label the production migration complete until the seed, rules deployment, admin provisioning, and this connected-account verification have succeeded.

Live check on 2026-10-17: `skyconnect-sl-e4cdd` has an existing Firestore database in `asia-south1`. Administrator UID `yKHbjIEb4mQRhW2ylXgPqU8G5JG2` was granted and verified with the `admin: true` custom claim; the earlier administrator also retains access. The account owner confirmed Email/Password is enabled. All five emulator security-rule tests passed before Firestore rules/index deployment; the released rule source was read back and matches the local file. Both collection-group indexes (`likes.createdAt` and `savedPlans.savedAt`) were subsequently verified READY in the live project. The previous live rules/index settings are backed up under the ignored `backups.local/` directory; `node scripts/backup-firestore.mjs PROJECT_ID` captures another snapshot using your CLI login. Connected account/UI testing remains pending.

Reference migration on 2026-10-17: all ten `referenceData` documents were created in `skyconnect-sl-e4cdd` and read back with their contents verified against the seed. This includes the partner startup reference, traveler planning templates, airports, phone-country lists, interests, road connections, property/activity categories and vibe options. No other seed collections or image files were uploaded in this step.

No-image migration on 2026-10-17: the remaining 50 documents were created atomically in `skyconnect-sl-e4cdd` and read back with their image-free contents verified. This added 28 destinations with 187 embedded activities, five packages, six flights, three offers, four sample partners, and four admin-only legacy archives. No target IDs conflicted with existing records. Together with the ten reference documents, all 60 prepared seed documents are now present; photos remain omitted. Eight backend data/migration tests and all three updated frontend web builds passed. Connected account/UI tests remain pending.

At the last Storage check, the project had no Storage bucket and billing was disabled; enabling a billing plan is an account-owner decision. The 219 image files have not been uploaded and remain preserved locally. A configured Storage bucket name in the web app configuration does not mean the bucket exists. Existing non-seed records without the required publication status or ownership fields require deliberate migration; the no-image seed preserves them unchanged.

## Local emulator app configuration

`EXPO_PUBLIC_FIREBASE_USE_EMULATORS=true` connects a mobile app to Auth 9099, Firestore 8080 and Storage 9199. Set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST to the computer's LAN address on a physical phone. Admin supports VITE_FIREBASE_USE_EMULATORS and VITE_FIREBASE_EMULATOR_HOST. Use a demo project configuration for emulator work. Start the corresponding emulators before opening the apps.
