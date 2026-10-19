# Trip visibility and provider requests

Saved plans appear in the admin web under **Trips & bookings → Saved plans**.
Saving a plan does not send traveler information to providers. Plans remain in
`users/{uid}/savedPlans` and can be read only by their traveler and administrators.

After **Request booking**, the traveler app creates a separate `bookings` document
for every selected provider service in a single batch. Related requests share a
`tripGroupId`. Flight requests use the owning partner's Firebase UID as `airlineId`;
stays, cabanas, activities and packages use `partnerId`. Display names never decide
ownership, so two businesses with the same name remain separate.

Administrators can open every request under **Trips & bookings → Booking requests**.
Airlines open **Bookings**; tourism providers open **Bookings** from their dashboard.
Tourism bookings include stays/cabanas, activities and packages, even when the
original listing has subsequently been removed. Each provider sees only its own
requests and can open traveler contact details, dates, party size, its selected
listing, requested pricing and trip context. Status changes update the same
Firestore document and flow back to the traveler and admin listeners.

New saved plans capture the traveler, named route, itinerary, estimate and selected
service details. New requests retain their own service's listing and price snapshot,
plus traveler contact information, adults/children/infants, room/night quantities,
trip dates and itinerary. Other services' snapshots and the overall trip estimate
are omitted from provider requests. Stay and flight totals match the traveler
estimate; selected partner tours are included in that estimate. Requested amounts
do not indicate payment. Flexible dates are displayed as awaiting agreement.

Older records remain viewable. When they have no listing snapshot, the UI identifies
any fallback to the current catalog; historical details that were never stored
cannot be reconstructed.

Firestore rules already restrict saved plans to owners/admins and booking reads to
the traveler, assigned provider or admin. Provider queries filter by the current
account's UID, and the detail screen rechecks ownership before opening an ID.

Validation:

- Traveler app: `npm test` and `expo export --platform web`.
- Partner app: `node --test tests/airline-account.test.cjs` and `expo export --platform web`.
- Admin web: `npm run build`.
- Backend: `npm run test:rules` tests saved-plan privacy, assigned-provider reads,
  denial of other providers' direct reads and unscoped queries, and admin visibility
  against the Firestore emulator.
