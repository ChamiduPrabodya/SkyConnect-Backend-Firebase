# Consent and account deletion

Implemented on 2026-10-18. The referenced project PDF was not present in the workspace;
implementation follows the requirements supplied in chat and the official sources below.
These are technical controls, not a certification of legal or store-policy compliance.

## Consent

Traveler, tourism-partner and airline-partner registration each requires an unchecked,
explicit purpose-specific privacy checkbox, separate from existing terms/licensing checks.
The privacy notice can be read before registration. Authentication failure or an unchecked
privacy choice cannot create a synthetic consent record.

The current consent is written atomically with the profile and an append-only receipt:

```text
users/{uid}.pdpaConsent                       traveler
partners/{uid}.pdpaConsent                    partner
users/{uid}/consents/{randomId}               immutable receipt
```

The fields are agreed:true, timestamp:serverTimestamp(), version:"1.0", scopes:[...].
Traveler scopes are travel_preferences and location_matching; partner scopes are
partner_profile and location_matching. A pdpaConsentRecordId links the profile to the receipt.
Firestore stores a Timestamp; use toDate().toISOString() for the example's JSON/ISO format.
Rules verify server time, supported version/scopes, receipt equality and ownership.
Administrators cannot fabricate consent for another account. Old accounts and Auth-trigger
baselines are not automatically marked agreed. Existing users can explicitly record current
consent from the privacy screen. Partner consent is not treated as travel-preference consent.

This version records grants and preserves their history. A complete purpose-withdrawal flow
that stops every affected processing operation is not implemented by this registration change;
the controller must define and provide that process before claiming full PDPA compliance.

## Account deletion experience

- Traveler: Profile -> Privacy & account deletion.
- Partner: Settings -> Privacy & account deletion (airline and tourism).
- Web: /delete-account in the admin frontend; this route bypasses the admin-only dashboard
  gate and accepts an ordinary account. It does not require reinstalling the mobile app.

The user re-enters the password and types DELETE. The client reauthenticates and submits
accountDeletionRequests/{authenticatedUid}, with status:pending, requestedAt:serverTimestamp()
and authTime from the refreshed ID token. Rules allow only the same UID with auth_time within
five minutes. Clients cannot mark a job completed or choose a different target. The client
reports acceptance, not completed deletion, and attempts local cache cleanup/sign-out.

All three apps share the Firebase Auth account. The confirmation explains that deletion removes
associated records across them. Only email/password sign-in is exposed by these apps. Add the
corresponding provider reauthentication flow before exposing federated sign-in in the apps.

## Trusted backend behavior

Both the Spark worker and the prepared Functions package use the same deletion processor.
It disables the account and revokes refresh tokens first, then removes:

- The complete users/{uid} tree, including likes, savedPlans, devices, notifications, settings,
  consent history and any nested/orphaned subcollections.
- partners/{uid} and its subcollections.
- Bookings linked by userId, partnerId or airlineId, including embedded traveler contact details.
- Owned offers, routes, packages and flights; related inbox messages, queued messages and
  source/event tracking records. Other accounts and unrelated bookings/listings are preserved.
- Storage objects, including object generations, under partners/{uid}/ and users/{uid}/.
- Firebase Auth, only after data/media cleanup succeeds, followed by a defensive profile sweep.

Failures keep the request pending and the account blocked. Retries resume idempotently;
they never claim completion after a permissions/storage failure. Leases prevent two erasers
processing one account concurrently. Auth/source/notification handlers check deletion state
and cannot recreate the deleted user's profile/inbox from delayed events. Superseded worker
cursors are scrubbed where they refer to removed source documents.

A minimal private security receipt remains at accountDeletionRequests/{uid}, containing only
status, completedAt and expiresAt. It blocks still-valid old ID tokens from recreating data.
No name, email, preferences, consent, device token or booking data remains in that receipt.
It becomes eligible for deletion after 24 hours. The Spark worker purges eligible receipts
while running; the cloud alternative uses a daily scheduled function. Actual purge time depends
on uptime, scheduler delivery and retries, so it can be later than 24 hours.

Copies downloaded to another device, independently held by providers, imported legacy records
without trustworthy UID links, third-party image URLs, backups and any cloud-provider retention
policies require separate controller review/handling. A missing Storage bucket is treated as
no live uploaded objects; access-denied responses remain failures. Storage rules also block
new account uploads during deletion, and must be deployed before enabling real uploads.

## Spark operation

The updated worker processes deletion jobs before notification cycles. Keep it running:

```powershell
cd "C:\Users\User\Documents\SkyConnect\skyconnect-backend"
npm.cmd run notifications:worker
```

Restart an already-running worker to load this implementation. The ignored local backend
environment now includes the public FIREBASE_STORAGE_BUCKET identifier matching the apps.
It is used to check/remove account-owned uploads, not to create a bucket or enable billing.
If the worker is stopped, requests remain pending. Deletion processing is not an always-on
managed service on Spark. The frontend needs the updated Firestore rules and the two added
collection-group indexes (notifications.uid and notifications.sourceId).

## Cloud alternative

The Functions package additionally exports:

- requestAccountDeletion: authenticated callable; validates recent auth and exact confirmation.
- deleteAccountData: request-created trigger; processes jobs in functions mode.
- cleanupDeletionReceipts: daily scheduled cleanup of expired security receipts.

These remain undeployed. Cloud Functions and the cloud scheduler require the separately
approved Blaze deployment/cutover described in functions/README.md. Do not enable both senders.
The frontend queue works with either backend mode; no client service-account key is used.

## Publication and policy status

The /delete-account route is local application code, not yet a published HTTPS deletion URL.
Publish the frontend and enter its real deletion URL in Play Console's Data safety form.
Also finish controller identity/contact, retention, processor/cross-border and withdrawal
disclosures, then assess the full applicable legal/store requirements. No legal deadline or
blanket compliance claim is embedded in app code.

The claimed March 18, 2025 commencement date was amended. Official Gazette 2498/16 dated
July 22, 2026 appoints January 1, 2027 for Sections 2 and 3 and Parts I and III. This is not a
statement that every part of the Act has the same commencement date.

Official sources:
- https://dpa.gov.lk/Gazet/2498-16_E.pdf
- https://documents.gov.lk/view/extra-gazettes/2025/3/2427-34_E.pdf
- https://dpa.gov.lk/guidelines.php
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://firebase.google.com/docs/storage/security/rules-conditions

Local verification uses only disposable demo-skyconnect accounts/data. The full trigger smoke
test verifies real emulator Auth deletion and removal of a profile, likes, plans and devices.
Production account deletion has not been exercised against anyone's real account.
