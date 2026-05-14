# Event Timezones and UTC Storage

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. It is self-contained for a contributor who has only the current working tree.

## Purpose / Big Picture

Event creators enter event, match, rental, and time-slot times as local wall-clock values such as "9:00 AM". The application must persist those values as UTC instants, so a 9:00 AM Pacific event is stored as 4:00 PM UTC during daylight saving time, and then show that instant back as 9:00 AM for the event timezone regardless of the viewer's device timezone. After this change, creating an event or rental in `America/Los_Angeles` with start `2026-05-01 09:00` should store `2026-05-01T16:00:00.000Z` and both web and mobile should present the event as 9:00 AM when the event timezone is `America/Los_Angeles`.

## Progress

- [x] (2026-05-14 17:24Z) Read `PLANS.md`, inspected the web event form, event repository, canonical time-slot code, rental order route, and mobile event/time-slot DTOs.
- [x] (2026-05-14 18:30Z) Added persistent timezone fields and a migration for `Events` and `TimeSlots`.
- [x] (2026-05-14 18:30Z) Added shared server utilities that parse wall-clock strings in an IANA timezone and return UTC `Date` values.
- [x] (2026-05-14 18:30Z) Updated event create/update and time-slot/rental creation paths to convert local wall-clock values using the event or slot timezone.
- [x] (2026-05-14 18:30Z) Updated web display/calendar helpers so UTC instants render in the event timezone instead of the browser timezone.
- [x] (2026-05-14 18:30Z) Updated mobile event/time-slot DTOs and event detail/create/edit display helpers to use the event timezone instead of `TimeZone.currentSystemDefault()` for event-specific times.
- [x] (2026-05-14 18:30Z) Added focused regression tests for UTC conversion, calendar display, event upsert, and rental timezone handling.
- [x] (2026-05-14 18:30Z) Ran targeted verification in both repositories and recorded the command results here.

## Surprises & Discoveries

- Observation: The web server currently uses `new Date(value)` through `coerceDate` and `parseDateInput`. A string without an offset, such as `2026-05-01T09:00:00`, is interpreted in the server's local timezone. On a UTC production host, that stores 9:00 AM as 9:00 AM UTC instead of converting from the event timezone.
  Evidence: `src/server/repositories/events.ts` has `coerceDate(payload.start)`, and `src/server/timeSlotCanonical.ts` uses `parseDateInput(slot.startDate)`.
- Observation: Mobile event detail and scheduling code has several `TimeZone.currentSystemDefault()` calls for event-specific times. That makes the display follow the device timezone instead of the event timezone.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` formats `editEvent.start.toLocalDateTime(TimeZone.currentSystemDefault())`, and `LeagueScheduleFields.kt` derives slot days and minutes from the system timezone.
- Observation: A prior display-only patch changed `parseLocalDateTime` to strip offset suffixes. That behavior is not correct for this plan because stored UTC strings must remain instants unless explicitly converted into an event-timezone wall-clock value.
  Evidence: `src/lib/dateUtils.ts` currently strips `Z` before milliseconds and falls back to a local `Date`.
- Observation: Rental slots need to resolve timezone from the physical rental surface, not the viewer. Web now derives slot timezone from selected field coordinates first, then organization coordinates. Mobile uses the slot timezone returned by the API for rental availability and confirmation, with device timezone only as a fallback for older rows without `timeZone`.
  Evidence: `src/app/api/public/organizations/[slug]/rental-orders/route.ts`, `src/app/api/time-slots/route.ts`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/tabs/rentals/RentalSchedulingUtils.kt`.

## Decision Log

- Decision: Store an IANA timezone string, for example `America/Los_Angeles`, on `Events` and `TimeSlots`.
  Rationale: Correct UTC conversion and timezone-stable rendering require a durable timezone. Coordinates and text locations can change or be absent; a persisted timezone lets clients interpret existing UTC instants consistently.
  Date/Author: 2026-05-14 / Codex
- Decision: Treat incoming ISO strings with an explicit `Z` or numeric offset as absolute instants, and treat offset-less date/time strings as event-local wall-clock values.
  Rationale: This preserves backward compatibility for clients that already send UTC instants while fixing web form submissions that send local datetime strings.
  Date/Author: 2026-05-14 / Codex
- Decision: Keep `startTimeMinutes`, `endTimeMinutes`, `dayOfWeek`, and `daysOfWeek` as wall-clock scheduling fields in the event or slot timezone.
  Rationale: Those fields model recurring local schedule rules rather than absolute instants. UTC conversion applies to the date boundaries and generated event/match windows.
  Date/Author: 2026-05-14 / Codex
- Decision: Rental slot timezone resolution should prefer scheduled field coordinates, then organization coordinates, then an existing/payload timezone fallback.
  Rationale: Rental availability belongs to the field/location being rented. A viewer in a different timezone must not shift the rental grid or order windows.
  Date/Author: 2026-05-14 / Codex

## Outcomes & Retrospective

Implemented UTC storage with persisted IANA timezone labels for web events and time slots, and updated web/mobile event scheduling surfaces to interpret wall-clock input in the event or slot timezone. Rental slots now resolve timezone from field coordinates first and organization coordinates second on the server; mobile rental selection uses the API-provided slot timezone for availability, busy-window comparison, and confirmation labels.

Validation completed:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runTestsByPath src/lib/__tests__/dateUtils.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/app/api/time-slots/__tests__/route.test.ts 'src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts' 'src/app/events/[id]/schedule/components/__tests__/LeagueCalendarView.test.tsx' 'src/app/events/[id]/schedule/components/__tests__/MatchCardTime.test.ts'
    # 6 test suites passed, 62 tests passed

    cd /Users/elesesy/StudioProjects/mvp-site
    npx tsc --noEmit
    # passed

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileKotlinMetadata
    # BUILD SUCCESSFUL

## Context and Orientation

The web app lives in `/Users/elesesy/StudioProjects/mvp-site`. The Prisma schema is `prisma/schema.prisma`. Event create and update data passes through `src/lib/eventService.ts`, `src/types/index.ts`, API route handlers under `src/app/api/events`, and server repository logic in `src/server/repositories/events.ts`. Time-slot payloads are normalized in `src/server/timeSlotCanonical.ts`; standalone time-slot routes live in `src/app/api/time-slots/route.ts` and `src/app/api/time-slots/[id]/route.ts`. Public rental-only orders are created by `src/app/api/public/organizations/[slug]/rental-orders/route.ts`.

The mobile app lives in `/Users/elesesy/StudioProjects/mvp-app`. The persistent event model is `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`. Network DTOs are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`. Create/edit flows are mostly in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`.

An "IANA timezone" is a stable timezone identifier such as `America/Los_Angeles` or `America/New_York`. A "wall-clock value" is what the user chooses on a picker, such as 9:00 AM on May 1. A "UTC instant" is the precise moment stored in Postgres and serialized with a `Z` suffix, such as `2026-05-01T16:00:00.000Z`.

## Plan of Work

First, add `timeZone` to the web schema for `Events` and `TimeSlots`, with a default of `UTC`, and add the same field to TypeScript event and time-slot types. This is additive and safe for existing rows. Then add utilities that validate timezone strings, format UTC instants as event-local datetime strings, and convert offset-less local datetime strings to UTC using `Intl.DateTimeFormat`.

Next, wire those utilities into web server input parsing. `upsertEventFromPayload` should resolve `payload.timeZone`, defaulting to an existing event timezone or `UTC`, and use that timezone when parsing `payload.start`, `payload.end`, and time-slot date boundaries. Standalone time-slot create and patch routes should accept `timeZone` and parse boundaries using it. Rental order creation should resolve a rental timezone from the payload or organization/event defaults, persist it on the private rental event and rental slots, and keep the slot minutes as local wall-clock minutes.

Then update web client surfaces. Event forms should carry `timeZone` in the draft, default new events to the browser timezone, and when hydrating stored UTC values into Mantine pickers they should render in the event timezone. The league calendar should display UTC match instants in the event timezone and convert drag/drop wall-clock dates back to UTC instants before sending updates.

Finally, update mobile models and the most important event-specific display/edit helpers. Event DTOs and update payloads should include `timeZone`. Event detail, event edit, schedule fields, match cards, and rental utilities should use `TimeZone.of(event.timeZone)` with a safe fallback rather than the device timezone for event-specific labels and slot calculations.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for web changes and `/Users/elesesy/StudioProjects/mvp-app` for mobile changes.

Use these target commands for validation as implementation progresses:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- src/lib/__tests__/dateUtils.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/app/events/[id]/schedule/components/__tests__/LeagueCalendarView.test.tsx src/app/events/[id]/schedule/components/__tests__/MatchCardTime.test.ts
    npx tsc --noEmit

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileKotlinMetadata

The exact test list may be narrowed if unrelated existing failures or dirty local work make a broader command noisy. Any skipped validation must be recorded in `Outcomes & Retrospective`.

## Validation and Acceptance

The key regression is a Pacific event entered as local 9:00 AM. A unit test must prove that interpreting `2026-05-01T09:00:00` with `America/Los_Angeles` returns `2026-05-01T16:00:00.000Z`, and interpreting `2026-12-01T09:00:00` returns `2026-12-01T17:00:00.000Z` because daylight saving time is not active then.

Web server tests must prove that event upsert persists UTC `Date` values derived from `payload.timeZone`, and that explicit `Z` inputs remain unchanged. Calendar tests must prove that a UTC match instant renders as the event-local time when `eventTimeZone` is provided.

Mobile verification must at minimum compile the common Kotlin metadata after adding timezone fields and changing event-specific `TimeZone.currentSystemDefault()` usage.

## Idempotence and Recovery

The Prisma migration is additive. Re-running the migration should leave existing rows with `UTC` defaults. Do not reset the database or drop columns for this change. If generated Prisma files churn excessively, inspect the diff and keep only the generated files normally tracked by this repository.

The working trees contain unrelated local edits. Do not revert them. If a touched file already has user changes, integrate around them and keep the final diff scoped to timezone behavior.

## Artifacts and Notes

Current relevant dirty files before implementation include web schedule form/page/location edits and a mobile `EventDetailScreen.kt` edit unrelated to timezone. Those must be preserved.

Revision note, 2026-05-14: Created the plan after the user pivoted from non-UTC storage to correct UTC storage plus event-timezone interpretation.
