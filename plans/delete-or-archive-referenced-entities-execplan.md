# Delete Or Archive Referenced Entities

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. Any contributor who changes this plan must keep it self-contained and update the living sections before stopping.

## Purpose / Big Picture

BracketIQ currently lets users delete important records such as events, fields, rental slots, teams, and products. Many of those records are referenced by bills, bill payments, refund requests, signed documents, rental bookings, registrations, matches, schedules, and reporting views. Because the database stores most relationships as plain string IDs instead of enforced foreign keys, a hard delete can erase the local context needed to understand money movement, refunds, historical schedules, and support cases.

After this work, destructive actions will make a server-side policy decision. If a record has no durable references, the route may hard delete it. If a record has durable references, the route will archive, deactivate, or cancel it instead. A user can still clean up drafts and mistaken records, but BracketIQ will preserve financial and historical records whenever a deletion would otherwise break traceability.

The first visible result is that deleting a paid or historically referenced event no longer removes its bills, payments, refund requests, signed documents, registrations, or related audit context. The response will state that the event was archived, and default public/search/list views will hide it from normal use.

## Progress

- [x] (2026-06-29) Audited the current high-risk delete paths for events, fields, time slots, teams, products, and participant registrations.
- [x] (2026-06-29) Drafted this ExecPlan with a staged implementation sequence and validation strategy.
- [x] (2026-06-29) Add schema fields and migrations for archive metadata on events, fields, time slots, canonical teams, and event teams.
- [x] (2026-06-29) Add a shared server-side delete-or-archive policy module with event reference checks.
- [x] (2026-06-29) Implement the event and participant-registration milestone first, preserving billing and audit records. Event DELETE now routes through the policy module, self/child participant removal cancels registration rows, archived events are filtered from main event search/list and public organization event surfaces, focused route/catalog tests pass, Prisma Client was regenerated, and TypeScript passes.
- [x] (2026-06-29) Implement field and time-slot archive handling for rentals, schedules, bookings, and resource pickers. Field DELETE now archives referenced fields, time-slot DELETE archives referenced slots, unused rental slots are removed from `Fields.rentalSlotIds` before hard delete, and default field/time-slot lists hide archived rows.
- [x] (2026-06-29) Implement team archive handling. Canonical team and event-team DELETE now archive referenced teams and hard-delete only unreferenced teams. Team memberships/staff assignments are marked removed/cancelled on archive, team chat groups are archived rather than deleted, and default team list helpers hide archived teams.
- [x] (2026-06-29) Implement product deactivation handling. Product DELETE now deactivates referenced products and hard-deletes only unreferenced products; product lists hide inactive products by default while allowing `includeInactive`.
- [ ] Finish default list/search/public query updates for any remaining archived entity surfaces while keeping finance and history views able to resolve them.
- [x] (2026-06-29) Update core client copy so users see whether a record was deleted, archived, or deactivated. Event, team, product, and rental-slot deletion confirmations no longer promise irreversible deletion when history may force archive/deactivation. Product and team success messages now reflect deactivation/archive outcomes.
- [x] (2026-06-29) Update core client services to treat archive/deactivation as successful removal from active UI while preserving backward compatibility with older empty DELETE responses.
- [ ] Add focused Jest coverage and run TypeScript validation.

## Surprises & Discoveries

- Observation: The event delete route already attempts to refund or cancel Stripe payment intents before deleting local data, but after that it deletes the local bills and bill payments.
  Evidence: `src/app/api/events/[eventId]/route.ts` has `settleEventBillingBeforeDelete(...)`, then later deletes `billPayments` and `bills` inside the same DELETE flow.

- Observation: Participant removal is inconsistent. Team participant removal marks event registration rows `CANCELLED`, while self or child participant removal hard-deletes matching `EventRegistrations` rows.
  Evidence: `src/server/events/eventRegistrations.ts` updates status to `CANCELLED`; `src/app/api/events/[eventId]/participants/route.ts` uses `eventRegistrations.deleteMany(...)` for self and child removal.

- Observation: Product records already have an `isActive` field, so product deletion can become deactivation with minimal schema work.
  Evidence: `Products.isActive` exists in `prisma/schema.prisma`.

- Observation: Facility records already have a `status` field, but fields and time slots do not have archive metadata yet.
  Evidence: `Facilities.status` exists in `prisma/schema.prisma`; `Fields` and `TimeSlots` have no archive or status fields.

- Observation: `Fields.rentalSlotIds` behaves like field-owned availability membership rather than financial history.
  Evidence: Time-slot DELETE now removes an unused slot ID from `Fields.rentalSlotIds` before hard-deleting the slot, while rental bookings, bills, events, and staff schedule assignments still force archive.

## Decision Log

- Decision: Treat archive state as separate from event publication state.
  Rationale: `Events.state` currently describes whether an event is published, unpublished, private, or a template. Archive status answers a different question: whether the row should remain available for normal use. Keeping `archivedAt` separate preserves the original lifecycle state for historical context.
  Date/Author: 2026-06-29 / Codex

- Decision: Start with event deletion and participant registration deletion before fields, teams, time slots, or products.
  Rationale: Event deletion is the largest financial risk because it currently removes bills, bill payments, refund requests, signed documents, payment intents, registrations, matches, time slots, local fields, teams, and the event itself. Participant registration deletion also directly affects bill provenance through `Bills.sourceType = EVENT_REGISTRATION` and `Bills.sourceId`.
  Date/Author: 2026-06-29 / Codex

- Decision: Keep the existing HTTP DELETE routes for compatibility, but change their behavior and response shape.
  Rationale: Existing clients already call DELETE. Keeping the route avoids a coordinated client migration while still letting the server return whether it hard-deleted or archived the row.
  Date/Author: 2026-06-29 / Codex

- Decision: Do not delete bills, bill payments, bill payment proofs, refund requests, or signed documents as a side effect of deleting a parent entity.
  Rationale: These records are financial or compliance history. They should be voided, cancelled, refunded, or preserved, but not removed merely because the parent event, team, field, or slot is being retired.
  Date/Author: 2026-06-29 / Codex

- Decision: Treat product delete as deactivation when direct product references exist.
  Rationale: The `Products` model already has `isActive`, and subscriptions, discount redemptions, reservations, and purchase history should keep resolving the product row. Deactivation removes the product from normal active grids without losing history.
  Date/Author: 2026-06-29 / Codex

## Outcomes & Retrospective

Milestone update 2026-06-29: The first event-focused implementation slice is complete. The schema and migration now add archive metadata to events, fields, time slots, canonical teams, and event team snapshots. Event DELETE archives referenced events and preserves local billing/audit rows. Self and child participant removal now marks event registrations `CANCELLED` instead of deleting them. Default event search/list and public organization event queries exclude archived events. Remaining work covers fields/time slots, teams, products, broader client copy, and any additional historical/finance query refinements.

Milestone update 2026-06-29: The field/time-slot/product slice is complete. Field DELETE archives when events, time slots, rental booking items, staff schedule assignments, or event officials reference the field; otherwise it hard-deletes. Time-slot DELETE archives when events, bills/payments/proofs, rental booking items, or staff schedule assignments reference the slot; otherwise it removes the slot from field rental availability arrays and hard-deletes. Product DELETE deactivates products with subscriptions or discount purchase references. Focused field, time-slot, product, event-delete, and participant route tests pass; Prisma validation and TypeScript pass.

Milestone update 2026-06-29: The team archive slice is complete. Canonical team DELETE archives referenced teams when memberships, staff assignments, join requests, event-team snapshots, bills, documents, discounts, event registrations, or chat groups exist; otherwise it hard-deletes. Event-team DELETE archives referenced event snapshots when matches, registrations, bills, refunds, documents, staff assignments, event/division links, or chat groups exist; otherwise it hard-deletes. Team chat is archived on team archive and only deleted on true hard delete. `teamService.deleteTeam`, `eventService.deleteEvent`, and `productService.deleteProduct` now treat archive/deactivation response flags as successful active-UI removal. Focused team route, team service, product route, and event delete tests pass; Prisma validation and TypeScript pass.

Milestone update 2026-06-29: The core client handoff slice is complete. Added shared client delete-outcome helpers and result-returning service methods for events, teams, products, and rental-slot deletion while preserving existing boolean wrappers. Event schedule confirmations, team delete modal copy, product delete confirmation/toast, and rental-slot delete confirmation now describe archive/deactivation behavior. Focused route/service regression tests pass and TypeScript passes.

## Context and Orientation

The application is a TypeScript Next.js App Router project backed by Prisma and Postgres. The Prisma schema is in `prisma/schema.prisma`. API routes live under `src/app/api`. Shared server utilities live under `src/server` and shared client services live under `src/lib`.

This repository intentionally stores many associations as raw string IDs or arrays of IDs instead of Prisma relations. For example, `Events.fieldIds` and `Events.timeSlotIds` are string arrays, `Matches.fieldId`, `Matches.team1Id`, and `Matches.team2Id` are nullable strings, `Bills.eventId`, `Bills.ownerId`, `Bills.sourceId`, and `BillPayments.billId` are plain strings, and `RentalBookingItems.fieldId` and `RentalBookingItems.eventTimeSlotId` are plain strings. A plain string reference does not make the database reject deletes. The application must check references before deleting.

Important models in `prisma/schema.prisma`:

- `Events` stores event configuration and schedule links. It currently has `state`, `fieldIds`, `timeSlotIds`, `organizationId`, and other operational fields, but no archive metadata.
- `Fields` stores courts, fields, or resources. It has `rentalSlotIds`, `organizationId`, and `facilityId`, but no archive metadata.
- `TimeSlots` stores event schedules and rental availability slots. It has `scheduledFieldId`, `scheduledFieldIds`, `sourceType`, `rentalBookingId`, `rentalBookingItemId`, and `rentalLocked`, but no archive metadata.
- `Teams` is mapped to the database table `EventTeams` and stores event team snapshots. `CanonicalTeams` is mapped to the database table `Teams` and stores reusable organization or user teams.
- `Bills` stores local billing obligations. Its `ownerType` and `ownerId` identify who owes the bill. Its `eventId`, `slotId`, `occurrenceDate`, `sourceType`, and `sourceId` connect the bill to a registration, rental, team, or event context.
- `BillPayments` stores scheduled or completed payment rows for a bill. It can hold Stripe payment intent IDs, tax IDs, paid amounts, refunded amounts, and fee information.
- `BillPaymentProofs` stores manual payment proof files and references both `billId` and `billPaymentId`.
- `RentalBookings` and `RentalBookingItems` store facility rental reservations and references to fields, events, time slots, bills, and payment intents.
- `EventRegistrations` stores event registration rows. It has a status enum that already includes `CANCELLED`.
- `Products` stores organization products and already has `isActive`.
- `Facilities` already has a `status` field. For facilities, archiving can use `status = ARCHIVED` if the app supports that value consistently.

Important current delete paths:

- `src/app/api/events/[eventId]/route.ts` has the event DELETE route. It currently settles billing externally, then deletes many local records including bills and bill payments.
- `src/app/api/fields/[id]/route.ts` hard-deletes fields.
- `src/app/api/time-slots/[id]/route.ts` hard-deletes time slots.
- `src/app/api/teams/[id]/route.ts` hard-deletes canonical teams or event teams after limited cleanup.
- `src/app/api/products/[id]/route.ts` hard-deletes products.
- `src/app/api/events/[eventId]/participants/route.ts` hard-deletes self and child event registrations on removal.
- `src/server/events/eventRegistrations.ts` already has a safer cancellation helper for event registrations.

In this plan, "hard delete" means removing a row from the database. "Archive" means keeping the row but setting archive metadata so default operational views hide it. "Deactivate" means keeping the row and changing an existing active flag, such as `Products.isActive = false`. "Durable reference" means any row that should preserve history, money movement, user participation, legal/compliance context, or schedule history.

## Plan of Work

Milestone 1 adds archive metadata and a reference policy module without changing behavior yet. Add a Prisma migration that introduces nullable archive fields to `Events`, `Fields`, `TimeSlots`, `Teams`, and `CanonicalTeams`: `archivedAt DateTime?`, `archivedByUserId String?`, and `archiveReason String?`. Add indexes on `archivedAt` and on common owner/list filters where needed, such as `Events(organizationId, archivedAt)`, `Fields(organizationId, archivedAt)`, and `CanonicalTeams(organizationId, archivedAt)`. Regenerate Prisma Client after the migration.

Create `src/server/deletion/archivePolicy.ts`. This module should contain a shared response type:

    export type DeleteOrArchiveAction = 'deleted' | 'archived' | 'deactivated';

    export type DeleteOrArchiveReference = {
      type: string;
      count: number;
    };

    export type DeleteOrArchiveResult = {
      action: DeleteOrArchiveAction;
      entityType: 'event' | 'field' | 'timeSlot' | 'team' | 'product';
      entityId: string;
      references: DeleteOrArchiveReference[];
    };

Also add helpers that count references for each entity. Keep the helpers explicit rather than magical. For example, `countEventReferences(client, eventId)` should count bills, bill payments through bills, bill payment proofs, refund requests, signed documents, rental bookings, rental booking items, event registrations, non-empty matches, staff assignments, and child events. The first version can count more references than strictly necessary. It is safer to archive when in doubt.

Milestone 2 changes event deletion and participant deletion. In `src/app/api/events/[eventId]/route.ts`, replace the current destructive event DELETE transaction with a call to `deleteOrArchiveEvent(...)`. The function should first check permissions in the existing route, then use the policy module. If the event has no durable references and is a draft, unpublished event, private unpublished event, template, or otherwise safe cleanup record, it may hard-delete. If any durable references exist, it must archive the event and preserve bills, payments, proofs, refund requests, signed documents, registrations, rental bookings, and historical matches.

The event archive path may still cancel open non-paid local obligations if that is a deliberate event cancellation behavior, but it must not remove their rows. Use existing statuses where possible: `Bills.status = CANCELLED` for unpaid bills that should no longer be collected, `BillPayments.status = VOID` for unpaid scheduled payments, and `EventRegistrations.status = CANCELLED` for active registration rows that should no longer count. Do not change paid bills to cancelled without preserving paid/refunded amounts and refund history. Do not issue external refunds merely because the row is archived unless the user is using a cancellation/refund flow that explicitly requests refunds.

In `src/app/api/events/[eventId]/participants/route.ts`, replace the self/child `eventRegistrations.deleteMany(...)` removal path with status updates to `CANCELLED`, matching the existing team removal behavior. Preserve `EventRegistrations.id` so any bill with `sourceType = EVENT_REGISTRATION` and `sourceId = registration.id` still resolves.

Milestone 3 updates queries so archived events disappear from normal operational views. Search and list routes should default to `archivedAt: null`. Historical, finance, and support views that resolve bills, payments, refunds, signed documents, or rental bookings must still be able to load archived events by ID. Update at least the public/search/discover event routes, organization event lists, schedule entry points, and any dashboard event list that is meant for active operations. If a route is explicitly loading by ID for management or finance, allow archived rows when the user has permission.

Milestone 4 changes fields and time slots. In `src/app/api/fields/[id]/route.ts`, route DELETE through `deleteOrArchiveField(...)`. Count references in events, matches, rental booking items, time slots, field rental slot arrays, staff assignments, and anything else that stores the field ID. If there are durable references, archive the field. Archived fields should not be selectable for new events or new rental availability, but they should still render in historical bookings, calendars, and finance views.

In `src/app/api/time-slots/[id]/route.ts`, route DELETE through `deleteOrArchiveTimeSlot(...)`. Add permission checks equivalent to the owning field or event where possible; the current route only requires a session. Count references from events, bills, event registrations with `slotId`, rental bookings, rental booking items, and rental checkout locks. If referenced, archive the time slot instead of deleting it. Rental availability lists should exclude archived time slots. Historical booking views should still resolve archived time slots when referenced.

Milestone 5 changes teams and products. In `src/app/api/teams/[id]/route.ts`, route DELETE through `deleteOrArchiveTeam(...)`. For canonical teams, hard-delete only if there are no team registrations, bills, subscriptions or payments, signed documents, event registrations, event team snapshots, matches, staff assignments, invites, or child team rows. Otherwise archive the canonical team and mark active team registrations or staff assignments `REMOVED` only where the user intends to retire the team. For event teams, archive instead of deleting if referenced by matches, event registrations, bills, refund requests, signed documents, or staff assignments.

In `src/app/api/products/[id]/route.ts`, use the existing `isActive` field. If the product has any subscriptions, Stripe product or price IDs, discount references, purchase history, or bills, set `isActive = false` and return `action: deactivated`. Only hard-delete newly created, never-used products with no references. Product grids should already prefer active products, but verify all public and organization product listings exclude inactive products by default. Historical subscriptions should still resolve inactive products.

Milestone 6 updates client services and copy. Keep using DELETE from services such as `src/lib/eventService.ts`, `src/lib/fieldService.ts`, `src/lib/teamService.ts`, and `src/lib/productService.ts`, but teach them to parse `deleted`, `archived`, `deactivated`, and `references` from the response. Update user-facing confirmation copy. Avoid saying "permanently delete" when the server may archive. Use copy such as "Delete or archive" and show a success message that matches the response: "Deleted draft", "Archived event because it has billing history", or "Product deactivated".

Milestone 7 adds tests and broad validation. For every changed route, add regression tests that prove referenced records are preserved. The event tests are most important. A test should create or mock an event with bills, bill payments, bill payment proofs, refund requests, signed documents, and event registrations, call DELETE, and assert that the event is archived and all durable records remain. Another test should cover an unused draft event and assert it is hard-deleted. Add tests for participant self/child removal to assert `EventRegistrations.status = CANCELLED` rather than deletion.

## Concrete Steps

Begin from the repository root:

    cd /Users/elesesy/StudioProjects/mvp-site

Before editing, inspect the current worktree so unrelated user changes are not staged or reverted:

    git status --short

Create the Prisma migration after editing `prisma/schema.prisma`:

    npx prisma migrate dev --name add_archive_metadata_for_referenced_deletes

If the local database is not available, create the migration with the repository's preferred migration workflow and record the exact command and error in `Surprises & Discoveries`. Do not fake a migration.

After schema generation, run:

    npx prisma generate

Implement Milestone 1 and run focused tests that can execute without the full route changes:

    npm test -- src/server/events/__tests__/eventRegistrations.test.ts
    npx tsc --noEmit

Implement Milestone 2 and run:

    npm test -- src/app/api/events/__tests__/eventDeleteRoute.test.ts
    npm test -- src/app/api/events/__tests__/participantsRoute.test.ts
    npm test -- src/server/events/__tests__/eventRegistrations.test.ts
    npx tsc --noEmit

Implement Milestone 3 and run event search/list tests:

    npm test -- src/app/api/events/__tests__/eventSearchRoute.test.ts
    npm test -- src/app/api/events/__tests__/eventDetailBootstrapRoute.test.ts
    npm test -- src/server/__tests__/publicOrganizationCatalog.test.ts
    npx tsc --noEmit

Implement Milestones 4 and 5 with focused tests:

    npm test -- src/app/api/fields/[id]/__tests__/route.test.ts
    npm test -- src/app/api/time-slots/__tests__/route.test.ts
    npm test -- src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts
    npm test -- src/app/api/products/[id]/subscriptions/__tests__/route.test.ts
    npm test -- src/lib/__tests__/productService.test.ts
    npx tsc --noEmit

Run a final broad check:

    npm run test:ci
    npx tsc --noEmit

If `npm run test:ci` is too slow or fails for unrelated existing reasons, record the reason and run the focused route and service tests listed above plus any affected UI tests.

## Validation and Acceptance

The implementation is accepted when the following behaviors are demonstrably true.

Deleting an unused draft or template event with no durable references returns a JSON response with `deleted: true` and removes the event row. The focused event delete test should prove this path.

Deleting an event with any bill, bill payment, manual payment proof, refund request, signed document, registration, rental booking, or meaningful match returns a JSON response with `archived: true` or `action: archived`. The event row remains with `archivedAt` set. The bills, bill payments, bill payment proofs, refund requests, signed documents, and registrations remain in the database.

Removing a self or child participant from an event updates matching `EventRegistrations` rows to `CANCELLED` instead of deleting them. A bill whose `sourceType` is `EVENT_REGISTRATION` and whose `sourceId` is the registration ID can still be traced back to the cancelled registration.

Deleting a referenced field archives it. Archived fields do not appear in new event field pickers or public rental availability, but historical rental bookings and event schedules can still display the field name.

Deleting a referenced time slot archives it. Archived time slots do not appear as new availability, but historical rental bookings, bills, and event occurrence references remain resolvable.

Deleting a referenced team archives it. Event history, match history, team bills, signed documents, and registrations still have a row to display.

Deleting a product with subscriptions or Stripe IDs deactivates it by setting `isActive = false`. The product disappears from active product grids but historical subscription or billing views can still resolve it.

Default public and operational lists exclude archived rows. Permissioned finance and history views can still load archived referenced rows by ID.

## Idempotence and Recovery

All archive operations must be idempotent. Calling DELETE twice on a referenced record should not throw merely because it is already archived. The second response can return `archived: true` with the existing archive metadata.

Hard-delete paths must stay narrow. If a reference check fails, times out, or cannot determine whether references exist, prefer archive over delete. The policy module should default to preservation on uncertainty.

Do not use destructive git commands to recover. If a migration or route change fails, inspect the diff and use a forward patch. Preserve unrelated local work.

If a route is changed from hard delete to archive and the UI still expects `deleted: true`, return compatibility fields during the transition. For example, return both `deleted: false` and `archived: true` for archive cases, and update client services in a later milestone.

If Stripe is unavailable, archiving an event must still preserve local records. Do not require Stripe configuration merely to archive a referenced event. Refund issuance belongs to explicit cancellation/refund flows, not the generic archive fallback.

## Artifacts and Notes

Current high-risk event delete behavior, paraphrased from `src/app/api/events/[eventId]/route.ts`:

    collectEventBillIds(eventId)
    settleEventBillingBeforeDelete({ eventId, billIds })
    delete matches, divisions, eventRegistrations, refundRequests, signedDocuments, invites, paymentIntents, templateDocuments
    delete billPayments and bills for collected billIds
    delete event time slots
    delete local fields
    delete teams
    delete event

This is the behavior this plan changes. The replacement must preserve financial and audit rows when references exist.

Current safer team registration removal behavior exists in `src/server/events/eventRegistrations.ts`:

    await client.eventRegistrations.updateMany({
      where: { id: registrationId },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    });

The self and child participant removal path should use the same preservation model.

## Interfaces and Dependencies

Use Prisma Client from `src/lib/prisma.ts` for database access. Use existing permission helpers such as `requireSession`, `canManageEvent`, `hasOrgPermission`, and organization permissions before performing delete-or-archive actions.

The new server module should live at `src/server/deletion/archivePolicy.ts`. Route handlers should not duplicate reference-counting logic. They should perform authentication and authorization, then call the relevant policy function.

The route response shape should be stable across entity types:

    {
      deleted: boolean;
      archived?: boolean;
      deactivated?: boolean;
      action: 'deleted' | 'archived' | 'deactivated';
      entityType: string;
      entityId: string;
      references?: Array<{ type: string; count: number }>;
    }

Client services may initially return booleans for compatibility, but they should inspect `action` so UI messages can be accurate.

Add tests near the existing route tests. Prefer extending existing files when a relevant file already exists:

- `src/app/api/events/__tests__/eventDeleteRoute.test.ts`
- `src/app/api/events/__tests__/participantsRoute.test.ts`
- `src/app/api/fields/[id]/__tests__/route.test.ts`
- `src/app/api/time-slots/__tests__/route.test.ts`
- `src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts`
- `src/app/api/products/[id]/__tests__/route.test.ts` if it exists, otherwise create it next to `src/app/api/products/[id]/route.ts`

Revision note 2026-06-29: Initial plan created after auditing current delete behavior. The plan prioritizes event and billing preservation because that is the largest observed data-loss risk.

Revision note 2026-06-29: Updated after the first implementation slice. Added archive metadata, event delete-or-archive policy, participant cancellation, default archived-event filtering, focused tests, Prisma validation, and TypeScript validation.
