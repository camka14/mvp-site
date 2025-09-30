# League Events & Management — Implementation Instructions (mvp-site)

> Target stack: **React + TypeScript**, **Appwrite** (Database, Functions, Auth).
> Scope: Add a new **League** event type with weekly field timeslots, conflict prevention, schedule generation (via `mvp-build-bracket`), and a **Preview Schedule** UI. Use **Appwrite relationships** wherever possible.

---

## 1) Goals & Non‑Goals

### Goals

* Create and manage **League** events spanning a date range.
* Define **weekly timeslots per Field**; show **available/unavailable** based on date range & conflicts.
* Store all league config in DB (relationships preferred) so the system can **generate matches** when a user joins.
* Replace the event-creation submit for leagues with **Preview Schedule** that calls an **Appwrite `create_league`** function and displays the returned schedule JSON.
* Allow playoffs as an option; regular season is round-robin with configurable **games per opponent**.

### Non‑Goals

* Implementing the pairing/bracket algorithm (handled by **`mvp-build-bracket`**).
* Full-blown calendar UI; a list/grouped-by-week view is sufficient for v1.

---

## 2) Data Model & Schema

> Use **Appwrite relationships** for all cross-entity references.

### 2.1 Collections (New/Updated)

#### A) `events` (existing) — add league-specific fields

* `eventType` **enum**: `pickup` | `tournament` | **`league`**
* `start` **datetime** (existing): league start date
* `end` **datetime** (existing): league end date
* **League config**

  * `gamesPerOpponent` **int** (>= 1)
  * `includePlayoffs` **boolean** (default: false)
  * `playoffTeamCount` **int** (nullable; valid when `includePlayoffs`)
  * `usesSets` **boolean** — sport uses sets (e.g., volleyball/tennis)
  * `matchDurationMinutes` **int** — full match slot length
  * `setDurationMinutes` **int** (nullable) — applied if `usesSets`
  * `setsPerMatch` **int** (nullable) — applied if `usesSets`
* **Relationships**

  * `organizationId` → `organizations` (existing)
  * `fieldIds` → array<`fields`> (optional convenience; full details live in weekly schedule)
  * `teamIds` → array<`teams`> (existing; use relation type if feasible)
* `status` **enum**: `draft` | `published` | `archived` (reuse existing status pattern)

> Note: If the current Matches model references `tournamentId`, introduce a new **`eventId`** relation to support both tournaments and leagues. Migrate future code to use `eventId`.

#### B) `weekly_schedules` (new)

Represents a **recurring weekly timeslot** claimed by a league.

* `eventId` → `events` (**relation**, required)
* `fieldId` → `fields` (**relation**, required)
* `dayOfWeek` **int** [0–6] (Mon=0)
* `startTime` **string** ("HH:mm")
* `endTime` **string** ("HH:mm")
* `timezone` **string** (IANA; default from org)

**Indexes**

* Composite: `(fieldId, dayOfWeek)`
* For conflict scans: `(eventId)`, `(fieldId, dayOfWeek, startTime)`

#### C) `matches` (existing) — light extension

* **Add** `eventId` → `events` (**relation**) if not present
* **Add** `matchType` **enum**: `regular` | `playoff`
* **Add** `weekNumber` **int` (optional; helps grouping)
* Existing fields reused: `fieldId` (→ `fields`), `start` datetime, `end` datetime, `team1Id`, `team2Id`, scores, etc.
* For placeholders before teams join: allow `team1Id`/`team2Id` empty or store `team1Seed`/`team2Seed` ints.

---

## 3) Availability & Conflict Prevention

A weekly timeslot is **unavailable** if **any** other league’s weekly slot on the **same field** & **same dayOfWeek** overlaps in **time** and the **date ranges** intersect.

**Time overlap check** (on same field/day):

```
!(new.endTime <= existing.startTime || new.startTime >= existing.endTime)
```

**Date overlap check** (event ranges):

```
!(new.end < existing.start || new.start > existing.end)
```

If both overlap → **conflict**.

> Optional (v2): also scan one-off events/matches to avoid one-night collisions by iterating weeks and checking `matches` on specific dates.

---

## 4) Appwrite Function: `create_league`

**Purpose**: Generate full league schedule (regular season + optional playoffs) using `mvp-build-bracket` and persist to DB. Returns **JSON** with all matches for preview.

### 4.1 Input

```json
{
  "eventId": "<event-id>",
  "dryRun": false
}
```

### 4.2 Steps (server)

1. Fetch `event` by `eventId`.
2. Fetch `weekly_schedules` where `eventId == eventId`.
3. Validate feasibility:

   * `totalGames = teams * (teams-1) * gamesPerOpponent / 2`
   * `slotsPerWeek = weekly_schedules.length`
   * `weeks = ceil((end - start)/7 days)`
   * Ensure `slotsPerWeek * weeks >= totalGames` (+ playoff games if enabled); else return error.
4. Build **slot matrix** from weekly schedules across date range (respecting `matchDurationMinutes`).
5. Call `mvp-build-bracket` with:

   * team count / seeds (use placeholders if teams not yet joined),
   * games per opponent,
   * playoffs config,
   * available slot matrix (date, fieldId, start, end),
   * slot length (match or set-based total).
6. Receive scheduled pairings with assigned **date/time/field**.
7. Persist **`matches`** (unless `dryRun`): create documents with `eventId`, `fieldId`, `start`, `end`, `matchType`, `weekNumber`, and either `team1Id`/`team2Id` or seed placeholders.
8. Return JSON payload of matches.

### 4.3 Output (example)

```json
{
  "matches": [
    {
      "id": "...",
      "weekNumber": 1,
      "matchType": "regular",
      "fieldId": "<FIELD_ID>",
      "start": "2025-01-08T18:00:00-08:00",
      "end": "2025-01-08T19:00:00-08:00",
      "team1Seed": 1,
      "team2Seed": 2
    }
  ]
}
```

> **Team assignment after join**: Map seeds → actual `teamIds` when the league reaches required participants (or on organizer action). Update all matches accordingly.

---

## 5) Frontend Changes (React + TS)

### 5.1 Event Creation Modal

* **Event Type**: add `League` option.
* Show **LeagueFields** component when `eventType === 'league'`:

  * `gamesPerOpponent` (number)
  * `includePlayoffs` (switch) → `playoffTeamCount`
  * `usesSets`, `setsPerMatch`, `setDurationMinutes` **or** only `matchDurationMinutes`
  * **Weekly Timeslots** (dynamic list): `fieldId`, `dayOfWeek`, `startTime`, `endTime`, `timezone`

    * On change: run **availability check** against DB; mark slot invalid if conflict.
* **Primary CTA** (create-mode + league): **“Preview Schedule”** (replaces “Create Event”).

### 5.2 Preview Schedule Flow

1. On click **Preview Schedule**:

   * Create event (status=`draft`).
   * Create `weekly_schedules` entries (relations to event & fields).
   * Invoke `create_league(eventId)`.
2. Receive JSON of `matches`.
3. Navigate to **Schedule Preview** page with payload or refetch matches by `eventId`.

### 5.3 Schedule Preview Page (`/events/:id/schedule`)

* **Header**: Event name, date range, league meta (games/opponent, playoffs, fields).
* **Tabs/Sections**:

  * **Schedule** (default): List matches **grouped by week**. Show date, time, field, teams (`TBD` if not assigned).
  * **Standings** (optional v1.1): Table of `Team`, `W`, `L`, `Win%` updated after results.
* **Actions (Organizer)**:

  * **Publish League** (status → `published`).
  * **Cancel League** (delete event, schedules, matches).
  * *(Nice-to-have)* **Edit Config & Regenerate**: wipes matches, updates configs, re-runs `create_league`.

### 5.4 Match Result Entry (Reuse Tournament Patterns)

* Click match → open score modal, update `matches` and adjust `teams.wins/losses`.

---

## 6) Validation Rules (Client + Server)

* At least **one** weekly timeslot.
* `start < end` (dates).
* No **overlapping** timeslots for the **same field**.
* **Conflict check** vs other leagues on chosen fields/days.
* **Feasibility** heuristic before generation (see §4.2 Step 3).
* Playoffs count ≤ number of teams; power-of-two recommended (warn if not).

---

## 7) TypeScript Interfaces (illustrative)

```ts
// League-specific extension on Event payload
interface LeagueConfig {
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount?: number;
  usesSets: boolean;
  matchDurationMinutes: number;
  setDurationMinutes?: number;
  setsPerMatch?: number;
}

interface WeeklySchedule {
  id: string;
  eventId: string;       // relation
  fieldId: string;       // relation
  dayOfWeek: 0|1|2|3|4|5|6;
  startTime: string;     // "HH:mm"
  endTime: string;       // "HH:mm"
  timezone: string;      // e.g., "America/Los_Angeles"
}

interface CreateLeagueFnInput {
  eventId: string;
  dryRun?: boolean;
}

interface ScheduledMatchPayload {
  id: string;
  eventId: string;
  fieldId: string;
  start: string;   // ISO
  end: string;     // ISO
  weekNumber?: number;
  matchType: 'regular'|'playoff';
  team1Id?: string; team2Id?: string;
  team1Seed?: number; team2Seed?: number;
}
```

---

## 8) Services & Queries

### 8.1 Availability Check (client service)

* Query `weekly_schedules` by `(fieldId, dayOfWeek)`.
* For each candidate, fetch related `event` (start/end) or denormalize dates in schedule doc.
* Apply **time** + **date** overlap logic.

### 8.2 Matches Fetch

* `matches` where `eventId == :id`, order by `start` → group into weeks client-side.

### 8.3 Team Assignment (post-join)

* When league reaches `maxParticipants` or organizer clicks **Assign Teams**:

  * If seeds used: map seed→`teamId`, `PATCH` matches.
  * Else (placeholders): iterate matches in order; assign from `event.teamIds` ordered list.

---

## 9) Migrations & Indexing

* **Add fields** to `events`.
* **Create** `weekly_schedules` with indexes.
* **Add** `eventId` to `matches` (and backfill from `tournamentId` where appropriate).
* Ensure indexes exist for `matches(eventId,start)` for schedule queries.

---

## 10) UX Copy & States

* Event creation → League: **“Preview Schedule”** (disabled until no conflicts).
* During generation: **“Generating schedule…”** (spinner).
* On success: open **Schedule Preview**.
* On publish: toast **“League published.”**
* On conflict: inline error **“This field/time is already booked for overlapping dates.”**

---

## 11) Testing Plan

* **Unit**: overlap utils, feasibility calc, seed→team assignment map.
* **Integration**: create league, add timeslots, conflict detection, function call, matches persisted, preview render.
* **Edge cases**: odd team count (byes), minimal weeks, multiple fields same night, time adjacency (end==start), daylight savings transition (timezone).

---

## 12) Rollout Plan

1. Ship DB migrations & indexes.
2. Deploy `create_league` function (behind feature flag).
3. Release UI changes hidden for non-admin orgs → canary test.
4. Enable per-organization and monitor errors/feedback.

---

## 13) Future Enhancements

* Calendar/Matrix view with per-field lanes.
* One-off blackout dates on weekly schedules.
* Auto-reschedule on rainouts/blackouts.
* Advanced tiebreakers & playoff seeding.
* Email/Push notifications for new matches.

---

## 14) Example Request/Response Snippets

**Create (Preview) flow:**

```ts
// 1) Create Event (draft) + WeeklySchedule docs
await eventService.create({
  ...baseEvent,
  eventType: 'league',
  status: 'draft',
  leagueConfig,
});
await scheduleService.createMany(weeklySlots.map(s => ({ ...s, eventId })));

// 2) Generate schedule
const res = await functions.createLeague({ eventId });

// 3) Navigate to preview with res.matches
router.push(`/events/${eventId}/schedule`);
```

**Schedule JSON** (trimmed):

```json
{
  "matches": [
    {
      "id": "abc123",
      "eventId": "evt_1",
      "fieldId": "fld_1",
      "start": "2025-01-08T18:00:00-08:00",
      "end": "2025-01-08T19:00:00-08:00",
      "weekNumber": 1,
      "matchType": "regular",
      "team1Seed": 1,
      "team2Seed": 2
    }
  ]
}
```

---

## 15) Acceptance Criteria (v1)

* Can create an **event of type League** with date range and at least one weekly timeslot.
* **Conflict prevention** blocks overlapping weekly timeslots on the same field within overlapping date ranges.
* **Preview Schedule** triggers `create_league` and shows full season matches.
* Matches are **persisted** (draft) and viewable on **Schedule Preview** page.
* Organizer can **Publish** the league and teams can join; placeholders visibly become team names when assigned.
