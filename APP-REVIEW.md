# App connection review - 2026-10-18

Scope: running-server availability, current source contracts and the Cloud Functions integration.
This is not a completed real-device / multi-account acceptance test or a full security audit.

## Confirmed

- Partner (localhost:8081), traveler (localhost:8082) and admin (localhost:5173) returned HTTP 200.
- Running Node processes included both Expo servers, Vite and the notification worker.
- All three local frontend configurations and the worker target skyconnect-sl-e4cdd.
- A partner airline dashboard was observable in a pending account session. Full browser
  interaction was limited by the available Windows automation surface; no bookings, approvals,
  messages or production account changes were submitted for this review.
- Offers use Pending/Published; partners use Pending/Approved; routes use pending/approved.
  The new Functions code preserves these case-sensitive contracts.

## Addressed in the Functions integration

- Traveler registration no longer overwrites a profile concurrently created by an Auth trigger.
  It transactionally creates the profile or updates only owner-editable fields.
- The admin directory excludes duplicate generic user entries whose UID already has a partner
  business profile. Auth provisioning is shared across the three apps.
- A backend-only mode switch prevents the updated Spark worker from processing while
  Cloud Functions mode is active. Deployment/activation has not been performed.

## Remaining mismatches / limits

1. Booking amount fields and labels differ. Traveler bookingService.js writes requestedPriceLKR;
   partner airline stats/booking totals read totalPrice, and tourism revenue/widgets also read
   totalAmount/totalPrice. Individual airline booking cards already fall back to requestedPriceLKR.
   Result: some totals can stay zero while an individual request shows an estimate. Resolve by
   separating requested estimates from provider-confirmed amounts and recorded payments; do
   not relabel client estimates as collected revenue. No payment backend currently exists.
2. Currency conversion is fixed at 300 in partner offer writes and traveler route normalization.
   This is an estimate convention, not a fetched exchange rate. Currency labels/priceCurrency
   should be validated consistently before supporting other input currencies.
3. Traveler booking validation checks for provider IDs in loaded items, but an ID alone does
   not prove that a provider has a real active Auth account. Retired sample providers retain
   sample flags and sample status changes are excluded from notifications. Seed data is not
   verified supplier inventory.
4. Auth and listing/booking features run through Firebase, but notification processing still
   depends on the local worker while the project remains on Spark. Cloud Functions code is
   prepared locally and requires Blaze deployment plus deliberate sender cutover.
5. Catalog photos are deliberately omitted. The 219 preserved images remain local and a bucket
   has not been provisioned. Browser VAPID configuration alone does not prove device delivery;
   native FCM requires an installed development/native build rather than Expo Go.

Next acceptance checks: two traveler accounts with private saved plans/likes/settings; partner
offer and airline-route review through admin; traveler request -> provider confirmation ->
traveler cancellation; notification enable/disable, background delivery, taps and account switching.
These require signed-in test sessions and device observation; server availability alone does
not establish that every screen and permission flow works.

## Local validation

39 backend/Functions/rules tests and 20 traveler tests passed, as did the actual exported
Auth/Firestore trigger smoke test in demo-skyconnect. Updated traveler/admin web builds passed.
Functions are prepared, tested locally and not deployed. No production booking, approval,
notification or billing changes were made by this review.
