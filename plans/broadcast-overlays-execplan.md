# Build the Beach Volleyball Broadcast Overlay Pilot

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This document must be maintained in accordance with PLANS.md at the repository root. It is intentionally a plan only at the time it is created: no production broadcast-overlay code has been added yet.

## Purpose / Big Picture

BracketIQ needs a dependable way to put live beach-volleyball match information on an OBS production without placing administration controls, application chrome, or sensitive event records on the stream. After this work, a BracketIQ administrator will open the Broadcast Overlays tab in Admin, create an event-bound overlay, select a match, tune a draft design, publish it, copy an unlisted OBS URL, and operate the visible overlay through a separate producer control surface. A Browser Source loading that URL will show a transparent scorebug and receive new presentation state after a real match update without showing a footer, chat drawer, login screen, or score controls.

The first pilot is deliberately beach-volleyball-first. It proves one reliable presentation contract, revisioned state delivery, and a compact scorebug before expanding visual templates, sports, and complex OBS automation. The Studio and Control Room remain in the private Admin tab for the pilot. The Program Overlay is unlisted but necessarily reachable by a revocable read-only capability URL because OBS Browser Source cannot sign in to BracketIQ. “Public” in this plan means an unlisted, token-authorized render surface, not a discoverable public product page.

## Progress

- [x] (2026-07-11 05:35Z) Read the supplied Broadcast Overlays recommendation, PLANS.md, the Admin dashboard/tab convention, existing match scoring and set-rule code, custom WebSocket server, Redis fanout plan, app layout, Prisma schema, and relevant test conventions.
- [x] (2026-07-11 05:35Z) Verified the OBS Browser Source and OBS browser-dock capabilities needed for the pilot from official OBS materials.
- [x] (2026-07-11 05:35Z) Wrote this repository-specific implementation plan and resolved the initial architectural decisions below.
- [ ] Implement the persistence, authorization, and projection foundation.
- [ ] Implement the private Admin Studio and exact program preview.
- [ ] Implement the isolated token-authorized Program Overlay and revisioned realtime feed.
- [ ] Implement the Control Room, then prove the complete first-live-test scenario in OBS.

## Surprises & Discoveries

- Observation: the Admin dashboard is an appropriate temporary entry point, but it is platform-admin-only rather than an organizer self-service surface.
  Evidence: src/app/admin/page.tsx authorizes through src/server/razumlyAdmin.ts, and src/app/admin/AdminDashboardClient.tsx already mounts independent panels such as AdminAffiliateImportsPanel.tsx from a tab.

- Observation: the existing match WebSocket is useful transport infrastructure but is unsafe and insufficient as a program-overlay API.
  Evidence: src/server/realtime/matchRealtime.ts emits raw match.changed records with no snapshot, monotonic revision, semantic animation event, or read-only program token. The legacy serialized match can include teams, players, officials, incidents, identifiers, and notes.

- Observation: a match-changing route cannot always describe every resulting event change in its raw WebSocket payload.
  Evidence: schedule, standings, and finalization paths can save multiple matches or downstream bracket assignments. The projection therefore must reload the narrow, current database state after each relevant committed change rather than infer the stream output from one raw change message.

- Observation: the existing beach-volleyball data model supports ordered sets and win-by-two validation but not every broadcast fact.
  Evidence: src/lib/matchSetScoring.ts supports a per-set target and a two-point margin, while the current schema has no serving team, timeouts, visibility, stinger, clock pause, manual override, or presentation revision. Match.side is bracket placement, not a serving indicator.

- Observation: the current default Beach Volleyball sport template is generic set scoring and does not guarantee a 21, 21, 15 best-of-three configuration.
  Evidence: src/server/defaultSports.ts creates Beach Volleyball through setBasedRules() without an explicit segment count or setPointTargets. The overlay must read a match’s resolved rules first and use the beach defaults only as a display fallback until the sports defaults are made explicit.

- Observation: a normal App Router page would not be safe for OBS output today.
  Evidence: src/app/layout.tsx always renders profile completion, chat, the assistant drawer, footer, mobile prompt, analytics, and an opaque body shell. The existing raw HTML embed route is isolated, but the overlay needs a reusable React renderer and client-side animation.

- Observation: OBS Browser Source can set its own viewport and custom frame rate, starts with transparent-background CSS, and exposes a browser-dock JavaScript bridge. Saving the Replay Buffer requires the BASIC permission level.
  Evidence: the official OBS Browser Source guide documents configurable width, height, custom FPS, transparent CSS, and source lifecycle behavior; the official obs-browser README documents window.obsstudio, replay-buffer events, and window.obsstudio.saveReplayBuffer().

## Decision Log

- Decision: build the product as three isolated surfaces: private Overlay Studio, private Control Room, and unlisted read-only Program Overlay.
  Rationale: producer actions must never render in the Browser Source and editor rerenders must not destabilize the stream. The separation also makes the later organizer-facing move a routing and authorization change rather than a renderer rewrite.
  Date/Author: 2026-07-11 / Codex

- Decision: use event-scoped manager APIs from the first commit even though the initial UI lives under /admin.
  Rationale: the feature belongs to a specific event. requireSession plus canManageEvent already supports platform administrators, hosts, assistant hosts, organization owners, and organization staff with events.manage. The Admin pilot can call the canonical routes now; a later event workspace can reuse them without an API migration.
  Date/Author: 2026-07-11 / Codex

- Decision: the current Match and MatchSegments records remain the authoritative automatic scoring source.
  Rationale: a separate “broadcast score” must not silently become a competing official score store. The presentation layer derives automatic score, completed sets, status, rules, field, and team context from the existing match model. Broadcast-only information such as visibility, serving team, timeout display, stingers, and temporary manual presentation overrides is stored separately.
  Date/Author: 2026-07-11 / Codex

- Decision: use a persistent revisioned presentation state plus append-only action records, not a client-side interpretation of raw tables.
  Rationale: a saved snapshot makes refresh and reconnect deterministic. A numeric revision lets receivers discard stale messages. A small semantic action record tells a connected renderer whether to animate a point, a serve change, a set completion, a match change, or a stinger without replaying old events after reconnect.
  Date/Author: 2026-07-11 / Codex

- Decision: use four additive Prisma models with raw IDs and versioned JSON only for bounded configuration and presentation documents.
  Rationale: this repository persists raw association IDs and hydrates related data in services. Event ownership, status, token lifecycle, revision, and audit fields need indexed columns. Layout, style, and bounded presentational values evolve more safely in validated versioned JSON than in a wide schema.
  Date/Author: 2026-07-11 / Codex

- Decision: make the program URL an opaque, hashed, revocable read capability and exchange it for a short-lived WebSocket ticket.
  Rationale: a long-lived JWT cannot be individually revoked without a lookup. A 256-bit opaque value is returned only at creation or rotation, stored only as a hash, and permits program-state reads only. Keeping it in the URL fragment avoids sending it in normal HTTP request URLs or referrers. A short-lived signed socket ticket limits active connection lifetime; token revocation will also publish a Redis close event to disconnect live sockets promptly.
  Date/Author: 2026-07-11 / Codex

- Decision: use a chrome-bypass marker set by middleware for Program Overlay and Preview routes, then render a bare branch in the root layout.
  Rationale: this preserves a React client renderer and the existing application route structure while guaranteeing that overlay routes do not mount providers, chat, assistant UI, footer, prompt, analytics, or opaque site chrome. It is less duplicative than a raw HTML renderer and safer than hiding normal-site elements with CSS.
  Date/Author: 2026-07-11 / Codex

- Decision: the first visual proof is Compact Scorebug. Center Court and Championship Ribbon consume the same state contract but are added only after the scorebug, refresh, reconnect, and transparent-output tests pass.
  Rationale: the compact template works in most camera compositions and gives the team a live-production proof point sooner. A stable state contract protects the later templates from churn.
  Date/Author: 2026-07-11 / Codex

- Decision: use the app’s already loaded Roboto Flex for the pilot overlay, with tabular numerals and controlled font width for long-name fallback.
  Rationale: this retains BracketIQ’s current font delivery, avoids adding a new remote visual dependency to an OBS render path, and supports the proposal’s variable-width long-name treatment. A selectable Inter or serif theme is a post-pilot styling enhancement.
  Date/Author: 2026-07-11 / Codex

- Decision: manual override is feature-flagged and presentation-only in the first live test. “Commit correction as official” is not enabled until official score mutation logic has been extracted and reused safely.
  Rationale: the existing score route has permission, match-start, locking, segment, and win-by-two checks. A control room must not bypass them. During the pilot, an override has a visible mode, audit record, shadow automatic state, Undo, and explicit resume; committing to Match remains a later, separately tested capability.
  Date/Author: 2026-07-11 / Codex

- Decision: defer King or Queen of the Court, arbitrary drag-and-resize, sponsor rotation, hardware shortcuts, replay playback, replay trimming, scene switching, multi-court production, and non-volleyball sports.
  Rationale: these features depend on a demonstrated reliable presentation state and, for automatic replay playback, a trusted local companion or OBS plugin. Version one may call the OBS dock’s Save Replay Buffer bridge when permission is available, but it will not promise local scene or media-source automation.
  Date/Author: 2026-07-11 / Codex

## Outcomes & Retrospective

Planning is complete. The planned design preserves one official source of truth for match data, makes the streamed program output intentionally smaller and safer than internal match payloads, and gives the feature a staged path from a private platform-admin pilot to an event-owned organizer workspace. No application behavior has changed yet.

The main risk remaining before implementation is live-environment verification: browser-source frame performance, cross-process Redis fanout, and token revocation must be tested on the intended OBS machines. The milestones below isolate those risks before replay automation or other production tooling is attempted.

## Context and Orientation

BracketIQ is a TypeScript Next.js App Router application. Prisma is the database client, accessed through src/lib/prisma.ts. A custom Node server in server.mjs owns WebSocket upgrades because ordinary App Router route handlers do not own those connections. Existing match updates publish raw match.changed messages from src/server/realtime/matchRealtime.ts; Redis adds fanout between server processes when REDIS_URL is configured.

An event’s current match records live in the Matches and MatchSegments models in prisma/schema.prisma. A segment means one set for a set-based match. The score route at src/app/api/events/[eventId]/matches/[matchId]/score/route.ts writes an absolute score for one team and segment, validates the match’s configured set target and win-by-two rule, and then publishes a raw match update. Match lifecycle, segment operations, incidents, and finalization also flow through src/app/api/events/[eventId]/matches/[matchId]/route.ts. The broadcast projection must use these records as automatic input; it must not serialize the full internal objects to a program client.

The initial admin entry is src/app/admin/AdminDashboardClient.tsx. Its AdminTab union, lazy panel mounting, refresh switch, and AdminAffiliateImportsPanel precedent show where the new AdminBroadcastOverlaysPanel belongs. The admin page itself permits only verified platform administrators, but the canonical broadcast APIs will load the event and call canManageEvent from src/server/accessControl.ts. This means the initial Admin UI works without a later API rewrite, while a later route such as src/app/events/[id]/broadcast/page.tsx can be enabled for an event manager.

The Program Overlay is the full-canvas transparent web page captured by OBS Browser Source. It has no controls. The Control Room is an authenticated producer interface that changes presentation state. The Studio is an authenticated editor for draft and published configuration. A presentation state is a narrow, safe data object containing only the two display teams, public event and court context, selected logo URLs, score/set state, elapsed-clock timestamps, and allowed overlay controls. A revision is a nondecreasing integer on that state. A client compares revisions so an old WebSocket message cannot overwrite newer content.

## Scope and Boundaries

The initial pilot includes:

- A Broadcast Overlays Admin tab with event and match selection, draft configuration, safe test data, preview, publish state, and access-token rotation.
- The Compact Scorebug template with team names, up to two player names per team, team and event/organizer logo toggles, color-safe team accents, current points, sets won, completed-set results, current set, court, round label, match status, optional elapsed timer, serving indicator, and optional seeds.
- Controlled positioning only: nine anchors, normalized horizontal and vertical offsets, 75–125 percent scale, maximum logical width, safe area, keyboard nudges, and lock. The renderer uses a logical 1920 by 1080 canvas and scales at any Browser Source viewport.
- A Program Overlay using a transparent, no-chrome route and an unlisted read-only token capability.
- Snapshot-first realtime with revisions, reconnect behavior, and semantic events for score, serve, set completion, match change, visibility, and stinger actions.
- A Control Room for visibility, match selection, serving-team display, timeout display, four stingers (match intro, location, set result, match result), replay-buffer status, Save Replay Buffer when running as a permitted OBS dock, Undo for broadcast-only commands, and a feature-flagged manual presentation override.
- Beach-volleyball presentation rules: best of three, 21-point first two sets, 15-point deciding set, two-point margin, current-set emphasis, completed-set winner treatment, optional set/match-point and court-switch cues.
- Tests and an OBS live-test checklist described in Validation and Acceptance.

The initial pilot does not include a general public browse page, organizer self-service UI, fully automated replay playback, arbitrary layout editing, King or Queen of the Court, sponsor rotation, Stream Deck bindings, multiple simultaneous courts, other sports, remote producer operation, or official-score commits from manual override.

## Persistence and Interfaces

Add these models to prisma/schema.prisma and create an additive timestamped migration named prisma/migrations/<timestamp>_add_broadcast_overlays/migration.sql. Follow the repository’s ID-centric convention: use raw string IDs and service-level validation rather than adding Prisma relation fields or foreign keys. Regenerate the Prisma client and deliberately synchronize the separately tracked prisma/schema.generated.prisma according to the repository’s existing generation workflow. Do not reset a populated database if Prisma reports historical migration drift; produce and review additive SQL with prisma migrate diff instead.

Create BroadcastOverlays with these columns:

    id, createdAt, updatedAt
    eventId, organizationId
    name, templateKey, status
    draftConfig, publishedConfig, publishedConfigRevision
    publishedAt, publishedByUserId
    createdByUserId, updatedByUserId
    archivedAt, archivedByUserId, archiveReason

Index eventId with status and creation time, organizationId with status, and archivedAt. The eventId is the ownership boundary. organizationId is copied from the event only to make administration and audit queries efficient; authorization must always reload the event.

Create BroadcastOverlayStates as a one-to-one row with an overlay:

    id, createdAt, updatedAt
    overlayId unique, eventId, activeMatchId
    revision, scoringMode
    presentationState, automaticShadowState
    manualOverrideBaseRevision, manualOverrideStartedAt
    manualOverrideStartedByUserId, manualOverrideReason
    updatedByUserId

Index eventId with activeMatchId and index activeMatchId. revision increments for every accepted presentation mutation. presentationState is the currently effective state rendered by Program Overlay. automaticShadowState continues to refresh from Match while a manual presentation override is active but does not replace the on-air state.

Create BroadcastOverlayActions as an append-only audit and semantic-event stream:

    id, createdAt
    overlayId, organizationId, eventId, matchId
    accessTokenId, actorUserId, actorKind
    actionType, baseRevision, presentationRevision, requestId, payload

Require a unique pair of overlayId and requestId for idempotent producer commands. Index overlayId with presentationRevision and creation time, plus eventId, matchId, token, and actor access paths. actionType remains a validated string union so the action vocabulary can evolve without PostgreSQL enum migrations. payload stores a small redacted delta only, such as before/after points, a serve team, a stinger key, or an Undo target. It never stores a complete Event, a UserData object, email addresses, raw capability values, or hashes.

Create BroadcastOverlayAccessTokens:

    id, createdAt, updatedAt
    overlayId, tokenHash, label, createdByUserId
    expiresAt, revokedAt, revokedByUserId, revokeReason, lastUsedAt

Index overlayId with creation and revocation timestamps and index expiresAt. Issue 32 random bytes encoded with base64url. Store only the SHA-256 base64url digest in tokenHash. Return the opaque raw token only from create or rotate. Rotation creates the replacement and revokes the old value in one transaction. Throttle lastUsedAt writes so a polling or connected client does not write the database on every update.

Create src/server/broadcast/types.ts and src/server/broadcast/schemas.ts. They must expose a Zod-validated BroadcastOverlayConfigV1, MatchPresentationStateV1, BroadcastOverlayCommand, BroadcastOverlayActionType, and wire-message types. Configuration and state JSON are versioned documents, so future migrations can recognize version 1 before changing a stored value.

BroadcastOverlayConfigV1 must have the following bounded shape:

    {
      version: 1,
      transform: { anchor, x, y, scale, maxWidth, safeArea, locked },
      output: { preset, customWidth, customHeight, performanceMode },
      display: { showTeamLogos, showPlayerNames, showTimer, showSeeds, showCourtSwitchCue },
      style: { surface, contrastMode, teamColorBehavior, font },
      motion: { entrance, scoreChange, intensity, reducedMotion },
      teamOverrides: {
        [eventTeamId]: { displayName, shortName, abbreviation, color }
      },
      stingers: { defaults, enabledKinds }
    }

The transform stores normalized x and y coordinates, scale, and logical dimensions. The renderer translates these onto a 1920 by 1080 logical canvas, then scales that canvas to the actual Browser Source viewport. Do not store raw screen pixels. Team short names, abbreviations, and colors are overlay-specific overrides in version one because existing team records do not own all of those broadcast fields.

MatchPresentationStateV1 is a strict allow-list. At minimum it has:

    {
      revision,
      status,
      event: { id, name, logoUrl, organizerName, organizerLogoUrl, venue, court },
      competition: { sport, format, roundLabel, bestOf, setTargets, winBy },
      teams: [PresentationTeam, PresentationTeam],
      score: { currentSet, points, setsWon, sets, servingTeamId, timeoutsRemaining },
      clock: { mode, startedAt, pausedAt, elapsedBeforePauseMs },
      presentation: { scoreboardVisible, activeStinger, replayState },
      scoringMode
    }

PresentationTeam contains only an ID, selected display name variants, up to two selected player display names, a logo URL, a safe accent color, and an optional seed. The projection may derive logo URLs from existing event imageId, organization logoId, and team profileImageId. Do not add custom sponsor assets until there is a dedicated file-reference model.

## API and Authorization Contract

Add these event-scoped manager routes. Each manager route calls requireSession, loads the event, and calls canManageEvent. It uses the event ID in the path as the ownership source, validates that the overlay belongs to that event, and returns 404 rather than leaking an overlay from another event.

    GET, POST  /api/events/[eventId]/broadcast-overlays
    GET, PATCH, DELETE  /api/events/[eventId]/broadcast-overlays/[overlayId]
    POST  /api/events/[eventId]/broadcast-overlays/[overlayId]/publish
    POST  /api/events/[eventId]/broadcast-overlays/[overlayId]/commands
    GET   /api/events/[eventId]/broadcast-overlays/[overlayId]/actions
    POST  /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens
    POST  /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens/[tokenId]/rotate
    DELETE /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens/[tokenId]

The commands route accepts one Zod discriminated-union command with an expectedRevision and a unique requestId. Valid pilot commands are SELECT_MATCH, SET_VISIBILITY, SET_SERVING_TEAM, SET_TIMEOUT_STATE, SHOW_STINGER, HIDE_STINGER, SET_REPLAY_STATE, ENTER_MANUAL_OVERRIDE, APPLY_MANUAL_PRESENTATION_CHANGE, RESUME_AUTOMATIC, and UNDO_BROADCAST_ACTION. The transaction must read the state row, reject a nonmatching expectedRevision with HTTP 409 and the latest safe snapshot, update state, append an action row, increment revision, and publish the resulting semantic event only after the transaction commits.

Add these public capability routes and no write route:

    GET   /overlay/[overlayId]
    GET   /api/public/broadcast-overlays/[overlayId]/snapshot
    POST  /api/public/broadcast-overlays/[overlayId]/stream-token
    WS    /api/realtime/broadcast-overlays

The Program Overlay URL shown to the operator is:

    https://bracket-iq.com/overlay/<overlayId>#token=<opaque-token>

The fragment is not sent with normal page requests or referrers. ProgramOverlayClient reads it once, keeps it in memory, and sends it only in an Authorization Bearer header to the snapshot and stream-token endpoints. Those endpoints hash the capability, require the exact overlay, a published and nonarchived overlay/event, an unrevoked unexpired token, and then return only MatchPresentationStateV1. The stream-token endpoint returns a signed ticket with scope broadcast-overlay-read, overlayId, and accessTokenId that expires in at most 60 seconds. The browser puts only that short-lived ticket in the WebSocket query string.

Every token-authorized response uses Cache-Control: no-store, Referrer-Policy: no-referrer, and X-Robots-Tag: noindex. Program and preview routes do not initialize analytics or third-party assets. New routes must use the existing error-redaction helper in src/server/http/errorLogging.ts and must not log a request URL or body containing a token.

Extend server.mjs with a separate WebSocket map, heartbeat, upgrade path, and ticket verifier for /api/realtime/broadcast-overlays. Do not weaken or repurpose /api/realtime/matches. Add a parallel broadcaster in src/server/realtime/broadcastOverlayRealtime.ts that uses Redis when configured and a process-local broadcaster when not configured. Its wire messages are:

    { type: "overlay.subscribed", overlayId, revision }
    { type: "overlay.state", overlayId, revision, state, event }
    { type: "overlay.revoked", overlayId, accessTokenId }

On token revocation, publish overlay.revoked through Redis and close every local connection associated with that accessTokenId. Ticket expiration prevents reconnects even if the revocation message is missed. ProgramOverlayClient reconnects with exponential backoff, obtains a fresh snapshot before accepting more events, ignores revisions lower than or equal to its applied revision, and renders reconnect snapshots without historical score animation.

## Plan of Work

## Milestone 0: Prove the shell and document the minimum live contract

Start by adding no product features beyond a narrowly scoped output-shell proof. Add middleware.ts with a matcher for /overlay/:path* and /broadcast-preview/:path*. The middleware adds an internal request header such as x-bracketiq-surface: overlay. Update src/app/layout.tsx to read that header with the App Router headers API. When it is overlay, return a bare html and body tree containing only children with a transparent overlay body class. The normal branch must remain byte-for-byte functionally equivalent: it keeps Mantine, Providers, profile completion, chat, assistant UI, footer, mobile prompt, and analytics.

Create a temporary Program Overlay page and a renderer harness backed only by safe fixture data. Verify by inspecting returned HTML that the bare branch has no ChatComponents, SiteFooter, MobileAppPrompt, AIAssistantDrawer, Google Analytics scripts, session UI, or opaque background. Delete any temporary fixture-only route when the real state client replaces it.

At the same time, identify every committed match mutation route. Start with the score route and the single-match PATCH/DELETE route, then use rg to find all saveMatches, prisma.matches.update, prisma.matches.delete, and publishEventMatchChanges calls. Record each producer in a short refresh matrix inside this plan before relying on it. The final implementation must call one broadcast projection refresh after every route that can change an overlay’s selected match, its score, lifecycle, bracket round, field, or participating teams.

This milestone is independently successful when a 1920 by 1080 page has a transparent body and only fixture overlay markup, and the normal site still renders all of its normal chrome.

## Milestone 1: Add validated persistence, access, and the presentation projection

Add the four models and migration described above. Add src/server/broadcast/overlayService.ts for CRUD and publication, src/server/broadcast/presentation.ts for hydration and safe projection, src/server/broadcast/tokens.ts for opaque-token generation and validation, src/server/broadcast/commands.ts for revisioned state commands, and src/server/broadcast/access.ts for event/overlay assertions. Keep route handlers thin: parse input, establish access, call the service, and translate known errors into JSON responses.

The projection must load the event and selected Match through the existing repository/service conventions, not by separately querying every raw table in a page. It maps sorted MatchSegments into set columns, derives completed winner state from winnerEventTeamId, takes current points from the current incomplete segment, derives sets won, and reads the match rule snapshot before resolved event or sport defaults. For Beach Volleyball, if no usable set configuration exists, the presentation fallback is exactly bestOf 3, setTargets [21, 21, 15], and winBy 2. Never mutate an existing event merely because the renderer used this fallback. Separately update src/server/defaultSports.ts and its tests so newly seeded Beach Volleyball carries segmentCount 3 and setPointTargets [21, 21, 15], preserving existing event-level overrides.

The presentation service decides point and match-point cues with the same target and two-point margin logic as src/lib/matchSetScoring.ts. It uses a deterministic long-name fallback: full display name, saved short name, condensed variable width, defined minimum font size, and ellipsis. It never uses a marquee. Missing logos collapse without leaving a visual gap. Color validation selects a safe neutral accent and readable foreground when a configured color is invalid or lacks contrast.

Automatic updates are refreshes, not blind state replacement. After a committed official match mutation, load a fresh projection. If manual override is off, write it as the effective presentation state. If manual override is on, write it only as automaticShadowState. Compare the previous effective state to the new automatic projection and append a semantic POINT_AWARDED, SERVE_CHANGED, SET_COMPLETED, MATCH_CHANGED, or SNAPSHOT_REFRESH action as appropriate. Increment revision only when an effective state or material shadow state changes.

Archive and delete handling is part of the milestone. Extend src/server/deletion/archivePolicy.ts so archiving an event archives its overlays and revokes access tokens. Hard-delete cleanup removes actions, tokens, state, then overlays before the event. If an active selected match is deleted, clear activeMatchId, publish a nonanimated state, and leave a useful producer-visible status.

This milestone is independently successful when a service test creates an overlay, projects a three-set beach match from persisted segments, increments state revisions correctly, rejects cross-event access, revokes a token, and archives an overlay when its event archives.

## Milestone 2: Deliver the private Studio and a trustworthy Compact Scorebug preview

Add broadcastOverlays to AdminTab in src/app/admin/AdminDashboardClient.tsx. Follow the AdminAffiliateImportsPanel pattern: mount a separate src/app/admin/AdminBroadcastOverlaysPanel.tsx, pass active and refresh key props, and do not grow the existing large dashboard component with Studio logic. The panel may use the existing Admin events endpoint to find events during the platform-admin pilot, but all overlay reads and writes use the event-scoped manager APIs.

The Studio begins with a list of overlays for the selected event and a clear Create overlay action. The edit surface has focused sections rather than an unrestricted design canvas: Match and event, Template, Visibility, Branding, Content, Position, Motion, and Output. Draft changes update only draftConfig. A deliberate Publish changes action copies validated draftConfig to publishedConfig, increments publishedConfigRevision and state revision, records a PUBLISHED_CONFIG action, and then notifies connected Program Overlays. The panel always labels whether the preview is Draft or Live.

Build reusable renderer code outside Admin:

    src/components/broadcast/ProgramOverlayClient.tsx
    src/components/broadcast/BroadcastOverlayRenderer.tsx
    src/components/broadcast/templates/CompactScorebug.tsx
    src/components/broadcast/templates/CenterCourt.tsx
    src/components/broadcast/templates/ChampionshipRibbon.tsx
    src/components/broadcast/broadcastOverlay.module.css
    src/components/broadcast/usePresentationStream.ts

All three templates consume the same strict configuration and presentation interfaces. Only Compact Scorebug is exposed as production-ready in this milestone. Center Court and Championship Ribbon render against fixtures and stay marked preview until their own visual and OBS checks pass. Use the existing motion package for semantic transform-and-opacity animations. Use no expensive filter or motion blur in normal score updates. A Broadcast performance mode and reduced-motion setting remove optional shadow, blur, and elaborate entrance effects.

The Admin preview must be an iframe to the same bare Program Overlay renderer rather than a duplicate card implementation. It uses a short-lived authenticated preview ticket, never a persistent program token. Include a stress-test switch that loads long names, missing logos, similar colors, 28–27 scores, three completed sets, a four-digit timer, and non-Latin names.

This milestone is independently successful when a platform administrator can publish Compact Scorebug styling, the admin preview changes only after explicit publish, all long-name/missing-logo fixtures remain legible, and no preview can accidentally use a real token.

## Milestone 3: Add the Program Overlay, snapshot/realtime delivery, and the OBS setup path

Replace the fixture harness with src/app/overlay/[overlayId]/page.tsx and ProgramOverlayClient. The Program Overlay starts blank and transparent while it obtains a snapshot. It uses the hash capability to request the strict snapshot, opens the dedicated socket with a short-lived ticket, and renders only publishedConfig plus presentation state. It must not make manager API calls, expose token text, write cookies, render controls, or fall back to a normal app layout.

Add client behavior that ticks elapsed time locally from startedAt, pausedAt, and elapsedBeforePauseMs. It does not write a score or timer to the database each second. Periodic snapshots reconcile clock drift. When a snapshot has the same or older revision, it updates no animation state. When an event is one revision higher, it triggers only the semantic animation in its event field. When it observes a gap, it fetches a new snapshot, applies it without replaying point animations, and returns to the stream.

Add a copyable OBS setup instruction panel in Admin:

1. Set the OBS Base Canvas to 1920 by 1080 for the first live test; use 3840 by 2160 only after the 1080p test passes.
2. Add a Browser Source named BracketIQ Program Overlay.
3. Paste the published Program Overlay URL, set its width and height to the canvas size, and put it above the camera source.
4. Enable custom 60 FPS only when the production computer can sustain it.
5. Leave Shutdown source when not visible and Refresh browser when scene becomes active off for normal operation so a scene switch does not discard the connection and reanimate old updates.
6. Open the separate authenticated Control Room URL as an OBS Custom Browser Dock when dock controls are wanted.

The output page needs no custom CSS from an operator because it owns transparent-background CSS. Its program responses are dynamic and no-store; images and fonts may be cached safely. Add a visible but nonstreaming connection status only in the private Admin preview and Control Room. The Program Overlay silently retains the last known valid state while reconnecting, unless the producer expressly enables a fault indicator in configuration.

This milestone is independently successful when two Browser Source-sized program clients receive one current score update, a refreshed client obtains the latest snapshot without playing a historic animation, and revoking the token closes the live clients and prevents a reconnection.

## Milestone 4: Add the Control Room and defend the official-score boundary

Create a Control Room component under src/components/broadcast and expose it from the Admin panel during the pilot. It has large unambiguous buttons for show/hide scoreboard, stingers, active match, serving indicator, timeout indicator, and a compact state/connection display. A destructive action such as reset, entering manual override, or token rotation requires a clear confirmation. Normal visibility and stinger buttons confirm promptly without a modal.

In AUTOMATIC mode, do not write scores into BroadcastOverlayStates as official data. First extract the existing score mutation logic from src/app/api/events/[eventId]/matches/[matchId]/score/route.ts into a tested server service that both the route and an eventual control command can use. That service must preserve its existing event lock, started-match check, team membership, official/manager access, segment validation, set-target and win-by-two behavior, and raw match publication. Only then may a control-room score button invoke it on behalf of the authenticated actor, followed by a fresh projection refresh. If extraction cannot be completed safely in the pilot, hide score-edit buttons and direct officials to the established match score UI instead.

Manual override changes only the effective presentation state. Entering it captures the current automatic revision and state, requires a reason, shows a persistent amber Manual override chip in the private control UI, and keeps automatic updates in automaticShadowState. Undo applies only an action from the same overlay and expected revision. Resume automatic presents the latest automatic shadow state before the operator chooses it; it writes a RESUMED_AUTOMATIC action and clears override metadata. A future Commit correction as official command remains disabled until it can call the extracted official scoring service and pass all ordinary score authorization and validation.

Implement an OBS bridge adapter with runtime feature detection for window.obsstudio. The Control Room shows OBS unavailable outside an OBS dock. It can read replay-buffer status when permission allows, calls window.obsstudio.saveReplayBuffer() only when BASIC control is granted, and responds to the replay-buffer event to report success. It must not start or stop streaming, change scenes, open localhost WebSockets, locate a replay file, trim a clip, or promise automatic replay playback.

This milestone is independently successful when an authenticated operator can change only broadcast state through ordinary controls, sees state confirmed on the program renderer, cannot accidentally enter manual override, and cannot bypass existing official scoring protection.

## Milestone 5: Complete the first live-test verification and prepare the future organizer surface

Run the full regression and production checklist. In a staging environment with Redis, connect Program Overlay clients to two server processes and prove a committed update reaches both. Run a 1080p Browser Source at the intended production computer’s frame rate, record the actual CPU/GPU behavior, and test 4K only with Broadcast performance mode. Use a clean seeded beach-volleyball fixture with realistic teams and participants; never use test automation names or emails in screenshots or live-test materials.

After the pilot passes, create a separate follow-on ExecPlan for the organizer-facing entry. It should add a distinct broadcast.manage organization permission rather than granting all event managers permanent production authority implicitly. Its likely home is an event-owned route such as src/app/events/[id]/broadcast/page.tsx, while the unlisted Program Overlay route and event-scoped APIs remain unchanged.

## Concrete Steps

All commands below run from C:\Users\samue\.codex\worktrees\ac2b\mvp-site.

1. Before starting implementation, reread this file and PLANS.md. Check the worktree:

       git status --short

2. Implement Milestone 0. Verify the isolated shell with focused route/layout tests before adding schema changes.

3. Implement Milestone 1. Update prisma/schema.prisma, create the additive migration, run:

       npx prisma validate
       npx prisma migrate status
       npx prisma generate

   If migration history prevents a safe local dev migration, do not reset a populated database. Generate a reviewed additive migration using prisma migrate diff and record the result in Surprises & Discoveries.

4. Implement the server broadcast tests, then run focused suites in serial:

       npm test -- --runInBand --runTestsByPath "src/server/broadcast/__tests__/presentation.test.ts"
       npm test -- --runInBand --runTestsByPath "src/server/broadcast/__tests__/commands.test.ts"
       npm test -- --runInBand --runTestsByPath "src/server/broadcast/__tests__/tokens.test.ts"
       npm test -- --runInBand --runTestsByPath "src/server/realtime/__tests__/broadcastOverlayRealtime.test.ts"
       npm test -- --runInBand --runTestsByPath "src/lib/__tests__/matchSetScoring.test.ts"

5. Implement the Admin and renderer portions. Run:

       npm test -- --runInBand --runTestsByPath "src/app/admin/__tests__/AdminBroadcastOverlaysPanel.test.tsx"
       npm test -- --runInBand --runTestsByPath "src/components/broadcast/__tests__/BroadcastOverlayRenderer.test.tsx"

6. Implement manager, public capability, and program page routes. Run the route tests with --runTestsByPath because square-bracket route folders are otherwise interpreted as Jest patterns:

       npm test -- --runInBand --runTestsByPath "src/app/api/events/[eventId]/broadcast-overlays/__tests__/route.test.ts"
       npm test -- --runInBand --runTestsByPath "src/app/api/public/broadcast-overlays/[overlayId]/__tests__/snapshot.test.ts"
       npm test -- --runInBand --runTestsByPath "src/app/overlay/[overlayId]/__tests__/page.test.tsx"

7. Start the custom server rather than only next dev so the WebSocket upgrade path exists:

       npm run dev:plain

   Open the private Admin tab, create a fixture overlay, publish it, and load its Program Overlay URL in two browser windows at 1920 by 1080. Change the real fixture score through the established match score path. Observe exactly one semantic score animation on each connected output. Refresh one output and observe the current score with no replayed point animation.

8. Run the complete automated confidence set:

       npm run test:ci
       npx tsc --noEmit
       npm run build
       node --check server.mjs
       git diff --check

9. Run the OBS manual procedure from Milestone 3. Record the OBS version, operating system, output resolution, configured Browser Source FPS, performance-mode setting, and any frame drops in this plan’s Artifacts and Notes. If Redis is available, repeat with two server instances to verify cross-process fanout.

## Validation and Acceptance

The feature is acceptable for the first live test only when all of the following observable statements are true:

- A platform administrator can create an overlay for a selected event, edit its draft, see Draft status in the Studio, publish intentionally, and see only the published configuration in the Program Overlay.
- A Program Overlay HTML response is transparent and contains no footer, chat, mobile prompt, admin UI, analytics, visible token, or control button.
- An unrevoked opaque capability can read only the matching published overlay’s sanitized snapshot. A malformed, expired, revoked, wrong-overlay, or archived-event capability returns an authorization error and never receives a raw Match, Event, UserData, action audit, or manager field.
- Two output clients receive a newly committed score change at the same higher revision. Each plays one score transition. A reconnecting client restores the latest state without replaying prior animations.
- Beach volleyball displays three set columns, correctly recognizes 21–19, 22–20, and deciding 15-point set outcomes, and keeps win-by-two behavior correct at deuce scores such as 28–27.
- Very long names follow the defined fallback, missing logos do not create empty gaps, unsafe color combinations fall back to readable treatment, and tabular score numerals do not shift horizontally.
- A match switch never briefly pairs the old team names with the new score.
- Browser Source refresh restores a complete current state. Connection loss does not replace it with a public database error message.
- The Control Room can change only permitted broadcast state, records an action with actor/time/revision, and shows manual override clearly. A manual override cannot be entered by one accidental score click.
- Normal official score actions continue to use the existing score/lifecycle checks. No BroadcastOverlayStates update alone can alter official Matches or MatchSegments.
- The OBS dock reports whether its bridge and replay buffer are actually available. Save Replay Buffer is disabled outside a permitted OBS dock and does not imply replay playback.
- 1080p remains stable in the representative OBS production test. 4K is used only after the reduced-effects performance check passes.

## Idempotence and Recovery

All database work is additive. Re-running focused tests, type checks, generation, and build commands is safe. Creating or publishing an overlay uses request IDs and expected revisions, so a retried command cannot apply a second conflicting state mutation. Token rotation is transactional: if the transaction fails, the original token remains valid; if it succeeds, the old token is revoked and connected clients are closed.

If a later code change makes the Program Overlay route render normal site chrome, stop the release and restore the bare-root-layout test before testing OBS. If Redis is unavailable in local development, the feature can use the existing process-local broadcast fallback, but the plan is not complete until the staging multi-process check passes. If a migration step fails due to existing environment drift, do not reset a shared or live database; inspect migration status, generate the smallest additive SQL diff, and record the discovery in this document.

No token shown in an OBS setup dialog should be copied into a ticket, issue, screenshot, test fixture, or server log. Rotate the token immediately if this happens.

## Artifacts and Notes

Official behavior relied upon in this plan:

- The OBS Browser Source guide confirms that Browser Source has configurable viewport dimensions and custom FPS, supplies transparent body CSS by default, and can remain loaded across scene visibility changes. Source: https://obsproject.com/kb/browser-source
- The obs-browser README confirms that browser docks expose window.obsstudio, replay-buffer events, control levels, and the BASIC-permission saveReplayBuffer call. Source: https://github.com/obsproject/obs-browser/blob/master/README.md

Expected focused-test evidence after implementation will resemble:

    PASS src/server/broadcast/__tests__/presentation.test.ts
    PASS src/server/broadcast/__tests__/commands.test.ts
    PASS src/server/broadcast/__tests__/tokens.test.ts
    PASS src/server/realtime/__tests__/broadcastOverlayRealtime.test.ts

    Test Suites: 4 passed, 4 total

Expected final checks:

    npx tsc --noEmit
    exited successfully

    npm run build
    exited successfully

Populate this section with actual commands, short success output, screenshot locations, OBS configuration evidence, and any implementation-specific caveats as the work advances.

## Interfaces and Dependencies

No new runtime package is required for the first pilot. The repository already has Zod for schema validation, ws for the custom WebSocket server, Redis support for cross-process fanout, and motion for semantic client animations. Do not add a drag-and-drop editor package, an external realtime vendor, or a replay automation package in the initial implementation.

src/server/broadcast/presentation.ts must export:

    buildMatchPresentationState(input: {
      overlay: BroadcastOverlayRecord;
      state: BroadcastOverlayStateRecord;
      eventId: string;
      matchId: string | null;
    }): Promise<MatchPresentationStateV1>

    refreshBroadcastPresentationForEvent(input: {
      eventId: string;
      changedMatchIds?: string[];
      reason: "OFFICIAL_MATCH_CHANGE" | "SCHEDULE_CHANGE" | "MATCH_DELETE";
    }): Promise<void>

src/server/broadcast/commands.ts must export:

    applyBroadcastOverlayCommand(input: {
      eventId: string;
      overlayId: string;
      actorUserId: string;
      command: BroadcastOverlayCommand;
    }): Promise<{
      state: MatchPresentationStateV1;
      action: BroadcastOverlayAction;
    }>

src/server/broadcast/tokens.ts must export:

    createBroadcastOverlayAccessToken(input: {
      overlayId: string;
      createdByUserId: string;
      label?: string;
      expiresAt?: Date | null;
    }): Promise<{ token: string; tokenRow: BroadcastOverlayAccessToken }>

    validateBroadcastOverlayAccessToken(input: {
      overlayId: string;
      token: string;
    }): Promise<ValidatedBroadcastOverlayAccess>

    revokeBroadcastOverlayAccessToken(input: {
      overlayId: string;
      tokenId: string;
      revokedByUserId: string;
      reason?: string;
    }): Promise<void>

src/server/realtime/broadcastOverlayRealtime.ts must export a broadcaster that sends only BroadcastOverlayRealtimeMessage and a revocation publisher. server.mjs must verify a signed socket ticket with scope broadcast-overlay-read and must never accept the raw opaque token at WebSocket upgrade.

src/components/broadcast/usePresentationStream.ts must expose a client hook that takes an overlay ID and opaque capability from the URL fragment, starts with GET snapshot, reconnects with exponential backoff, applies only higher revisions, and exposes a connection state only to private preview/control UI. BroadcastOverlayRenderer receives already-sanitized state and config; it must have no API, authentication, or mutation responsibilities.

Revision note: Created after repository and official OBS capability research. The important implementation choices are event-scoped APIs, a published/draft split, a narrow revisioned presentation contract, an opaque revocable Program Overlay capability, a bare React output shell, and a Compact Scorebug-first rollout.
