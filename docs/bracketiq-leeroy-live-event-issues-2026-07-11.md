# BracketIQ Leeroy Grass Tournament — Live Event Incident Report

**Date:** July 11, 2026  
**Event:** BracketIQ Leeroy Grass Tournament  
**Scope:** Live event data, web scheduling/scoring, and the v1.6.14 mobile app

## Executive summary

This was not one isolated failure. The event encountered a chain of issues involving single-division configuration precedence, frozen per-match scoring snapshots, stale web and mobile payloads, and unsafe bracket advancement/save behavior. The event was also being actively repaired through multiple manual changes while it was live. Those changes were a reasonable response to blocked play, but they amplified inconsistencies between event settings, generated division settings, match snapshots, segments, and bracket participants.

The confirmed product defects have been patched on `main`, and the live event was repaired. Some preventive fixes for single-division pool/playoff configuration are still on the working branch and need normal review, testing, and release.

## Final verified live state

- Winner and loser bracket formats are both best-of-three, with set targets **21 / 21 / 15**.
- Loser-bracket Matches 14, 16, and 17 each have persisted three-set policies and three segment records.
- Match 14, **Sets Offenders vs white boys**, is correctly unresolved and in progress:
  - Set 1: Sets Offenders 19, white boys 21
  - Set 2: Sets Offenders 28, white boys 26
  - Set 3: not started
  - Series: 1–1; no match winner is recorded
- Match 16 is correctly **Aloha vs TBD**. Its stale entrant was cleared because Match 14 was reopened and has no winner yet.
- Match 17 is correctly **Tape Merchants vs TBD**.
- The production service is running the release that fixes best-of-three winner hydration: `a310ad8c`.

## Issue-by-issue record

### 1. Local release-mode app could not reach the live database

**Observed**

Launching locally in release mode against live database/storage produced a generic `Request failed` response.

**What was done**

The machine's current public IP was added to the DigitalOcean managed-database firewall while preserving the existing App Platform and IP rules. The connection then worked.

**Likely cause**

This was an environment-access issue: the local machine's public IP was not allow-listed. It was not an application scoring or bracket defect.

**Prevention**

- Keep a documented, least-privilege live-support access procedure.
- Confirm the database firewall before diagnosing an application-level `Request failed` message.
- Improve local error reporting so connectivity failures are distinguishable from application save failures.

### 2. Pool timing reset from 0-minute rest / 4-minute rounds to 15 / 20

**Observed**

For the single-division Leeroy event, setting pool rest to 0 minutes and round duration to 4 minutes appeared to save, but rebuilding returned the values to 15-minute rest and 20-minute rounds.

**What was done**

The issue was traced to configuration precedence rather than a scheduler rule that disallows 0-minute rest or 4-minute matches. The form and rebuild path were reading different configuration layers.

Working-branch fixes include:

- `cee2275a` — `Fix single-division pool scheduling`
- Follow-up uncommitted changes that hydrate pool controls from persisted pool detail and persist a single-division pool configuration to the generated division, while retaining event-level bracket timing separately.

**Likely cause**

Pool play rebuilds read `division.leagueConfig`, while the single-division form was initializing or saving relevant controls at the event/default layer. Rebuild therefore used stale generated-division values, including the 15/20 defaults.

**Status**

Implemented/in progress on the working branch. These changes should be committed, regression-tested, and released through the normal process before relying on them in production.

### 3. Single-division bracket was labeled as three sets but showed only one 21-point target

**Observed**

The generated bracket was labeled as three sets, but initially showed a single score limit of 21. The live event was later manually adjusted to 21 / 21 / 15.

**What was done**

- The live event and affected loser-bracket match policies were explicitly repaired to three sets with targets 21 / 21 / 15.
- Working-branch changes address single-division bracket configuration:
  - `afefeffb` — `Honor single-division double elimination`
  - `54def57c` — `Use loser bracket match duration`
  - An in-progress `matchPolicy.ts` change makes single-division bracket target lookup use the event-level values instead of a stale generated division's playoff configuration.

**Likely cause**

Bracket creation used `winnerSetCount` / `loserSetCount` to allocate three score slots, while target lookup preferred the generated division's stale playoff configuration. That could produce three set slots but only `[21]` as the target list.

**Status**

The live data is corrected. The direct product fix for this single-division precedence case is still working-branch work and should not be described as released until it is committed, tested, and deployed.

### 4. Web score saves reset, and a bracket pairing appeared to be overwritten

**Observed**

- An admin could not reliably save the score for **white boys vs Tape Merchants**.
- After attempts to save match changes, a matchup was reported as **Aloha vs Aloha** instead of **Aloha vs Hustle and Bustle**.
- The first-set live corrections requested were applied as 21–10 for white boys vs Tape Merchants and 17–21 for Aloha vs Hustle and Bustle.

**What was done**

Production hotfix `c251c9cb` — `Fix stale match saves and repeat advancement` — added several safeguards:

- The web match editor now refreshes its local segment/score state after an embedded score update, so a subsequent detail save does not re-submit stale score data.
- Bulk match updates now reject participant changes on locked, started, scored, or completed matches (HTTP 409), reject unknown teams, and reject the same team in both participant slots.
- Bracket advancement now selects the graph-defined destination slot (`previousLeftMatch` / `previousRightMatch`) instead of filling whichever slot happens to be empty.
- Re-finalizing an already completed match with the same winner is now a no-op, preventing duplicate advancement.

**Likely cause**

The code showed two unsafe paths: a stale match-edit modal could overwrite a newer embedded scoring update, and bracket advancement was not fully idempotent or graph-slot-aware. Manual retries/saves during a live bracket made those paths more likely to surface.

The available evidence does **not** prove the exact write that produced the Aloha-vs-Aloha pairing. It does prove that the pre-fix code could accept the kinds of stale/repeated operations that make such corruption possible.

### 5. Official check-in and mobile set confirmation failed

**Observed**

Hustle and Bustle could not complete the official check-in flow to begin officiating, and later a mobile set confirmation failed. A narrow live-data check-in adjustment was used to unblock play.

**Important finding**

Being checked in to the event was **not** a prerequisite for official match check-in. The mobile app's check-in eligibility requires:

- both match teams to be assigned;
- an eligible check-in window (one hour before start);
- the actor to be the assigned official, a member of the assigned team official, or an allowed substitute.

For a team official, the old data model used one match-level `officialCheckedIn` value. Once it is true, the prompt is suppressed for everyone on that assignment; it is not a per-person check-in record.

**Root cause of the mobile failure**

v1.6.14 used the generic full-match `updateMatch()` request for both official check-in and non-final set confirmation. That payload included cached `matchRulesSnapshot` and `resolvedMatchRules`. The server correctly treated a supplied snapshot as a host-only policy edit, so a non-host official could receive a 403 such as `Only hosts can update match policy` even though the official was authorized to check in or confirm a set.

**What was done**

Three backend compatibility fixes were released:

| Commit | Correction |
| --- | --- |
| `da0df305` — `Fix legacy mobile official check-in` | Converts a pure legacy `officialCheckedIn: true` mobile request into the narrow `officialCheckIn` operation. |
| `3dc7000f` — `Preserve mobile set confirmation updates` | Ensures the legacy check-in conversion does not discard real scoring, segment, lifecycle, incident, or finalization mutations. |
| `2d23ed81` — `Fix mobile set confirmation authorization` | For the narrowly defined legacy official-confirmation case, removes only the stale client snapshot and validates the completed set against the server's persisted rules. Explicit policy changes remain host-only. |

**Likely lead-up**

The mobile app began sending a full cached match snapshot in routine updates. Because match snapshots intentionally freeze once a match starts, manual event/match rebuilds and scoring-format edits left mobile cache, event configuration, and persisted match snapshots out of sync. A cached one-set / 15-point snapshot could therefore accompany a normal confirmation and look like an unauthorized policy edit.

**Remaining product work**

The mobile client should use the narrow `officialCheckIn` operation for check-in and a segment-operations-only request for set confirmation. It should not send immutable `matchRulesSnapshot` or `resolvedMatchRules` in non-host mutations. Add client contract tests for both paths.

### 6. Loser-bracket score changes reset and did not retain the configured format

**Observed**

The loser-bracket **Sets Offenders vs white boys** score initially could not be saved as 19–21 and completed; it reset. Later the requested second set was 28–26. Existing loser-bracket records had one-set policies or legacy segment state despite the event being configured for three sets.

**What was done**

Production hotfix `96c75187` — `Fix loser bracket set scoring` — corrected both server and UI reconciliation:

- Explicit incoming policy/snapshot `segmentCount` is now authoritative and can intentionally shrink legacy segment rows instead of `Math.max()` forcing old row counts back in.
- For set-based loser-bracket matches, the configured loser set count is authoritative instead of being merged with winner-bracket/base rules or legacy array lengths.
- Match editing and score UI now honor the resolved loser-bracket count and frozen snapshot count instead of stretching the format to stale arrays.

Live operational remediation then explicitly set loser Matches 14, 16, and 17 to three sets with 21 / 21 / 15 targets and persisted three segments for each.

**Likely cause**

Per-match snapshots and score arrays are intentionally durable, but pre-fix reconciliation treated historical array length as another source of truth. Once manual format changes occurred after bracket generation, the event-level configuration, frozen per-match policy, and stored segments could disagree. Changing the event settings alone could not safely migrate already-created matches.

### 7. A tied best-of-three series reloaded as if white boys had already won

**Observed**

After Match 14 was corrected to 19–21 then 28–26, its persisted data correctly showed a 1–1 series, in-progress status, no winner, and an empty third set. On reload, the public API nevertheless displayed white boys as the match winner.

**What was done**

Production hotfix `a310ad8c` — `Fix set series winner hydration` — replaced the read-model fallback that selected the first completed segment winner. For set-based matches, hydration now counts completed set winners and derives a match winner only after a majority is reached (two wins in a best-of-three). It retains a persisted match winner when one exists.

Regression tests cover the exact 19–21 / 28–26 1–1 case staying unresolved and a valid 2–1 series resolving correctly.

**Likely cause**

The hydration/read layer conflated a set winner with the overall match winner whenever the persisted `winnerEventTeamId` was null. The direct live score correction exposed the defect by reopening a previously completed one-set match as a tied best-of-three series.

## Role of manual live changes

Manual changes were a major **contributing factor**, but they should not be treated as the single root cause.

They were understandable emergency actions because normal web saves and mobile confirmations were failing during a live event. However, the changes happened across multiple representations and clients:

- event-level scoring and timing configuration;
- generated single-division configuration;
- frozen per-match policy snapshots;
- persisted match segments, points arrays, and winners;
- bracket graph/participant slots;
- web editor state and mobile cached match state;
- multiple code versions (`v1.6.14`, deployed `main`, and a working branch).

This increased the chance that one layer was repaired while another remained stale. It also made retrying or rebuilding riskier. The product needed stronger safeguards precisely because live staff should not need to understand all of those representations to repair a match.

## Release and remediation inventory

| Area | Change | State |
| --- | --- | --- |
| Stale web saves / repeat advancement | `c251c9cb` | Released to `main` and deployed |
| Loser-bracket set policy reconciliation | `96c75187` | Released to `main` and deployed |
| Legacy mobile official check-in | `da0df305` | Released before the final incident fixes |
| Preserve mobile confirmation payloads | `3dc7000f` | Released before the final incident fixes |
| Preserve confirmations if automatic rescheduling fails | `381a7d02` | Released before the final incident fixes |
| Mobile confirmation authorization compatibility | `2d23ed81` | Released to `main` and deployed |
| Best-of-three winner hydration | `a310ad8c` | Released to `main`; production active |
| Single-division pool/playoff configuration | `cee2275a`, `afefeffb`, `54def57c`, plus follow-up changes | Working branch/in progress; requires normal merge and release |

## Recommended follow-ups

1. **Ship and test the single-division configuration fixes.** Add end-to-end tests covering pool timing, double elimination, winner/loser set counts, set targets, and match duration before and after a rebuild.
2. **Make configuration ownership explicit.** A single-division event needs one clear authoritative source for pool settings and one for bracket settings. Generated division values must not silently override event values.
3. **Add an intentional scoring-format migration.** When a host changes a scheduled event from one format to another, present a review/confirmation flow that updates every affected unstarted match policy and warns about scored matches.
4. **Use narrow operations for live updates.** Score, segment confirmation, official check-in, participant assignment, and policy edits should be separate operations with explicit permissions. Avoid full-event or full-match writes for one small action.
5. **Add optimistic concurrency and audit history.** Include a match/event revision in write requests, reject stale saves with a clear conflict message, and record who changed scoring, participants, policies, and bracket links.
6. **Improve live-error reporting.** Replace generic `Request failed` messages with actionable server responses and a support correlation ID.
7. **Improve official operations UX.** Provide a host-visible official check-in control, show assigned officials clearly, and consider per-person team-official check-in records rather than one match-wide boolean.
8. **Update the mobile app.** Stop serializing cached rule snapshots for check-in and set confirmation; add contract tests against the backend's narrow mutation APIs.
9. **Create a live-event repair runbook.** Prefer the validated API over direct database changes. If an emergency data repair is necessary, capture before/after state, identify downstream bracket effects, and perform a post-repair readback.

## Evidence and confidence

The report distinguishes between:

- **Verified findings:** code-level defects covered by the cited fixes, and final live state read back after deployment.
- **Likely contributing factors:** manual edits, retries, rebuilds, and stale client state that align with the unsafe pre-fix paths.
- **Not proven from the available evidence:** the exact individual write that caused the Aloha-vs-Aloha pairing or the original generic web-save failure. Those would require a complete server-side audit trail and correlated request logs.

### 8. An event host could not edit Hustle and Bustle vs. Sets Offenders scores

**Observed**

Match 18 (Hustle and Bustle vs. Sets Offenders) was in progress but had no individual or team official assigned. The host could not use the normal score modal. The same match also had no persisted actual start time, so score controls remained disabled even though its status was `IN_PROGRESS`.

**Cause**

The client score-permission predicate required the viewer to be a checked-in assigned official or a member of the assigned team official. It did not include event hosts or admins, although the live match API already authorizes hosts/admins to manage scores without an official assignment. Separately, the score component correctly requires an actual match start before accepting score changes.

**Remediation**

Add a host/admin bypass to the client score-permission predicate while preserving official check-in requirements for non-host officials. Ensure the live match has an actual start time before scoring. A regression test covers a host opening and starting an unstaffed match from the score modal.
