# Comprehensive Code Audit Tracker

Status: **complete — identification and reporting only**

This is the durable tracker for the code-only audit of `mvp-site` and the Android/shared portions of `mvp-app`. It records coverage, runtime evidence, confirmed defects, code smells, legacy compatibility, data-model risks, and follow-up candidates. Production code is not changed as part of this audit. Apple iOS/watchOS platform-only code is excluded at the user's direction.

## Live remediation ledger

The per-finding `Fix status` lines below capture the state at the time of the
original audit. This ledger is the current remediation source of truth while
the report is being reconciled. A finding is counted as completed only after a
committed implementation and focused regression evidence; runtime evidence is
recorded where the affected surface is reachable.

| Status | Finding IDs | Evidence |
| --- | --- | --- |
| **Completed — critical (34)** | `SEC-001`, `SEC-009`, `SEC-011`, `SEC-012`, `SEC-014`, `SEC-015`, `SEC-017`, `SEC-018`, `DB-001`, `SEC-020`, `SEC-023`, `SEC-027`, `SEC-028`, `SEC-029`, `SEC-030`, `SEC-043`, `SEC-044`, `TEST-007`, `DATA-018`, `DATA-021`, `DATA-024`, `DATA-025`, `DATA-026`, `DATA-027`, `DATA-029`, `APP-076`, `APP-078`, `APP-091`, `APP-100`, `APP-108`, `APP-112`, `APP-119`, `APP-120`, `APP-122` | Server and mobile critical-remediation commits, including `a5ce0257`, `1731ad84`, and `a2ba3569`; focused regression suites and the subsequent broad web/mobile test runs. |
| **Completed — high (23)** | `SEC-002`, `SEC-003`, `SEC-004`, `SEC-005`, `SEC-006`, `SEC-007`, `SEC-008`, `SEC-010`, `SEC-013`, `SEC-016`, `SEC-019`, `SEC-021`, `SEC-022`, `SEC-039`, `DATA-019`, `DATA-020`, `DATA-001`, `DATA-002`, `DATA-003`, `DATA-004`, `DATA-005`, `DATA-006`, `DATA-010` | `a5ce0257`, `1731ad84`, `36e1afd6`, `3ed10d0f`, `1aaafb77`, `aafb360f`, `696bf484`, `58466c56`, `79db2c13`, `b3826149`, `d5d6592e`, `2401d0ee`, `3ce1ffac`, `caab4a9c`, `81bff7fa`, `4ca35a13`, `c3be4fc1`, `99d84287`, `4b271007`, `c5de7fbb`, `7ccf037a`, `c38269b0`, `de9bf54d`, `c03e8a94`, `9c294b38`, `4b654c55`. Android and iOS focused tests passed; the Room v90→v91 path passed eight Android instrumented tests and the installed Android app launched without a migration failure. |
| **Completed — other severity (1)** | `DATA-013` | Current dependency declarations and generated client were revalidated at Prisma 7.8.0; `c38269b0` makes that version alignment an explicit build preflight. |
| **Remaining / not yet reconciled (169)** | All other headings in this report | Do not infer completion from an old or partial implementation. Each item must receive a current-source review, a focused regression test where code changes, and browser/emulator evidence when reachable. |

Current strict count: **58 completed, 169 remaining or not yet reconciled, 227 total findings**. This count deliberately excludes any pre-existing change that has not yet been revalidated against the current audit scenario.

## Baseline and scope

| Repository | Baseline | Branch | Code files in ledger |
| --- | --- | --- | ---: |
| `mvp-site` | `68ad8d47fdd6c3644b92de0523b4db74eb22b326` | `main` | 1,581 |
| `mvp-app` | `680c96c0` | `master` | 759 |
| **Total** | | | **2,340** |

The per-file source ledger is [`file-coverage.tsv`](file-coverage.tsv). Each row includes the baseline commit and Git blob hash so later code changes cannot silently inherit an earlier review result. The inventory can be regenerated with `scripts/audit/generate-code-audit-inventory.ps1`.

Included in per-file review:

- First-party TypeScript, TSX, JavaScript, Kotlin, Java, SQL, Prisma, CSS, and shell/build scripts.
- Tests, API handlers, migrations, manifests, build files, and behavior-defining configuration.
- Generated first-party code as a separate class; it must be traced to and compared with its generator/source of truth rather than assumed correct.

Excluded from per-file review:

- Prose documentation, images, screenshots, fonts, marketing assets, and binary contents.
- Third-party/vendor source such as `iosApp/Pods/**`.
- Generated caches and build outputs.
- Apple-platform-only code and configuration under `iosApp/**` or an `iosMain` source set. Shared `commonMain` behavior remains in scope when it affects Android.

Legacy rule used by this audit: version `1.6.13` is the compatibility floor. Production compatibility paths that exist only for clients older than `1.6.13` are cleanup candidates. Version literals in tests are not considered legacy defects until a production path relying on them is proven.

## Completion rules

The audit is not complete until all of the following are true:

1. Every ledger row has a final disposition: `static-reviewed`, `runtime-verified`, `generated-verified`, `needs-followup` with a documented finding, or a documented exclusion/reason. No row may remain `pending`.
2. Every web page and meaningful state has desktop and mobile-viewport runtime evidence where reachable, including authenticated, organization, event, team, admin, billing, error, and empty states.
3. Every mobile navigation destination and meaningful state has Android emulator evidence where reachable, including process logs and UI-tree-derived interactions.
4. Every API family has auth/permission, validation, error, and source-of-truth review.
5. Prisma schema and migrations are reconciled with mobile Room/models/DTOs and live/local database structure where access is available.
6. All compatibility branches and aliases are assigned to `>=1.6.13 required`, `pre-1.6.13 removable`, or `not version-related`, with evidence.
7. A final re-inventory against both current HEADs shows no new or changed code without a disposition.

Ledger statuses:

| Status | Meaning |
| --- | --- |
| `pending` | Not yet inspected. |
| `static-reviewed` | Read in context and checked for behavior, contracts, security, data ownership, legacy paths, and test coverage. |
| `runtime-verified` | Static review plus direct browser/emulator exercise of the relevant behavior. |
| `generated-verified` | Generator and generated output relationship verified; no manual source-of-truth drift found. |
| `needs-followup` | The file was reviewed and is associated with a documented defect, risk, or remediation item. This is a terminal audit disposition, not a claim that production remediation is complete. |
| `excluded` | Not first-party behavior code, with the reason recorded. |

## Coverage snapshot

Current ledger disposition: all **2,340** in-scope inventory rows have a terminal disposition and **0 are pending**. `mvp-site` has 1,207 static-reviewed, 91 generated-verified, 143 runtime-verified, 135 needs-followup, and 5 excluded rows. `mvp-app` has 488 static-reviewed, 2 generated-verified, 5 runtime-verified, 183 needs-followup, and 81 excluded rows. `needs-followup` identifies reviewed files connected to a documented finding; it does not mean the file remains unread.

### `mvp-site`

| Kind | Files | Reviewed | Runtime verified |
| --- | ---: | ---: | ---: |
| Web route/page | 46 | 46 | 0 |
| API route | 268 | 268 | 0 |
| Tests | 391 | 391 | n/a |
| Migrations | 143 | 143 | 142 |
| Generated Prisma | 91 | 91 | n/a |
| Other source/config/scripts/styles | 642 | 642 | 1 |

Initial route inventory: 46 `page.tsx` files, 266 handlers named `route.ts`, and 2 layouts. The handler/category counts differ slightly because non-API route handlers are classified as API-like executable routes in the ledger.

### `mvp-app`

| Kind | Files | Reviewed | Runtime verified |
| --- | ---: | ---: | ---: |
| First-party source | 575 | 575 | 5 |
| Tests | 130 | 130 | n/a |
| Config/build | 52 | 52 | n/a |
| Scripts | 2 | 2 | n/a |

Initial first-party UI-name inventory found 52 files whose names end in or contain `Screen`, `View`, `Activity`, `App`, or `Component`. This is only a discovery heuristic and includes a few suffix collisions; navigation and nested composables still require explicit coverage.

## Runtime test matrix

| ID | Surface/flow | Environment | State | Evidence/result |
| --- | --- | --- | --- | --- |
| WEB-ENV-001 | Browser tooling | In-app Browser plugin | complete | The Browser skill and in-app Chromium runtime completed direct DOM, console, screenshot, desktop, and 390×844 viewport checks against the local application. Browser tabs were finalized after testing. |
| WEB-ENV-002 | Local app and database readiness | Windows local checkout | complete | Postgres container is healthy; dependencies were synchronized from the lockfile; custom Next server returns HTTP 200 on `http://localhost:3000`. |
| WEB-FLOW-001 | Landing → guest session → onboarding | Chromium, desktop and 390×844 | issue reproduced | Correct title/H1, meaningful body, and responsive mobile navigation rendered. The guest CTA wrote local storage and reached `/onboarding`, but the mounted auth provider retained `isGuest=false`; onboarding displayed “Redirecting…” and returned to `/login`. The login-page guest CTA also remained on `/login` (APP-134). |
| WEB-FLOW-002 | Discover filters and local data readiness | Chromium, desktop | issues reproduced | Discover rendered meaningful structure, but duplicate canonical sport names produced two “Indoor Volleyball” checkboxes and repeated duplicate-key warnings (DATA-031). Event-tag and event-search failures were traced to the already documented stale local schema (APP-025), not a distinct route defect. |
| AND-ENV-001 | Emulator discovery | ADB 36.0.0 | complete | No device was initially running. Available AVDs: `Pixel_9_Pro_XL_API_35`, `Pixel_Tablet`. |
| AND-ENV-002 | Build/install/launch current HEAD | Pixel 9 Pro XL API 35 | superseded failure | The repository-pinned JetBrains Runtime 21 failed in `:core:database:kspDebugKotlinAndroid` with `NoClassDefFoundError: sun.awt.PlatformGraphicsInfo`; see AND-ENV-003 for the successful current-HEAD retry. |
| AND-FLOW-001 | Launch → email auth → signup → DOB picker | Pixel 9 Pro XL API 35, installed 1.5.13 | superseded evidence | Initial stale-build evidence was retained only as history; AND-FLOW-002 repeats the flow against current HEAD. |
| AND-ENV-003 | Build/install/launch current HEAD retry | Pixel 9 Pro XL API 35 | pass with environment override | Retrying the same checkout with Temurin JDK 17 and headless AWT installed successfully. Package inspection confirms current `1.6.14`, versionCode 67. |
| AND-FLOW-002 | Launch → email auth → signup → DOB picker | Pixel 9 Pro XL API 35, installed 1.6.14 | issue reproduced | Current HEAD login/signup render and respond using UI-tree-derived taps. On 2026-07-10 the picker exposed 2026-07-11 as clickable and retained `2026-07-11` after confirmation. Startup logcat also recorded deletion of Room schema 23 before creation of schema 32. Captures are under `%TEMP%/mvp-code-audit`. |
| AND-FLOW-003 | Mobile registration against local API | Pixel 9 Pro XL API 35 + isolated fully migrated PostgreSQL | issue reproduced | Registration wrote the AuthUser/profile/sensitive rows, then verification-email delivery failed. The API returned HTTP 500 and the mobile UI returned to the completed form even though the account now exists. |
| AND-FLOW-004 | Unverified login → Discover guide/tabs/map → Chats → Schedule → Home | Pixel 9 Pro XL API 35 + isolated database | issues reproduced | Unverified login received full authenticated access. All five Discover guide steps, four tabs, empty map, bottom navigation, schedule filters, and Home rendered. Chats and Event Management lacked empty states; chat errors are not connected to UI. |
| AND-FLOW-005 | Home profile/billing/notifications/teams/Stripe/bills/create-event | Pixel 9 Pro XL API 35 + isolated database | partial with issues | Profile, billing-address dialog, notifications, team empty/create, bills, Stripe action, terms consent, event basics/sport/location/division creation were exercised. Stripe showed only `Invalid redirect url`; creation forms showed eager errors; location confirmation depended on unlabeled markers. The system photo picker returned without an upload or error, leaving mandatory-image validation unresolved; final creation remains pending. |
| AND-FLOW-006 | Home memberships/templates/children/invites/connections/discounts/documents/refunds | Pixel 9 Pro XL API 35 + isolated database | pass with issues | Every remaining Home action and its empty/create dialog state was opened. Empty states were present. Child creation repeated the future-DOB defect; Event Templates had no empty-state guidance or creation route; debug-only controls were correctly gated by `Platform.isDebugBuild`. |
| AND-ENV-004 | Wear build/test/runtime availability | Temurin JDK 17 + Pixel 9 Pro XL API 35 | build/tests pass; watch runtime constrained | `:wearApp:testDebugUnitTest` and `:wearApp:assembleDebug` passed (7 tests). No Wear OS AVD/system image is configured, so round-screen/performance claims remain pending. The Wear APK was installed only for constrained activity rendering, then the 1.6.14 phone APK was restored and its authenticated Discover state reverified. |
| AND-FLOW-007 | Wear login/demo officiating surfaces | Debug Wear activity on phone emulator | partial with issues | UI-tree-derived interaction covered blank-login validation and Action → Incidents → Edit incident → Team/Player/Time. Debug routes rendered Matches, Match Detail, Timer, and score surfaces. This confirmed unlabeled login fields and the `073:52` clock; layout/performance evidence is not promoted because the device is not Wear OS. Captures are under `%TEMP%/mvp-code-audit`. |
| AND-ENV-005 | Fresh current-HEAD cold start | Pixel 9 Pro XL API 35, freshly built/installed v1.6.14 | issue reproduced | `:composeApp:installDebug` succeeded, but two cold launches ANRed before `MainActivity` displayed. The system trace attributes the main-thread stall to eager Koin `UserRepository` resolution and Ktor/SLF4J `ServiceLoader` scanning inside `MvpApp.onCreate` (APP-135). |

## Confirmed findings

### SEC-001 — Any authenticated user can create bills for arbitrary owners and spoof the actor

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/billing/bills/route.ts:135-151` requires a session but accepts caller-controlled owner and amount data. The team normalization at `:185-205` performs no membership or manager authorization. `:325-355` persists the bill and `:341` prefers caller-supplied `user.$id` over the authenticated session for `createdBy`.
- Impact: an ordinary account can create financial liabilities for arbitrary known user/team/organization identifiers and misattribute who created them.
- Test evidence: `src/app/api/billing/__tests__/billsRoute.test.ts:47-115` exercises ordinary-user team bill creation without authorization fixtures; no denial case covers an unrelated team.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` requires owner authority for every bill creation and records the authenticated session user as `createdBy`; its regression suite denies unrelated team/user/organization billing and spoofed actors. The current focused billing suite passed, including the creation-denial tests.

### SEC-002 — Bill and payment records have unauthenticated or under-authorized read paths

- Severity: **high**
- Repository: `mvp-site`
- Evidence:
  - `src/app/api/billing/bills/[id]/route.ts:8-21` returns a bill and discount summary without calling `requireSession` or an access assertion.
  - `src/app/api/billing/bills/[id]/payments/route.ts:7-13` returns all payments for a caller-supplied bill ID without authentication.
  - The list handler protects `USER` and `ORGANIZATION` at `src/app/api/billing/bills/route.ts:67-78`, but the `TEAM` branch at `:80-105` looks up related team IDs and returns bills without checking membership/management.
- Impact: bill amounts/status/metadata and payment records can be disclosed by known or guessed IDs; any logged-in user can enumerate another team's bills.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` requires a session and `canManageBillPayment` for individual bills and payment installments, and scopes TEAM bill lists through the team manager roles. `1731ad84` additionally converts an unauthenticated list request from a server error into a proper 401 before any owner lookup. The current 17-test billing-read suite and a freshly built release server on port 3001 returned 401 for unauthenticated bill, payment, and TEAM-list probes. The public `bracket-iq.com` deployment still served the pre-fix payment path during this audit and must be released before this is considered a live closure.

### SEC-003 — Manual payment-proof images are public by file ID

- Severity: **high**
- Repository: `mvp-site`
- Evidence:
  - Generic file download and preview handlers perform no authentication or ownership checks (`src/app/api/files/[id]/route.ts:21-53`, `src/app/api/files/[id]/preview/route.ts:28-65`).
  - `prisma/schema.prisma:1464-1478` links `BillPaymentProofs.fileId` to uploaded payment evidence; `src/server/billing/billPaymentActions.ts:739-770` persists that relationship.
  - Authorized billing output constructs the same public generic URL at `src/app/api/events/[eventId]/teams/[teamId]/billing/route.ts:207-213`.
  - `src/app/api/files/__tests__/fileRoutes.test.ts:171-194` intentionally asserts unauthenticated serving, so this is current behavior rather than an untested omission.
- Impact: receipts, payment screenshots, or other private proof images can be retrieved without a session when a file ID leaks.
- Fix status: **completed in the audited branch; production deployment pending**. `36e1afd6` adds `assertFileReadAccess` to generic download and preview handlers. It keeps ordinary public media readable but requires the proof uploader or an authorized bill manager for a `BillPaymentProofs.fileId`, before storage is read. The focused access and route suites passed 20 tests, including anonymous denial, unrelated-user denial, authorized-manager access, and both download/preview short-circuit checks.

### SEC-004 — Time-slot create/update/delete checks identity but not ownership

- Severity: **high**
- Repository: `mvp-site`
- Evidence: POST only calls `requireSession` before persisting caller-controlled field/slot data (`src/app/api/time-slots/route.ts:271-321`). PATCH loads and updates any slot ID after the same identity-only check (`src/app/api/time-slots/[id]/route.ts:184-210`, `:330-360`). DELETE similarly authorizes no field/event/organization owner (`:363-380`).
- Data-model concern: the `TimeSlots` record does not provide an obvious durable owner/organization/creator field, so the canonical authorization scope is unclear and must be derived consistently from attached resources.
- Impact: an authenticated user with a known slot ID can alter or remove scheduling/rental inventory outside their organization.
- Fix status: **completed in the audited branch; production deployment pending**. `3ed10d0f` derives ownership from each scheduled field's organization/facility or standalone creator, and field-less legacy slots require management of every linked event. POST checks every requested field, while PATCH/DELETE check the persisted slot before mutation; reassignments are separately checked. The 22 focused access/route tests passed, covering unrelated callers, archived/missing fields, facility-owned fields, multi-event legacy slots, and all three mutation methods.

### SEC-005 — Filterless refund-request query exposes all refund rows to any account

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/refund-requests/route.ts:11-33` authorizes only when optional `userId`, `hostId`, or `organizationId` filters exist. With no filter, `:35-47` builds a global query and returns up to the requested limit.
- Impact: any authenticated user can read refund records across users, hosts, and organizations.
- Test gap: filtered denial cases exist, but no filterless isolation case establishes the intended behavior.
- Fix status: **completed in the audited branch; production deployment pending**. The list route now treats an unscoped non-admin request as the caller's personal refund inbox, while explicit host and organization scopes require the corresponding management authority. The focused route suite passed all 12 tests, including filterless isolation and denied cross-host/organization requests.

### SEC-006 — Batch registration-response authorization checks only one returned row

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/registration-question-responses/route.ts:54-67` loads all requested subject IDs, derives scope only from `responses[0]`, authorizes that scope, and returns the entire array. The helper uses an unordered `findMany` across all IDs (`src/server/registrationQuestions.ts:373-388`).
- Impact: mixing one managed subject with subjects from other scopes can disclose registration answers from events/teams the caller cannot manage.
- Fix status: **completed in the audited branch; production deployment pending**. `1aaafb77` derives every distinct durable event/team scope represented in a batch and authorizes all of them before returning any response. The focused seven-test suite passed, including mixed managed/unmanaged batches in both database orders and malformed/missing scope denial.

### SEC-007 — Schedule/realtime endpoints expose unpublished and private event operations

- Severity: **high**
- Repository: `mvp-site`
- Evidence:
  - Unauthenticated match handlers filter out only `TEMPLATE` (`src/app/api/matches/route.ts:60-82`, `src/app/api/fields/[id]/matches/route.ts:98-111`).
  - Unauthenticated `src/app/api/events/field/[fieldId]/route.ts:433-618` also excludes only `TEMPLATE`, then returns linked slots and pending/confirmed rental occupancy, price, and synthetic private rental events.
  - `src/app/api/realtime/matches/token/route.ts:12-14,48-65` protects `UNPUBLISHED`/`DRAFT`/`TEMPLATE` but omits the real `PRIVATE` enum, allowing any authenticated user a realtime token for a known private event.
  - The schema has `UNPUBLISHED` and `PRIVATE` states (`prisma/schema.prisma:75-80`), while the canonical public-search filter permits only `PUBLISHED`/null (`src/server/publicSearchPages.ts:13`, `:483-489`).
- Impact: private or draft schedules, participants, exact occupancy/times/prices, locations, and live match updates can leak through known event/field IDs.
- Test concern: existing privacy tests codify only template exclusion, leaving the broader state mismatch unguarded.
- Fix status: **completed in the audited branch; production deployment pending**. `aafb360f` centralizes event-state visibility for match and field calendar reads, including `PRIVATE`; the realtime token path requires event-manager authority for `UNPUBLISHED`, `DRAFT`, `PRIVATE`, and `TEMPLATE` states. Sixteen focused visibility tests passed across public matches, both field schedules, private realtime tokens, and the shared resolver. `696bf484` adds a standalone private-field-match regression outside the user-edited test surface.

### SEC-008 — Tracked Playwright storage state contains reusable bearer session tokens

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `e2e/.auth/host.json:4-8` and `participant.json:4-8` contain tracked `auth_token` JWT cookies with long expirations. `e2e/global-setup.ts:24-37` performs real seeded logins and `:83-97` writes resulting storage state into those files. `.gitignore` does not exclude `e2e/.auth/`.
- Impact: anyone with repository history can replay the local/test bearer tokens wherever the same signing secret and seeded database/session version are used. This also normalizes committing credentials generated by future environments.
- Fix status: **completed in the audited branch; production deployment pending**. `58466c56` removes the tracked storage-state files and ignores `e2e/.auth/`, while global setup generates fresh local state only after seeding. `git ls-files e2e/.auth` is empty and Git confirms the path is ignored. The current session verifier also rejects session-shaped shared-secret tokens without an expiry (`b3826149`); all seven focused token tests passed, including that historical-token shape.

### SEC-009 — MFA can be bypassed by omitting a caller-controlled `clientType`

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: the login schema makes `clientType` optional and only recognizes literal `web` (`src/app/api/auth/login/route.ts:21-25`). MFA runs only inside `isWebLoginClient(clientType)` at `:73-104`; omitting the field proceeds directly to full session creation at `:106-117`. `src/server/authTotpMfa.ts:58` defines web detection as `value === 'web'`.
- Test evidence: `src/app/api/auth/__tests__/authRoutes.test.ts:500-544` explicitly expects successful login without `clientType` and without invoking MFA.
- Impact: a password holder can bypass enabled web MFA with the normal login endpoint by omitting a JSON property. Trust is placed in an attacker-controlled client declaration rather than the account/session policy.
- Legacy relevance: this looks like backward compatibility for older clients and must be evaluated against the `1.6.13` floor, but it is unsafe regardless of caller version when MFA is enabled.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` no longer lets caller-supplied `clientType` decide whether an authenticator challenge is required; every verified password login invokes the MFA challenge unless an explicitly enabled non-production local bypass is active. The focused auth route suite passed, including an MFA-enabled login that omits `clientType` and receives no session cookie.

### SEC-010 — Session JWTs have no cryptographic expiry

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/lib/authServer.ts:68-70` signs normal session JWTs with no `expiresIn`; `:72-84` verifies without an age policy. The browser cookie lasts 400 days (`:8`, `:115-124`), but copied bearer tokens are not bound to cookie expiry. Logout increments the account session version (`src/app/api/auth/logout/route.ts:5-11`), but a token remains valid indefinitely absent revocation/password-related session-version change.
- Impact: stolen Authorization tokens can outlive the already-long cookie lifetime and compound the committed-storage-state exposure.
- Fix status: **completed in the audited branch; production deployment pending**. `79db2c13` signs typed, issuer/audience-bound session tokens with the 400-day session lifetime, and `b3826149` rejects missing/invalid expiry claims during verification. The seven focused auth-token tests passed, covering bounded issuance plus missing-expiry, expired, wrong-audience, and wrong-type rejection.

### SEC-011 — Legacy universal user POST permits arbitrary profile mass assignment

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/users/route.ts:143-152` requires any session, then trusts caller-supplied `id` plus an arbitrary `data` record. `:183-205` creates that `UserData` row and `:213-232` updates an existing row. There is no `session.userId === id`/admin assertion and no mutable-field allowlist.
- Impact: an authenticated caller can create or overwrite another user's profile, including canonical flags/arrays accepted by Prisma, rather than using the access-controlled resource route.
- Legacy relevance: the safer `PATCH /api/users/[id]` path has explicit access/field handling; this broad POST is a strong pre-`1.6.13` compatibility cleanup candidate after callers are traced.
- Fix status: **completed in the audited branch; production deployment pending**. `d5d6592e` retires the universal mutation endpoint: authenticated and unauthenticated callers can no longer create or overwrite an arbitrary `UserData` record through `POST /api/users`, and the route returns HTTP 410 without any persistence access. The focused user-route suite passed all 16 cases, including an attempted victim-profile overwrite.

### SEC-012 — Universal invite endpoint trusts scope and inviter identity

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/users/invite/route.ts:32-40` requires any session but accepts optional caller-controlled `inviterId`. `:60-71` validates only that exactly one team/event/organization scope ID is present, not that the caller manages it. `:88-114` provisions the email account and creates the invite with the spoofable actor at `createdBy`.
- Alias amplification: `invite_by_email`, `invite-by-email`, and `invite-email` all re-export this POST handler.
- Impact: any account can invite arbitrary emails as players/officials into known scopes and attribute the invite to another user.
- Fix status: **completed in the audited branch; production deployment pending**. `58466c56` derives `createdBy` exclusively from the authenticated session and requires team captain/manager/coach, event-manager, organization-manager, or admin authority for each exact invite scope. The focused invite suite passed all four cases, including spoofed-inviter and unauthorized team/event/organization attempts.

### SEC-013 — Generic ensure/lookup endpoints enable account creation and email enumeration

- Severity: **high**
- Repository: `mvp-site`
- Evidence:
  - `src/app/api/users/ensure/route.ts:14-32` lets any authenticated caller create/ensure `AuthUser` and `UserData` rows for any valid email without invite scope, role, or rate-limit policy.
  - `src/app/api/users/lookup/route.ts:26-64` lets any authenticated caller query arbitrary emails and returns both `userId` and `sensitiveUserId`.
  - `exists`, `exists-by-email`, and `lookup-by-email` re-export the same lookup behavior.
- Impact: the API supports bulk database/account bloat and authenticated email/account identifier enumeration; aliases expand the surface and obscure the canonical contract.
- Legacy relevance: determine which aliases/callers remain at the `1.6.13` compatibility floor and retire older universal flows in favor of scoped invitations/search.
- Fix status: **completed in the audited branch; production deployment pending**. `d5d6592e` retires the arbitrary-email ensure endpoint and the lookup endpoint plus `exists`, `exists-by-email`, and `lookup-by-email` aliases with HTTP 410, leaving account resolution to authorized scoped invitation flows. The focused alias suite passed all 10 cases and verifies no persistence or identity lookup occurs.

### SEC-014 — Event creation trusts caller-supplied host and organization scope

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: the create schema accepts `event` as an arbitrary record (`src/app/api/events/route.ts:60-66`). After authentication/email verification (`:970-980`), the handler explicitly prefers payload `hostId` over `session.userId` (`:1045-1052`) and sends the payload into repository persistence (`:1081-1101`) without proving the caller can act for payload `organizationId`. Notifications use the resulting spoofed host (`:1103-1113`).
- Impact: any verified account can create events/resources under another known user or organization and trigger externally visible notifications attributed to that host.
- Source-of-truth concern: the persistence repository receives data but no actor/session, so authorization cannot be consistently enforced at that layer.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` derives a non-admin event host only from the authenticated session and requires `EVENTS_MANAGE` permission for the requested organization before opening the creation transaction. The focused event-save suite passed all six cases, including a spoofed `hostId` and an unauthorized organization-create attempt.

### SEC-015 — Public user privacy policy returns exact DOB, minor identity, and social metadata unchanged

- Severity: **critical**
- Repository: `mvp-site`
- Evidence:
  - `src/server/userPrivacy.ts:5-26` defines the public projection with exact `dateOfBirth`, DOB verification fields, friend/follow/request arrays, uploaded image IDs, home organization, and Stripe flag.
  - `applyUserPrivacy` builds a large relationship-aware context but ignores it, spreads the entire public row, and always returns `isIdentityHidden: false` (`src/server/userPrivacy.ts:470-489`).
  - Unauthenticated single and batch user reads invoke that function (`src/app/api/users/[id]/route.ts:113-138`, `src/app/api/users/route.ts:65-90`).
- Impact: known user IDs reveal exact birth dates, minor identities, and social/account metadata to unauthenticated callers. Exact DOB is particularly sensitive and unnecessary for a public profile.
- Test concern: user-route tests whose names describe hiding unrelated minors currently assert visible names and `isIdentityHidden=false`, indicating policy/implementation drift rather than protection.
- Fix status: **completed in the audited branch; production deployment pending**. `d5d6592e` applies a contextual privacy projection: public viewers receive no DOB, verification state, social arrays, Stripe state, or home-organization data, while minor identity is masked unless the viewer has a documented parent/team/event/organization relationship. The focused user-route suite passed all 16 cases, including anonymous unrelated minor/adult privacy assertions.

### SEC-016 — Users can self-assert server-owned verification and payment flags

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `USER_MUTABLE_FIELDS` includes `dobVerified`, `dobVerifiedAt`, `ageVerificationProvider`, and `hasStripeAccount` (`src/app/api/users/[id]/route.ts:20-39`). PATCH copies present fields directly into `nextData` (`:201-247`) and persists them (`:304-310`). Paid-event eligibility later trusts the profile `hasStripeAccount` bit (`src/server/repositories/events.ts:568-592`).
- Impact: a user can claim age verification and Stripe connection state without completing the authoritative provider flow, undermining compliance and paid-event gating.
- Source-of-truth mismatch: organization PATCH correctly treats analogous Stripe state as provider-owned; user profiles do not enforce the same invariant.
- Fix status: **completed in the audited branch; production deployment pending**. `d5d6592e` removes provider-owned verification/payment fields from the client mutable allowlist and rejects any direct PATCH containing them. The focused user-profile route suite passed all 14 tests, including a multi-field self-assertion attempt that returns 403 before any persistence read.

### SEC-017 — Stripe webhook accepts unsigned attacker JSON and performs payment transitions

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/billing/webhook/route.ts:1568-1577` parses raw JSON and verifies it only when both configured webhook secrets **and** a nonempty `stripe-signature` are present. Missing either condition skips verification entirely; the explicit development escape at `:1594-1604` is not involved. The handler then trusts object metadata (`:1782-1819`), marks referenced bill payments paid (`:2035-2069`), reconciles registrations, or creates an instant paid bill/payment when IDs are absent (`:2159-2235`).
- Alias: `/billing/webhook` re-exports the same POST handler from `src/app/billing/webhook/route.ts`.
- Impact: an unauthenticated forged `payment_intent.succeeded` can mark existing financial records paid, activate event/team registrations, or create new paid records without a Stripe charge.
- Test gap: no negative test requires a signature or rejects a missing signature.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` fails closed when no webhook secret is configured, when a Stripe signature is absent, or when signature verification fails. The only unverified path requires the explicit non-production `STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV=true` escape hatch. The focused webhook suite passed all 18 cases, including unsigned-payload rejection before any payment transition.

### SEC-018 — Paid rentals fail open to arbitrary `pi_*` strings when Stripe is unconfigured

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/public/organizations/[slug]/rental-orders/route.ts:157-183` treats any supplied `pi_*` string as verified when `STRIPE_SECRET_KEY` is absent. POST passes the client ID into this path (`:533-614`), then writes a fully paid bill/payment (`:422-528`) and confirmed booking/items (`:691-755`). There is no production/environment guard.
- Test evidence: `src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts:75-81,291-386` intentionally deletes the Stripe key, submits `pi_rental_1`, and asserts a paid bill and confirmed booking.
- Impact: any deployment missing/misconfiguring the Stripe key can be booked without payment by submitting a fabricated identifier.
- Fix status: **completed in the audited branch; production deployment pending**. The rental-order verifier now rejects a paid booking with a clear 503 before any bill, payment, booking, or booking-item write when Stripe verification is unconfigured. It then retrieves and validates a succeeded Stripe intent against the expected rental, event, organization, user, and amount. All 39 focused Stripe/rental route tests passed, including an unconfigured-key fabricated `pi_*` regression.

### SEC-019 — Missing Stripe configuration silently enables mock financial state across production handlers

- Severity: **high**
- Repository: `mvp-site`
- Evidence:
  - `src/app/api/billing/create_billing_intent/route.ts:185-205` returns `pi_mock_*` and may claim a payer.
  - `src/app/api/billing/purchase-intent/route.ts:1229-1275` returns mock payment/tax IDs for paid purchases.
  - `src/app/api/billing/host/connect/route.ts:134-165` writes `acct_mock_*` and marks a user/organization connected.
  - `src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/route.ts:218-233` returns a `/billing/mock-checkout` URL, but no matching page exists.
- Impact: a missing secret changes business truth instead of producing an explicit service-unavailable error; payment/account state can be fabricated or checkout can lead to a dead route.
- Runtime evidence: from the current Android Home screen, tapping the visible “Manage Stripe” action against the local unconfigured API stayed on Home and surfaced only `Invalid redirect url`, confirming that the fallback reaches user-visible production flow rather than a clearly isolated test surface.
- Suggested invariant: mocks require an explicit test/development flag that cannot start in production; absence of provider credentials must fail closed.
- Fix status: **completed in the audited branch; production deployment pending**. `2401d0ee` introduces a shared configured-secret guard and returns a clear 503 before bill intent, purchase intent, Stripe Connect, and team billing checkout can create mock state or begin mutations. The 33 focused Stripe configuration/route tests passed, including no-secret failures for every affected flow and no writes before the error.

### DB-001 — Mobile deletes the Room database before migrations can run

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: Android calls `deleteDatabaseIfSchemaVersionChanged` before constructing Room (`composeApp/src/androidMain/kotlin/com/razumly/mvp/di/RoomDBModule.android.kt:23-43`) and deletes whenever `user_version != 32` (`:71-98`).
- Runtime evidence: after updating the emulator to current v1.6.14, logcat emitted `Deleting Room database ... because schema version 23 != 32`, followed by creation of a new database. This directly confirms the destructive path on a real upgrade state.
- Data-loss impact: the database contains `MatchOperationOutboxEntry` (`core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt:46-74`), whose pending/syncing/failed rows are durable unsent scoring/incident operations. A future version bump erases them before registered migrations run.
- Release nuance: a clean v1.6.13/v32 to v1.6.14/v32 upgrade does not trigger deletion, but any supported installation still carrying an older on-device schema does, and the next Room version bump will do so again.
- Fix status: **completed in the audited mobile branch; release deployment pending**. Android now opens `tournament.db` through Room with the full migration graph and only logs a destructive migration callback if one ever occurs; it no longer deletes the database before Room can migrate it. The on-device `RoomMigrationPathTest` suite passed all eight scenarios, including preserving a v24 queued match-operation row across every remaining released migration.

### DB-002 — Current Room schema history is not reproducible

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `.gitignore:22` ignores `composeApp/schemas`, while `core/database/build.gradle.kts:59-67` configures Room to write there. No schema snapshot is tracked; the ignored local tree has 92 historical JSON files across retired database identities, and the current identity reaches only v23 rather than current v32.
- Impact: migration validation/review cannot be reproduced from source control, and a version bump has no trustworthy before/after fixture.
- Fix status: **not changed; reporting only**.

### DB-003 — The Android Room migration graph is incomplete and masked by destructive deletion

- Severity: **high**
- Repository: `mvp-app`
- Evidence: Android defines/registers only 1→2, 2→3, 3→4, 28→29, and 29→30 plus obsolete 80+ migrations (`core/database/src/androidMain/kotlin/com/razumly/mvp/core/data/RoomMigrations.android.kt:8-188`; Android module `:37-43`). It has no contiguous path to v32; pre-open deletion masks the gap.
- Legacy relevance: if v1.6.13/v32 is the supported floor, pre-v32 migrations should be intentionally retired after a real v1.6.13 fixture exists, not left beside destructive deletion.
- Fix status: **not changed; reporting only**.

### DATA-001 — Cached divisions/participants can override authoritative backend deletions

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `withPreservedCachedDivisionState` restores cached `divisions`/`divisionDetails` whenever a fresh response omits a cached division (`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt:1152-1186`) and is applied to detail, mutation, list, and search responses. `:1189-1196` similarly replaces remote participant arrays with cached arrays.
- Impact: removed divisions, participants, pricing, or schedule configuration can remain indefinitely on mobile; Room becomes a conflicting authority instead of a convergent cache.
- Fix status: **not changed; reporting only**.

### DATA-002 — Generic refresh deletes Room rows but returns stale pre-delete objects

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `core/repository-api/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/IMVPRepository.kt:18-38` deletes local IDs absent from a remote response, saves remote rows, then returns raw remote data—or the captured pre-delete `localData` when remote is empty. Fields use this at `FieldRepository.kt:85-96`; the pattern also reaches users/chat.
- Impact: callers render deleted objects once after Room has removed them, and partial/truncated responses can cause destructive cache deletion. The immediate return path also bypasses Room as local source of truth.
- Fix status: **not changed; reporting only**.

### DATA-003 — Collection APIs lack shared ID chunking and can truncate/delete records

- Severity: **high**
- Repository: `mvp-app`
- Evidence: users correctly chunk at 100 (`UserRepository.kt:812-825`), but organizations send all IDs with `limit=100` (`BillingRepository.kt:2097-2108`), teams use one request with `limit=200` (`TeamRepository.kt:1190-1195`), events/fields/time slots/products are also unchunked, and missing event results are later deleted (`EventRepository.kt:1233-1239,1867-1881`).
- Impact: URL-size failures and server limits silently omit entities; omission can then be interpreted as authoritative deletion.
- Fix status: **not changed; reporting only**.

### DATA-004 — Schema drift is treated as successful mutation by dropping unknown fields

- Severity: **high**
- Repositories: both
- Evidence: organization/event/team writes catch Prisma `Unknown argument`, remove fields, and retry (`mvp-site/src/app/api/organizations/route.ts:44-78`, `organizations/[id]/route.ts:86-125`, `src/server/repositories/events.ts:137-182`, team routes). Mobile team update repeats a request after stripping backend-rejected fields (`mvp-app/core/repository-impl/.../TeamRepository.kt:552-565,829-851`).
- Impact: APIs can return success while silently losing join policy, payment, registration, or event fields; deployment schema/client mismatch becomes hidden data corruption.
- Legacy relevance: these broad compatibility loops are candidates for removal at the `1.6.13` contract floor.
- Fix status: **completed 2026-07-12**. Web organization, event, field, and legacy-team mutations now fail closed on Prisma `Unknown argument` errors, preserving the requested payload and returning an explicit schema-contract failure rather than retrying without it. The mobile team repository now returns the rejected PATCH as a failure without a second stripped request or a local save. `c5de7fbb` and `7ccf037a` add the regression coverage; 142 focused web assertions, the Android and iOS 19-test team-repository runs, and a fresh Android cold launch passed.

### DATA-005 — `mvp-site` has three schema surfaces and one is materially stale

- Severity: **high**
- Repository: `mvp-site`
- Evidence: Prisma config points only to `prisma/schema.prisma` (`prisma.config.ts:5-12`), and runtime imports `src/generated/prisma`. A separate tracked `prisma/schema.generated.prisma` is unused and contains 47 models/29 enums versus the canonical 83/60, missing 36 current models. `package.json` has no explicit generate/diff build gate.
- Impact: developers/tools can select a false schema source, while committed generated-client drift is not enforced.
- Fix status: **completed 2026-07-12**. The unused `prisma/schema.generated.prisma` shadow schema was retired. `npm run prisma:check` now validates and regenerates only `prisma/schema.prisma`, normalizes known generator-only whitespace deterministically, rejects any reintroduced shadow schema, and confirms that the generated client embeds the canonical schema. The package build command invokes that preflight; its regression test, `npm run prisma:check`, and `tsc --noEmit` passed in `c38269b0`.

### DATA-006 — Release metadata is not reproducible at the 1.6.13/1.6.14 boundary

- Severity: **high**
- Repositories: both
- Evidence: current Android mobile version is `1.6.14`/versionCode 67 while Wear OS is `0.1.0`/100001, but source-controlled `AppReleases` migrations seed only 1.5.6 and 1.5.12. `src/app/api/app-version/route.ts:28-36` trusts mutable DB rows, and no tracked manifest/upsert for 1.6.13 or 1.6.14 exists.
- Impact: a fresh database cannot reproduce current update policy; release truth appears to live in manually mutated production data.
- Fix status: **completed 2026-07-12**. `20260712160000_seed_app_releases_1_6_13_1_6_14` deterministically upserts Android and iOS 1.6.13/1.6.14 rows by platform, version, and build. Its regression test is deliberately outside the Prisma migrations directory (`9c294b38`) so Prisma sees only real migration history. A fresh full migration-chain replay and idempotency reapply passed; Android and iOS update-contract tests passed at their current 1.6.14 boundaries in `c03e8a94`. The live migration deployment completed successfully, status is up to date, and the public endpoint reports 1.6.13 → 1.6.14 as available while 1.6.14 is current on both platforms.

### DATA-007 — Normalized ownership/membership coexist with mutable duplicate ID arrays

- Severity: **medium-high**
- Repository: `mvp-site`
- Evidence: `Organizations.productIds` duplicates `Products.organizationId` (`prisma/schema.prisma:2033,2073-2104`), while product reads/writes use `organizationId` and organization mutations still accept `productIds`. `UserData.teamIds` duplicates `TeamRegistrations`/`TeamStaffAssignments`; membership is already derived from normalized rows with the stored array as fallback (`src/server/teams/teamMembership.ts:854-940`).
- Impact: two independently writable answers exist for the same relationships.
- Legacy relevance: remove persisted fallback arrays after the 1.6.13 compatibility boundary; response aliases can remain computed if needed.
- Fix status: **not changed; reporting only**.

### DATA-008 — Mobile organization data has obsolete/triplicated contract shapes and bypasses Room

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: domain `Organization` contains obsolete `fieldIds`/`teamIds` plus `productIds` and a second unused `OrganizationDTO` (`core/model/.../Organization.kt:51-55,87-150`). Billing defines a third private `OrganizationApiDto` (`BillingRepository.kt:3504-3568`). Current web organizations expose neither `fieldIds` nor `teamIds`. Organization/product/review records have no Room entity and are returned directly from network methods.
- Impact: contract drift and three mapping sources coexist; organization rendering violates the stated Room-first data flow without a documented exception.
- Fix status: **not changed; reporting only**.

### DATA-009 — Malformed event rows silently disappear and can stop pagination early

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `EventApiDto` makes most fields nullable and `toEventOrNull` silently returns null for missing/invalid values (`core/network/.../EventDtos.kt:71-207`). Repository paths use `mapNotNull`; pagination derives `hasMore` from the post-filter count (`EventRepository.kt:2131-2134`).
- Impact: one malformed row can both disappear without telemetry and hide every subsequent page.
- Fix status: **not changed; reporting only**.

### DATA-010 — Sensitive user identity allows duplicate rows and nondeterministic lookup

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `SensitiveUserData.userId` and `.email` are non-unique (`prisma/schema.prisma:648-675`), while `AuthUser.email` is unique. Lookup/auth flows use `findFirst` for sensitive rows (`src/app/api/users/lookup/route.ts:33-64`).
- Impact: multiple sensitive rows per user/email are permitted, resolution is nondeterministic, and `AuthUser` and `SensitiveUserData` can disagree.
- Fix status: **completed 2026-07-12**. `SensitiveUserData.userId` and canonical `email` are now unique, with a migration that rejects ambiguous legacy data rather than choosing and silently discarding a sensitive row. It normalizes unambiguous legacy email values before adding the indexes. Auth, invite, and MFA paths use deterministic `findUnique`/`upsert({ where: { userId } })` access; Google-linked accounts retain the existing application email until the explicit transactional email-change flow updates both identity records. The focused suite (67 tests), Prisma validation, TypeScript check, and a fresh migration-chain replay passed in `4b654c55`. The live migration is applied and the production aggregate reports both indexes present with zero duplicate IDs, duplicate normalized emails, orphan user IDs, or AuthUser/SensitiveUserData email mismatches.

### DATA-011 — App release identity is not constrained

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: `AppReleases` has only non-unique indexes for platform/build/version (`prisma/schema.prisma:395-409`); release migrations conflict only on row `id`. `src/lib/appReleases.ts:79-100` returns all active newer rows without deduplication.
- Impact: duplicate active release identities can create duplicate/churning update prompts and weaken the table as release source of truth.
- Fix status: **not changed; reporting only**.

### LEG-001 — Pre-1.6.13 delegate/response compatibility remains in production paths

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: a Prisma proxy retains obsolete `volleyBallTeams` access (`src/lib/prisma.ts:39-53`) with repeated fallbacks in team/chat/invite/profile code. `src/server/legacyFormat.ts:8-62` universally adds Appwrite `$id/$createdAt/$updatedAt` and changes open-ended event `end=null` into `end=start`. Static audit found 325 legacy-format hits across 115 API files and 11 alias routes, with no client-version gating.
- Impact: the same record has competing canonical/legacy semantics and every endpoint pays permanent compatibility cost.
- Required proof before removal: trace actual v1.6.13 mobile endpoint/field usage; code for older client contracts is removable under the stated floor.
- Fix status: **not changed; reporting only**.

### DATA-012 — JSON converters use contradictory corruption policies

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: primitive-list decoders throw on corrupt JSON, while officials/tags/match segments/incidents/membership/manual links catch and silently return empty/null (`core/model/.../Converters.kt:35-207`). Both watch operation stores also decode a corrupt persisted queue as an empty list (`WearMatchOperationStore.kt:187-194`; `WatchMatchOperationStore.swift:193-199`), silently abandoning unsynced officiating writes.
- Impact: version-drifted Room data can either crash a query or silently erase meaningful state depending on field type.
- Fix status: **not changed; reporting only**.

### SEC-020 — Scoped JWTs can be replayed as full application sessions

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/lib/authServer.ts:68-84` accepts any JWT signed by `AUTH_SECRET` as a session without requiring a session type, audience, issuer, algorithm allowlist, or expiry; missing `sessionVersion` becomes `0`. `src/lib/permissions.ts:9-29` then grants full auth when that user exists and has the common default version 0.
- Confused token families: the same secret signs email verification links (`src/server/authEmailVerification.ts:4-23,65-73`), email-change links, realtime match tokens (`src/app/api/realtime/matches/token/route.ts:55-65`), watch setup tokens, and QuickBooks OAuth state (`src/server/integrations/quickBooksConnection.ts:200-218`). Each contains a `userId`; their intended type/audience is ignored by session verification.
- Admin impact: `requireRazumlyAdmin` authorizes by the DB user's verified internal email/domain after generic session validation and does not require `session.isAdmin` (`src/server/razumlyAdmin.ts:81-125`). A leaked scoped token for an internal account can therefore reach internal admin routes.
- Fix status: **completed in the audited branch; production deployment pending**. `79db2c13` and `b3826149` require an HS256 session token to carry the exact issuer, session audience, `tokenType: session`, valid expiry, integer session version, and boolean admin claim. Distinct watch/realtime and other scoped tokens cannot pass generic session verification. The focused auth/realtime suites passed all nine cases, including rejection of a correctly signed email-verification-shaped token and access control for private realtime tokens.

### SEC-021 — Unlisted organizations and internal organization fields are anonymously readable

- Severity: **high**
- Repository: `mvp-site`
- Evidence: unauthenticated `GET /api/organizations` applies `status=LISTED` only when no `ids`, `ownerId`, or `userId` filter exists (`src/app/api/organizations/route.ts:136-205`); `ids`/`ownerId` bypass the filter and return unrestricted rows. `GET /api/organizations/[id]` also loads any organization and full staff rows before optional auth, then returns them at `src/app/api/organizations/[id]/route.ts:127-140,194-211`.
- Impact: known IDs expose unlisted/public-page-disabled organizations, staff user/type/role IDs, verification review data, Stripe/tax/agreement fields, and embed configuration to anonymous callers.
- Fix status: **completed in the audited branch; production deployment pending**. `3ce1ffac` makes private selectors authenticated, limits anonymous detail to listed organizations with an enabled public page, and returns a curated public projection to unauthorized authenticated viewers. The focused list/detail suites passed all 28 tests, including anonymous unlisted/ID-selector denial and assertions that staff, tax, Stripe, agreement, and embed fields are absent from public output.

### SEC-022 — Fields and time slots are anonymously bulk enumerable without pagination

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `GET /api/fields` without parameters returns every non-archived field/facility row (`src/app/api/fields/route.ts:63-93`), including exact coordinates, use state, ownership, and rental slot IDs. `GET /api/time-slots` similarly returns every non-archived slot with field IDs, divisions, prices, and required document IDs (`src/app/api/time-slots/route.ts:179-268`). Neither requires auth or pagination.
- Impact: one anonymous request can enumerate internal facility inventory, availability, prices, and document requirements across organizations.
- Fix status: **completed in the audited branch; production deployment pending**. `3ed10d0f` requires an explicit field/time-slot scope, paginates both routes, blocks anonymous ID/event hydration, and limits anonymous discovery to public listed-organization inventory (with a narrowly constrained affiliate rental exception). The current field/time-slot suites passed all 29 tests, including unscoped denial, private-scope denial, capped public projections, and pagination.

### SEC-023 — Any authenticated user can join, read, or alter deterministic team chats

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/messaging/topics/[topicId]/subscriptions/route.ts:98-142` merges attacker-supplied user IDs into any existing group without membership/host/manager authorization. DELETE accepts arbitrary IDs and removes them at `:163-196`. Normal message GET trusts the resulting group `userIds` (`src/app/api/chat/groups/[id]/messages/route.ts:9-18`). Team chat IDs are deterministic `team:<teamId>` (`src/server/teamChatSync.ts:5,70-92`), and the subscription path explicitly skips minor-safety validation for team groups.
- Impact: an ordinary adult account can add itself to a known team/minor chat, read its full history, add others, or evict victims and unregister their push targets.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` and `bb1b1177` make team-chat membership derive from the current team roster, reject reserved team-topic creation, require membership for subscription/message access, and prevent arbitrary roster changes while retaining self-scoped device-target cleanup. Three focused suites passed all 29 cases, including stale-attacker reads/writes/subscriptions, recipient filtering to the authoritative roster, and team-chat membership immutability.

### SEC-027 — Messaging topic mutation and push relay trust arbitrary callers and payload fields

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `POST /api/messaging/topics` lets any session replace the name and `userIds` of an existing deterministic team group (`src/app/api/messaging/topics/route.ts:22-59`). The topic-ID route lets any session create/overwrite or hard-delete any deterministic `ChatGroup` (`src/app/api/messaging/topics/[topicId]/route.ts:20-77`). Message POST accepts arbitrary recipient IDs and spreads attacker `data` after server fields, so it can override `senderId` and `topicId` (`src/app/api/messaging/topics/[topicId]/messages/route.ts:19-57`). No topic-membership, team-membership, block/minor-safety, rate, or payload-size checks are applied.
- Impact: an ordinary account can take over known chats, delete them, and use the service as an authenticated push relay while spoofing message identity/routing fields.
- Relationship: broadens SEC-023 from subscription takeover to the full topic mutation and delivery surface.
- Fix status: **completed in the audited branch; production deployment pending**. `bb1b1177` reserves deterministic team IDs for roster synchronization, restricts generic topic updates/deletes to a non-team topic manager, requires a sending member, rate limit, chat-terms acceptance, recipient membership, and a bounded schema. Sender/topic/data routing fields are server-owned and arbitrary domain payload is discarded. The focused topic/message suites passed all 18 cases, including outsider and team-topic deletion attempts, spoofed sender/data fields, stale team members, blocked relationships, and oversized metadata.

### SEC-028 — Bill splitting is an authenticated IDOR that can create duplicate victim debt

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/billing/bills/[id]/split/route.ts:19-127` requires only a session, then accepts arbitrary bill and player IDs. It does not require bill ownership, team/organization management, `allowSplit`, membership, or an idempotency key before creating split liabilities.
- Impact: any account with known identifiers can repeatedly create financial debt records for other users.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` requires a team bill that explicitly opts into splitting, verified bill-payment management authority, and recipients in the current team roster. `e78d0f95` serializes the split under a bill lock, blocks existing child bills and in-flight parent payments, and conditionally voids parent installments before creating any child debt. The focused suite passed all eight cases, including unrelated caller, disabled split, outsider recipient, completed split, and intent-race denial.

### SEC-029 — Signed-document rows can be forged without scope authority

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: `src/app/api/documents/signed/route.ts:85-125` lets any authenticated session assert a signed-document row for caller-selected document and scope identifiers. It does not verify that the signer owns or manages that registration/event/team context before recording consent.
- Impact: a user can fabricate waiver/consent completion and influence downstream registration eligibility.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` retires direct `POST /api/documents/signed` assertions with HTTP 410. The remaining scoped record-signature workflow only marks an existing server-issued text acknowledgement as signed, leaves PDF callbacks to their signed provider operation, and rejects caller-defined document IDs. The focused document suites passed all six cases, including direct forgery and never-issued-text-document denial.

### SEC-030 — Guest registration can impersonate an existing email owner and sign as that identity

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: the unauthenticated guest-registration path accepts an email without proof of possession (`src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts:497-567`). `ensureGuestParentIdentity` binds an existing account or provisions one and creates an active parent/child relationship (`src/server/publicGuestRegistration.ts:69-182`; `src/server/inviteUsers.ts:88-117`). Registration then returns a signed token bound to that parent identity (`guest-registrations/route.ts:1142-1197`). The guest record-signature and embedded-signing routes trust that token's parent as signer and activate/persist consent (`guest-record-signature/route.ts:266-424`; `guest-sign/route.ts:147-205,235-239,360-469`).
- Impact: knowing a victim's email is sufficient to create registrations/relationships and produce waiver-signing artifacts attributed to that victim without email verification.
- Fix status: **completed in the audited branch; production deployment pending**. `a5ce0257` makes anonymous guest identity creation fail with HTTP 409 whenever either canonical auth or sensitive-user data already owns the supplied normalized email; it no longer links a guest registration, parent/child relation, or signing token to that account. Three focused guest-registration/signature suites passed all 11 cases, including a new route-level existing-email denial with no registration or token issuance.

### SEC-031 — Rental checkout locks permit low-cost inventory denial of service

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/billing/rental-lock/route.ts:13-52` accepts caller-provided event/time-slot data after only session validation. `src/server/repositories/rentalCheckoutLocks.ts:84-159,185-274` trusts the supplied organization, field, and time range to create ten-minute locks without first proving current DB availability, ownership, per-user quotas, or rate limits.
- Impact: an ordinary account can enumerate public slots and repeatedly lock broad facility inventory, preventing legitimate checkout.
- Fix status: **not changed; reporting only**.

### SEC-032 — Caller-supplied conflict exclusion can permit double booking

- Severity: **high**
- Repository: `mvp-site`
- Evidence: the event conflict checker excludes the caller-provided `eventId` (`src/server/repositories/events.ts:2177-2229`). Rental order creation forwards an untrusted `eventId` into that check (`src/app/api/billing/rental-orders/route.ts:628-673`); the rental-lock path has the same trust boundary.
- Impact: supplying the ID of an already occupying event can exclude the true conflict and allow another reservation for the same inventory/time.
- Fix status: **not changed; reporting only**.

### SEC-033 — Account deletion lacks password, MFA, or recent-auth revalidation

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/auth/account/route.ts:74-90` accepts the current session plus a static confirmation phrase. It does not require the password, MFA, or a recent-auth timestamp for this destructive operation.
- Impact: a stolen long-lived session token can permanently delete the account without obtaining another factor.
- Fix status: **not changed; reporting only**.

### SEC-034 — Email membership lookup enables bulk identity enumeration

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/users/email-membership/route.ts:23-89` lets any authenticated user submit an unbounded set of arbitrary emails/user IDs and returns mappings and membership presence without relationship or administrative scope.
- Impact: ordinary accounts can bulk-discover whether addresses belong to BracketIQ users and correlate identifiers.
- Fix status: **not changed; reporting only**.

### SEC-035 — Generic message creation accepts unbounded and caller-controlled delivery metadata

- Severity: **high**
- Repository: `mvp-site`
- Evidence: `src/app/api/messages/route.ts:11-100` accepts unbounded body text, `readByIds`, and attachment URLs, including arbitrary external URLs. It permits callers to pre-mark recipients as having read a message and has no rate or payload limits.
- Impact: the endpoint supports storage abuse, notification/message spam, misleading read state, and unsafe external attachment references.
- Fix status: **not changed; reporting only**.

### SEC-036 — Registration commits the account before required email delivery succeeds

- Severity: **high**
- Repositories: both
- Runtime evidence: against a clean database with all 142 tracked migrations applied, mobile registration received HTTP 500 `EMAIL_VERIFICATION_SEND_FAILED`; a direct database check showed the new `AuthUser` already persisted. The mobile UI returned to the fully populated signup form and presented the attempt as failed.
- Code evidence: account/profile/sensitive rows commit in the transaction ending at `src/app/api/auth/register/route.ts:401-402`. Required email availability and delivery are checked only afterward at `:431-451`, where failure returns 503/500 without compensating deletion or a response describing the account as created.
- Impact: transient email failure creates a real but apparently failed account. Retrying can collide with the persisted identity, and users cannot tell whether to register again, sign in, or recover verification.
- Fix status: **not changed; reporting only**.

### SEC-037 — Email verification is advisory while full authenticated access is granted

- Severity: **medium-high**
- Repositories: both
- Runtime evidence: the account left unverified by SEC-036 logged in successfully from Android and immediately reached authenticated Discover/Home/Chats/Schedule surfaces; multiple bearer-authenticated API calls returned 200.
- Code evidence: login computes `requiresEmailVerification` but still builds and returns a normal signed session token (`src/app/api/auth/login/route.ts:58-69,111-116`; `src/server/authSessionPayload.ts:42-81`). Mobile email login stores the token and sets `StartupAuthState.Authenticated` without checking `requiresEmailVerification` (`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt:403-431`).
- Impact: users and clients are told verification is required, but possession of the password is enough for normal account access; failed email delivery does not block use or provide a true verification boundary.
- Fix status: **not changed; reporting only**.

### SEC-024 — User-controlled affiliate URLs reach `window.open` without scheme validation

- Severity: **high**
- Repository: `mvp-site`
- Evidence: team creation accepts arbitrary `affiliateUrl` as `z.string()` and trims/persists it (`src/app/api/teams/route.ts:51-72,244-345`). Discover passes stored team/facility URLs directly to `window.open` (`src/app/discover/page.tsx:694-696,1116-1120`; `DiscoverMapModal.tsx:1717-1720`).
- Impact: `javascript:`, `data:`, credentialed/deceptive, custom-protocol, or unsafe host URLs can be stored and executed/opened when another user clicks.
- Fix status: **not changed; reporting only**.

### SEC-025 — Public image preview permits unbounded resize work

- Severity: **medium-high**
- Repository: `mvp-site`
- Evidence: `src/app/api/files/[id]/preview/route.ts:21-38` accepts any positive width/height with no maximum, auth, or rate limit; `:51-83` buffers the entire object and asks Sharp to resize/trim it.
- Impact: repeated unique huge-dimension requests can force large decode/CPU/memory allocations and bypass shared cache reuse.
- Fix status: **not changed; reporting only**.

### SEC-026 — Affiliate-logo publishing fetches untrusted URLs without SSRF/size controls

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: scraped candidate `logoUrl` is untrusted source data (`src/server/affiliateImports/service.ts:419-435`), then server-side `fetch` follows it with no scheme/private-IP/redirect allowlist, timeout, or content-length cap and buffers the whole response (`:437-446`).
- Impact: an approved malicious/stale candidate can probe internal endpoints or make the server download an arbitrarily large body. Admin-only triggering reduces exploitability but not server trust-boundary risk.
- Fix status: **not changed; reporting only**.

### SEC-039 — Android URL entry points accept untrusted schemes and navigation

- Severity: **high**
- Repository: `mvp-app`
- Evidence: waiver/signature URLs supplied through API-backed prompt state are passed directly to `PlatformWebView` and the external-browser fallback (`EmbeddedWebModal.kt:39-50,121-124`). The WebView enables JavaScript, automatic/multiple windows, third-party cookies, compatibility mixed content, and dispatches every non-HTTP(S) navigation through unrestricted `ACTION_VIEW` (`PlatformWebView.android.kt:27-58,96-140,163-177`). The generic `UrlHandler` also launches any non-HTTP(S) scheme, and remote app-update URLs flow directly into it (`UrlHandler.android.kt:10-30`; `AppUpdateUrlOpener.android.kt:5-6`).
- Impact: a compromised or attacker-controlled document URL can navigate inside the trusted app surface, invoke arbitrary registered app schemes, or expose users to credential/phishing content with no origin boundary. Only known signing/document origins and explicitly required callback schemes should be accepted.
- Fix status: **not changed; reporting only**.

### SEC-040 — Registration drafts retain user answers across logout without a bounded lifetime

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `RegistrationProgressDraft` persists the user/event IDs, form step, arbitrary answer map, registration ID, and hold expiry as JSON in ordinary Preferences DataStore (`CurrentUserDataSource.kt:17-30,168-195`). Draft keys are dynamic and `UserRepository.clearLoginState` clears the token/current account but neither enumerates nor removes them (`UserRepository.kt:754-766`). A draft without `holdExpiresAt` never expires, and an unparseable expiry is treated as not expired (`CurrentUserDataSource.kt:218-224`).
- Impact: abandoned registration answers and identifiers remain on a shared device indefinitely after logout and can be recovered by a later session that constructs the same draft key. Android application sandboxing and disabled backup reduce exposure, but the retention still crosses the account boundary and has no declared cleanup policy.
- Suggested direction: namespace drafts by the authenticated account, clear that namespace on logout/account deletion, and enforce a bounded expiry even when no payment hold exists.
- Fix status: **not changed; reporting only**.

### SEC-041 — Push-target cleanup reports success after backend failure and forgets how to retry

- Severity: **high**
- Repositories: both
- Evidence: Android catches and logs failure of its subscription DELETE, then unconditionally cancels retry state and erases the local target and token before returning success (`PushNotificationsRepository.kt:338-372`). The web DELETE handler independently catches `unregisterPushDeviceTarget` failure and still returns HTTP 200 (`src/app/api/messaging/topics/[topicId]/subscriptions/route.ts:163-198`). `RootComponent` therefore cannot observe cleanup failure through its `onFailure` branch (`RootComponent.kt:607-616`).
- Impact: logout during a network/backend failure can leave the device token registered to the previous account while both layers report success and Android discards the token/target needed for a later retry. The signed-out device may continue receiving private notification titles/bodies until a later successful registration reassigns that token.
- Suggested direction: make unregister failure observable and retain a durable pending-removal record until acknowledged; the server must not convert device-target persistence failure into a successful subscription response.
- Fix status: **not changed; reporting only**.

### SEC-042 — Attacker-controlled push payloads are persisted as trusted local invitations

- Severity: **high**
- Repositories: both
- Evidence: SEC-027 establishes that any authenticated caller can relay a topic message to caller-selected users and spread arbitrary `data` fields into the push payload (`src/app/api/messaging/topics/[topicId]/messages/route.ts:19-57`). Android treats any payload containing `inviteId`, an invitations type, or an invite deep link as authoritative, constructs an `Invite` entirely from payload fields, and upserts it to Room before backend verification (`PushNotificationsRepository.kt:608-647,763-783`). Its follow-up refresh only upserts returned server invitations and does not remove the just-inserted payload row (`:649-679`).
- Impact: an ordinary account can make another Android client show a fabricated pending invitation/badge with attacker-selected team, event, organization, child, and creator identifiers, especially while the victim is offline or backend refresh fails. The notification transport becomes a second writable source of invitation truth.
- Suggested direction: never materialize domain invitations from push contents; treat pushes as invalidation hints and fetch the invitation by ID through an authorized endpoint before inserting it. Restrict the relay endpoint as described in SEC-027.
- Fix status: **not changed; reporting only**.

### SEC-043 — One team participant's refund request can refund every participant's payments

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: the customer refund route associates a request with the first registered team containing the target user but cancels only that target user's registration (`src/app/api/billing/refund/route.ts:133-163,309-353`). When `teamId` is present, `resolveRefundablePaymentsForRequest` loads all team-owned bills, all split user bills, and direct user bills for every player/coach/captain/manager on that team; for normal event refunds it does not restrict any of those queries or resulting payments to `request.userId` (`src/server/refunds/refundExecution.ts:112-175,189-226`). Both automatic refund and later host approval use this resolver.
- Impact: one team member (or a parent acting for one child) can request/cause an individual cancellation that refunds every remaining paid team/member bill for the event while their registrations remain active. A host approving what Android presents as one person's request can trigger the same broad Stripe refunds.
- Suggested direction: persist the exact bill/payment/refundable-amount scope on each request and validate it against the requesting payer/registration. Team-wide refunds must be an explicit, separately authorized operation with a preview of every affected payment.
- Fix status: **completed in the audited branch; production deployment pending**. `f8c47ca4` makes individual team refunds resolve only the target participant allocation (or direct target bill), never the other team members' payments. `6e8f764e` persists and later revalidates an immutable bill/payment/amount snapshot; team-wide scope is an explicit separate mode with authorized payers. The focused execution/request/approval suites passed all 25 cases, including target-only allocation selection, team-wide explicit scope, host approval from the exact payer snapshot, and payment-level drift rejection.

### SEC-044 — Logout emits the empty user before the state Root uses to authorize cleanup

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `UserRepository.clearLoginState` sets `currentUser`/`currentAccount` to failures and only afterward sets `startupAuthState = Unauthenticated` (`UserRepository.kt:754-764`). Root's current-user collector performs registration-cache, push-target, chat-loop, and center-action cleanup only when the startup state is already unauthenticated at the moment that user emission arrives (`RootComponent.kt:237-274`). The later startup-state collector navigates to Login but does not invoke those cleanup methods (`:177-222`).
- Impact: normal logout can leave the old device push target registered, old registration cache present, periodic chat refresh running, and the old schedule shortcut snapshot active. The server can continue sending the device notifications for the signed-out account, and stale cross-account UI/data can survive until another user/session refresh replaces part of it.
- Suggested direction: make logout a single ordered coordinator that explicitly stops loops, unregisters the target with retry, clears per-user Room/preferences/cache state, resets navigation/shortcuts, and only then publishes the unauthenticated terminal state; do not infer cleanup from two independently ordered flows.
- Fix status: **completed in the audited branch; production deployment pending**. Mobile commits `a2ba3569` and `7ee85fd8` keep the authenticated token/device target until the logout API confirms cleanup, then publish `StartupAuthState.Unauthenticated` before the empty current-user state. Root therefore cancels push registration, registration-cache, chat, and center-action work on the same terminal transition. The targeted Android unit test passed and asserts the unauthenticated state is already visible when the empty user flow emits; failed device-target cleanup preserves the authenticated session for retry.

### UI-001 — DOB pickers accept future dates and the backend persists them

- Severity: **medium-high**
- Repositories: both
- Runtime evidence: current Android v1.6.14 signup's date-only picker allowed selecting `2026-07-11` on `2026-07-10`, and the UI retained that future value. The Add Child picker independently exposed the same future date as clickable. UI-tree evidence is in `android-current-dob.xml`, `android-current-future-dob.xml`, and `android-current-child-dob.xml` under the audit temp directory.
- Code evidence: signup/profile/child DOB callers pass `canSelectPast=true`, whose Android implementation returns `true` for every date (`PlatformDatePicker.android.kt:141-160`). Web registration only parses the date and performs no past/today bound (`src/app/api/auth/register/route.ts:267-269,328-371`).
- Impact: impossible future DOBs can become canonical profile data, corrupt age/minor policies, and undermine age verification.
- Fix status: **not changed; reporting only**.

### TEST-001 — CI coverage explicitly excludes every API route and enforces no threshold

- Severity: **medium-high**
- Repository: `mvp-site`
- Evidence: `jest.config.ts:17-23` excludes `src/app/**/route.ts` from coverage and defines no `coverageThreshold`. Static inventory found 268 executable route handlers; security-critical families have substantial untested authorization branches. No tracked `.github/workflows` or other repository deployment config invokes Jest, lint, or `tsc --noEmit`.
- Impact: a green local coverage command can coexist with entirely unexecuted route authorization logic, as the confirmed IDOR/signature findings demonstrate.
- Fix status: **not changed; reporting only**.

### TEST-002 — Wear match mutation and offline-sync behavior has no regression coverage

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: Android Wear has one test class with 7 passing tests, covering DTO decoding and three segment/tie-break labels. There are no tests for its operation store, sync, repository mutations, view model, or UI.
- Impact: the watch's highest-risk behavior—offline officiating writes and conflict reconciliation—can regress without a failing test, including the confirmed permanent-overlay and re-entrancy defects.
- Fix status: **not changed; reporting only**.

### TEST-003 — The standard Android unit-test task fails before tests on an unresolved Maps placeholder

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: running `:composeApp:testDebugUnitTest` for `MatchRepositoryHttpTest` and `BracketGraphValidatorTest` reaches `processDebugUnitTestManifest` and fails because `${MAPS_API_KEY}` in `composeApp/src/androidMain/AndroidManifest.xml:35` is unresolved. `composeApp/build.gradle.kts:324-328` configures the Secrets plugin and `local.defaults.properties` declares a safe default, but that value is not applied to the debug unit-test manifest under the current AGP/KMP setup. The tests never start; the same configuration emits multiple AGP 9 legacy-variant compatibility warnings.
- Impact: common/Android regression tests cannot be run through the expected Android unit-test task in a clean/default checkout, so defects in the outbox and graph logic can be hidden behind infrastructure failure rather than test results.
- Suggested direction: explicitly configure the unit-test manifest placeholder (without requiring a real key), migrate off the deprecated legacy variant integration, and add the exact test command to CI so placeholder regressions fail at configuration review time.
- Fix status: **not changed; reporting only**.

### TEST-004 — Rental tests omit the client/server contract and payment failure boundaries

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `RentalAvailabilityLoaderTest` covers price proration, past-time rejection, one repeating league slot, and event-name privacy, but not the 300-event cap, weekly-event recurrence, multi-day rental slots, adjacent-slot stitching, overnight hours, or post-payment order failure. `EventFilterTest` constructs only ordinary events. `OrganizationDetailComponentTest` contains product/team checkout tests but no rental checkout test, and there is no Compose accessibility test for the timetable.
- Impact: the critical charged-without-booking path and multiple availability divergences can remain green because each side is tested only in isolation or not at all.
- Suggested direction: add shared contract fixtures exercised by mobile selection and server validation, component tests for payment-success/order-failure retry or compensation, and Android semantics tests for labeled/selectable/resizable slots.
- Fix status: **not changed; reporting only**.

### OPS-002 — Notification links trust the request origin instead of the canonical host

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: event and organization creation notifications build links from `req.nextUrl.origin` instead of the repository's safe request-origin helper. The proxy accepts forwarded/request host input, so attacker-controlled host metadata can enter emailed or pushed links (`src/lib/requestOrigin.ts`; `src/proxy.ts`; affected create handlers).
- Impact: users can receive legitimate BracketIQ notifications containing poisoned origins, enabling phishing or broken links behind permissive proxies.
- Fix status: **not changed; reporting only**.

### OPS-003 — PostHog calls are present without client initialization

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: `src/lib/analytics/posthogClient.ts` calls `capture` and `identify`, and identity wiring is mounted globally from `src/app/layout.tsx`, but the first-party code inventory contains no `posthog.init` or PostHog provider initialization.
- Impact: analytics can silently no-op or behave inconsistently while code assumes events and identity are recorded.
- Fix status: **not changed; reporting only**.

### OPS-004 — Live affiliate scripts globally disable HTTPS certificate verification

- Severity: **high**
- Repository: `mvp-site`
- Evidence: twenty affiliate setup, repair, tagging, and logo scripts set `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` whenever `--live` is selected (for example `scripts/discover-affiliate-club-logos.ts:27-37`, `scripts/setup-fc-piamonte-affiliate-source.ts:21-30`, and `scripts/backfill-affiliate-event-tags.ts:14-24`). That process-wide switch applies to every subsequent HTTPS request, not just PostgreSQL. These same processes fetch official pages and logo bytes (`discover-affiliate-club-logos.ts:121-219`; `setup-fc-piamonte-affiliate-source.ts:86-119`) and can persist the resulting content, coordinates, tags, files, and public organization data into the live database/storage.
- Impact: a certificate error or network attacker can substitute scraped pages or image bytes during a production maintenance run. The scripts can then treat the substituted response as authoritative and write poisoned affiliate listings, public-page metadata, coordinates, or stored logo assets into production.
- Suggested direction: remove the Node-wide TLS override. Configure PostgreSQL TLS only on the database client with a pinned/validated CA, retain normal certificate verification for all HTTPS fetches, and require an explicit write flag in addition to `--live` for scripts that mutate production.
- Fix status: **not changed; reporting only**.

### TEST-005 — Match-detail tests replace the outbox finalizer with incompatible fake semantics

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the match-detail fake `updateMatchOperations` records the arguments, emits the input `match` unchanged, and returns it unchanged even when `finalize = true` (`MatchContentComponentTest.kt:2422-2445`). Production instead applies lifecycle/segment operations, writes the finalized object to Room, and returns it from the enqueue call (`MatchRepository.kt:462-479,860-882`; `MatchOperationLocalApplier.kt:15-35`). Existing confirmation tests therefore assert only the outgoing pre-finalization segment or fake flow and never observe DATA-029's second overwrite (`MatchContentComponentTest.kt:1337-1347,2318-2327`).
- Impact: the main scoring completion suite is green under a repository contract that is materially different from production, masking loss of `status`, `resultStatus`, and `actualEnd` at the highest-value match lifecycle boundary.
- Suggested direction: make the fake run the shared local applier or use a Room-backed repository integration harness; assert the final persisted/observed match after the complete component-repository sequence, including offline enqueue and later ACK/failure.
- Fix status: **not changed; reporting only**.

### TEST-006 — Event notification tests codify the wrong topic and never exercise composed content

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `EventNotificationCoordinatorTest` asserts that the coordinator always passes `isTournament = true` for a generic `event-1`, preserving APP-120's wrong-topic behavior. There is no Compose/screen test that types a title/body and asserts what `component.sendNotification` receives; the dialog callback type makes such an assertion impossible without changing production code.
- Impact: tests remain green while the only notification composer discards user input and leagues publish to a topic their participants do not subscribe to.
- Suggested direction: add end-to-end component/UI tests for league, tournament, weekly, and ordinary event topics plus exact typed title/body and failure/dismiss behavior; derive expected routing from canonical event data.
- Fix status: **not changed; reporting only**.

### TEST-007 — Purchase-intent tests explicitly require the signature fail-open

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `EventPurchaseIntentCoordinatorTest.process_purchase_intent_allows_missing_signature_url_and_launches_payment_sheet` constructs `requiresSignature = true` without a URL and asserts both the warning and Payment Sheet launch (`EventPurchaseIntentCoordinatorTest.kt:36-58`). No test requires a user-visible hard stop or server revalidation for that malformed mandatory-document state.
- Impact: the suite treats bypassing a mandatory signature as intended behavior, making a correction look like a regression and weakening the legal-consent boundary.
- Suggested direction: invert the expectation to a fail-closed state, cover missing/malformed/untrusted URLs and incomplete status, and add a server integration assertion that unsigned registrations cannot finalize even if a client attempts payment.
- Fix status: **completed in the audited mobile branch; production deployment pending**. `a2ba3569` changes the coordinator to a hard `WAITING_FOR_SIGNATURE` state whenever a required signing URL is absent or untrusted, with no payment-sheet launch. The focused Android coordinator suite passed the valid-signature, missing-URL, and untrusted-URL cases, asserting user-visible retry errors instead of a payment bypass.

### TEST-008 — Event-detail tests omit deselection and concurrent-search regressions

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventRentalResourcesCoordinatorTest` covers attaching/merging a selected rental resource but never starts with that rental field in the current draft, deselects it, and asserts the field is removed. Event invite helper/coordinator tests do not interleave two user/team searches or clear a query while an older request is pending.
- Impact: APP-123 and APP-124 remain green because tests exercise isolated success transitions rather than the state changes and response ordering that produce the defects.
- Suggested direction: add controlled deferred-response race tests for search, plus a selection-on → draft-sync → selection-off → draft-sync rental test that asserts both booking slot and facility field/provenance are detached.
- Fix status: **not changed; reporting only**.

### TEST-009 — Event validation tests never assert that a blank name makes the aggregate result invalid

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventDetailsValidationTest` covers capacity, division identity, duration, and tournament settings, but every fixture supplies a nonblank name and no test relates `isNameValid` to aggregate `isValid` (`EventDetailsValidationTest.kt:14-172,191-203`). This leaves APP-125's omitted conjunction term undetected.
- Impact: the detailed validation error can be correct while the actual save gate is wrong, and the suite still passes.
- Suggested direction: table-test every `EventValidationResult` boolean against aggregate validity, including blank/whitespace names, and assert both the submission gate and visible error.
- Fix status: **not changed; reporting only**.

### TEST-010 — Match-rules tests omit custom incident-definition round trips

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventDetailsMatchRulesTest` exercises sport defaults, overtime/shootout, segment count, and persisted resolved rules, but never calls `copyMatchRulesOverride` with `incidentTypeDefinitions` or verifies an authored custom definition survives normalization (`EventDetailsMatchRulesTest.kt:15-191`). APP-126 therefore remains invisible despite the web suite explicitly covering a custom `BLUE_CARD` definition.
- Impact: Android can discard the host-authored label and metadata while rule-resolution tests stay green on code-only incident lists.
- Suggested direction: add editor-helper and serialized event round-trip tests for custom code, label, kind, participant/team requirements, removal, and reset-to-default behavior.
- Fix status: **not changed; reporting only**.

### TEST-011 — Schedule and participant tests miss canonical membership and financial-operation races

- Severity: **high**
- Repository: `mvp-app`
- Evidence: participant filtering tests focus on placeholder/division visibility, while match membership tests seed legacy `playerIds`/`coachIds`; no test supplies membership only through active registration/assignment records and exercises ScheduleView's “my matches” filter (`ParticipantsViewTeamFilterTest.kt`, `MatchCardMembershipTest.kt`). There is also no test around participant refund/proof draft units, double taps, or switching billing targets while requests complete out of order.
- Impact: APP-129 through APP-132 affect schedule visibility and host financial actions without a regression signal at either the pure helper or UI/coordinator level.
- Suggested direction: extract the schedule membership and participant-billing state machines into testable helpers/coordinators; test canonical-only memberships, cents/display-dollar round trips, one-shot mutation guards, and deferred A/B response ordering.
- Fix status: **not changed; reporting only**.

### TEST-012 — The default Playwright suite includes five assertion-free debug probes

- Severity: **low**
- Repository: `mvp-site`
- Evidence: `playwright.config.ts:13-17` runs every spec under `e2e`, and `npm run test:e2e` invokes that unfiltered suite (`package.json:58`). `e2e/debug-blank.spec.ts`, `debug-home.spec.ts`, `debug-page.spec.ts`, `debug-prod.spec.ts`, and `debug-schedule.spec.ts` only navigate/evaluate, sleep, catch visibility failures, and print values. None contains an `expect` or other assertion; several merely log that `1 + 1` equals a value without checking it.
- Impact: these cases are reported as passing even when the page is stuck on loading, redirecting unexpectedly, or missing its primary action. They add build/server/browser time and inflate the apparent end-to-end test count without protecting behavior.
- Suggested direction: remove pure environment probes from the default suite or convert them into explicit smoke assertions for URL, rendered shell, authentication state, and the expected primary control; keep troubleshooting scripts separately named and excluded by default.
- Fix status: **not changed; reporting only**.

### DATA-013 — Prisma CLI/client/generated versions are skewed

- Severity: **medium-high**
- Repository: `mvp-site`
- Evidence: dependency/config inspection found Prisma Client 7.7.0 while the Prisma CLI/generated surface reports 7.8.0 (`package.json`, `prisma.config.ts`, `prisma/schema.generated.prisma`, `src/lib/prisma.ts`).
- Impact: generator/runtime behavior and types are not guaranteed to match, complicating migration and query debugging alongside the already stale generated schema surface.
- Fix status: **completed 2026-07-12**. The declared, installed, and generated Prisma CLI/client versions were reconciled at 7.8.0. The canonical schema guard in `c38269b0` fails the build preflight if package declarations, installed `@prisma/client`/`prisma`, or the generated client version diverge; `npm ls @prisma/client prisma --depth=0` and `npm run prisma:check` passed at 7.8.0.

### DATA-014 — Wear offline operations use unsynchronized whole-list SharedPreferences rewrites

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `WearMatchOperationStore` implements sequence allocation, operation upsert/status changes, match caching, and schedule caching as independent read/modify/`SharedPreferences.apply()` cycles with no mutex, transaction, or single writer. `WearMatchRepository.patchMatch` and `incrementScore` launch a sync coroutine for every edit, `WearMatchNetworkSync` can drain concurrently, and `WearMatchOperationSyncService` imports phone changes from another service instance. JSON decode failures silently become an empty operation list/cache.
- Impact: concurrent scoring, network callbacks, and phone-sync messages can allocate duplicate sequences, lose operations/status updates, overwrite newer cached matches, or silently discard the offline queue after one malformed preference value.
- Source-of-truth relevance: a match has multiple racing serialized snapshots rather than one atomic local operation log.
- Fix status: **not changed; reporting only**.

### DATA-015 — Phone-imported Wear operations permanently override later server state

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `WearMatchRepository.importPhoneOperation` stores phone messages with status `IMPORTED` (`WearMatchRepository.kt:581-604`). `localOverlayOperations` explicitly includes `IMPORTED` (`WearMatchOperationStore.kt:108-121`), and every remote refresh reapplies all such overlays (`WearMatchRepository.kt:554-562,655-667`). `pendingOperations` excludes imported entries, so no sync/ack path ever removes them; only full logout clears the store.
- Impact: a once-imported phone edit can indefinitely overwrite newer authoritative server match state on every watch refresh, while the retained operation list grows for the lifetime of the signed-in session.
- Source-of-truth relevance: acknowledged server state never regains authority over the permanent phone overlay.
- Fix status: **not changed; reporting only**.

### DATA-016 — Mobile navigation serializes mutable domain snapshots instead of stable IDs

- Severity: **high**
- Repository: `mvp-app`
- Evidence: Decompose navigation configuration stores complete `Event`, `MatchWithRelations`, `UserData`, and `ChatGroupWithRelations` objects, and the teams route can carry another full `Event` (`AppConfig.kt:27-89`). `INavigationHandler` exposes the same object-shaped contract rather than ID-shaped destinations. These models are also independently refreshed and persisted by repositories/Room.
- Impact: navigation state and process restoration become another mutable source of truth. A destination can render stale event, match, user, chat, or team data after the authoritative Room/server row changes, while large relation graphs inflate serialized back-stack state.
- Suggested direction: keep stable IDs and immutable presentation arguments in navigation state, then hydrate current domain state from the owning repository.
- Fix status: **not changed; reporting only**.

### DATA-017 — Mobile duplicates server-owned inclusive payment-fee policy and rounding

- Severity: **high**
- Repositories: both
- Evidence: mobile hard-codes the 1% platform fee, 2.9% card fee, and 30-cent fixed fee and implements both forward and inverse inclusive-price calculations in `InclusivePriceInput.kt:15-64`. The server separately owns the same constants and algorithms in `src/lib/billingFees.ts:1-29,82-140`, plus payment-method-specific ACH, bank-transfer, and pay-by-bank rules that mobile does not model.
- Impact: financial policy has two manually synchronized implementations. A fee, payment-method, or rounding change can make the amount displayed/entered on Android differ from the amount the server charges or settles even though the current card constants happen to match.
- Suggested direction: make the backend return the authoritative quote/breakdown used for display and submission, or generate both clients from one versioned fee contract.
- Fix status: **not changed; reporting only**.

### DATA-018 — Terms consent accepts the server version while showing a hard-coded substitute agreement

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: the consent contract carries the authoritative `version`, `url`, and summary (`UserRepository.kt:206-212,1680-1706`). `TermsConsentDialog.kt:22-130` reads only `state.summary`; “View full agreement” expands a hard-coded `fullAgreementSections` list and never uses `state.url` or displays `state.version`. Acceptance still posts against the current server consent endpoint.
- Impact: a user can accept the backend's current legal version without being shown that version's authoritative document. Copy changes on the server do not update the displayed “full agreement,” so the consent record and the text presented to the user can materially diverge.
- Suggested direction: display the version and open/render the supplied canonical terms URL; keep any native summary explicitly subordinate to that document.
- Fix status: **completed in the audited mobile branch; production deployment pending**. `a2ba3569` displays the server-provided agreement version, opens only the canonical BracketIQ terms endpoint supplied by the server, and disables acceptance when that authoritative URL is missing or untrusted. The Android terms/repository tests passed, covering canonical relative/absolute URLs and rejection of missing, malformed, or hostile URLs without a fallback agreement.

### DATA-019 — Missing notification preferences override the declared defaults and opt users into email

- Severity: **high**
- Repositories: both
- Evidence: both repos declare email disabled by default for `matchScheduleUpdates` and `chatMessages` (`src/lib/notificationSettings.ts:46-57`; mobile `NotificationSettings.kt:30-45`). Their normalizers then use `rawValue ?: true` for every supported channel (`notificationSettings.ts:92-109`; `NotificationSettings.kt:75-86`). Therefore `normalizeNotificationSettings(null/empty)` enables those two email channels even though each repo's `DEFAULT_NOTIFICATION_SETTINGS`/`defaultNotificationSettings()` says they are false.
- Impact: an absent, old, or partially populated preferences object silently opts a user into schedule and chat email rather than applying the advertised defaults. Server delivery checks use the same normalizer, so this affects actual outbound notifications, not only Android display state.
- Source-of-truth relevance: each repository contains two contradictory definitions of the default, and the server/mobile duplicated implementation repeats the same contradiction.
- Fix status: **not changed; reporting only**.

### DATA-020 — Room drops the facility relationship that Android later relies on

- Severity: **high**
- Repositories: both
- Evidence: the canonical `Fields` schema/API persists and returns `facilityId` (`prisma/schema.prisma:416-435`; `src/app/api/fields/route.ts:35,112-160`). Mobile `Field.kt:31-51` declares `facilityId` and the hydrated `Facility` as mutable `@Ignore` properties, so `FieldDao` upserts and subsequent Room reads cannot retain either. `FieldRepository.getFields` and `listFields` write remote fields to Room and can later return those cached rows; Android reads `field.facilityId`/`field.facility` for organization rental context and schedule labels (`OrganizationDetailScreen.kt:206-221`; `LeagueScheduleFields.kt:157-174`).
- Impact: facility grouping/name/location can be correct immediately after a network response and disappear after a Room round trip, restart, offline read, or cache fallback. The same field then has different facility truth depending on which repository branch produced it.
- Suggested direction: persist the canonical facility ID in the Room entity and hydrate facility details through an explicit relation/cache instead of mutable ignored properties.
- Fix status: **not changed; reporting only**.

### DATA-021 — Android patch DTOs cannot express clearing nullable server fields

- Severity: **critical**
- Repositories: both
- Evidence: the shared serializer sets `explicitNulls = false` (`CommonUtil.kt:70-80`), so nullable DTO properties with value `null` are omitted from JSON. `Event.toUpdateDto` maps nullable editable values such as `minAge`, `maxAge`, `cancellationRefundHours`, `address`, `sportId`, and match/set durations directly into `EventUpdateDto` (`EventDtos.kt:836-1145`); the editor explicitly sets several of these to null when a user clears/disables them (`EventDetailsRegistrationSection.kt:327-339,376,426`; `EventDetails.kt:573-580,648-653`). The server distinguishes “clear” from “unchanged” using `hasOwnProperty` in the event PATCH route, so an omitted key preserves the old database value. Team nullable update fields use the same DTO pattern (`TeamDtos.kt:299-360`), and bulk match updates do as well (`MatchDtos.kt:553-691`). Match lifecycle/segment code separately builds `JsonNull` behind explicit clear flags (`MatchDtos.kt:435-519`), proving ordinary nullable serialization is insufficient and that only those few fields received a clear protocol.
- Impact: Android can show an optional value as removed in its draft/local state while the PATCH silently leaves the prior database value authoritative. Reopening the event/team/match restores the supposedly cleared age limit, refund window, address, assignment, duration, or other nullable field.
- Suggested direction: use explicit patch-field wrappers/clear flags or a JSON-object builder that emits `JsonNull` for every intentionally cleared value; add serialization and API round-trip tests for each clearable field.
- Fix status: **completed in the audited mobile branch; production deployment pending**. `a2ba3569` preserves the normal omission semantics for untouched nullable fields but compares an edited event/team/match to its cached baseline and explicitly inserts JSON `null` for user-cleared fields. New mobile regression `a60feea9` verifies event address, age bounds, refund hours, sport, and match/set durations all serialize as JSON `null`; focused Android event/team/match patch tests passed.

### DATA-022 — Failed read-receipt requests leave Android's local cache falsely authoritative

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `MessageRepository.markMessagesRead` first copies every locally unread message with the current user added to `readByIds` and upserts those rows, then performs the server POST (`MessageRepository.kt:51-68`). The whole operation is wrapped in `runCatching`, but there is no rollback, pending-operation record, or retry owner when the POST fails.
- Impact: a timeout or rejection returns failure while Room permanently says the messages were read. Unread counts and offline rendering can then hide messages the authoritative server still considers unread, with no durable state that distinguishes an optimistic write from an acknowledged receipt.
- Suggested direction: persist a retryable read-receipt operation or update Room only after server acknowledgement; if optimistic UI is retained, model pending/failed state and reconcile it explicitly.
- Fix status: **not changed; reporting only**.

### DATA-023 — Android's optimistic match-winner algorithm contradicts the backend rules

- Severity: **high**
- Repositories: both
- Evidence: the Android local operation applier counts `winnerEventTeamId` across completed segments and immediately chooses whichever ID has the largest count, without reading `scoringModel`, `segmentCount`, the wins-needed threshold, all-segments completion, or point totals (`MatchOperationLocalApplier.kt:162-165,285-294`). The authoritative API treats `SETS` as best-of-N and requires enough segment wins; for other scoring models it waits for every required segment and compares total team scores, returning no winner on a tie (`src/app/api/events/[eventId]/matches/[matchId]/route.ts:756-813`).
- Impact: an optimistic Android mutation can temporarily declare the first set winner as the match winner, choose a plurality winner before the match is complete, or choose a set-count winner for a points-total sport where the server chooses the other team. That derived winner can feed local UI/bracket state until the network response replaces it, and lasts longer on slow/failing connections.
- Suggested direction: use the same versioned match-rules evaluator on both sides, or have Android leave match-level winner derivation to the authoritative response while only applying the submitted segment operation optimistically.
- Fix status: **not changed; reporting only**.

### DATA-024 — The phone match outbox has no atomic sequence allocator or single sync owner

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: each enqueue reads `MAX(clientSequence) + 1`, derives the row ID from that sequence, then upserts the operation in separate calls with no transaction or mutex (`MatchRepository.kt:397-478`). Every enqueue launches an independent `syncPendingMatchOperations` coroutine (`:509-512`). The DAO selects `SYNCING` rows as pending and `markAttempting` is an unconditional update rather than a compare-and-set claim (`MatchOperationOutboxDao.kt:20-46,63-80`), so concurrent drainers can send the same queue simultaneously. The backend merely records client-operation metadata inside match/incident metadata; it does not enforce an idempotency key (`src/app/api/events/[eventId]/matches/[matchId]/route.ts:264-310`).
- Impact: concurrent scoring/actions can allocate the same sequence and overwrite one outbox row before transmission. Even without a collision, multiple drainers can deliver old and new absolute-score/lifecycle operations out of order or duplicate action side effects, then race the ACK/FAILED state. This defeats the outbox's purpose as an ordered source of truth for officiating changes.
- Suggested direction: allocate and insert under one Room transaction, use one serialized actor/mutex for draining, and atomically claim only PENDING/FAILED rows. Enforce server idempotency by client operation ID and preserve per-device sequence ordering.
- Fix status: **completed in the audited mobile branch; release deployment pending**. A process-wide enqueue mutex serializes sequence allocation, and production writes the outbox operation plus optimistic match projection through one Room transaction. A separate sync mutex allows one drainer, while startup and bounded retry scheduling resume pending work. The focused repository suite passed all 13 cases, including a new concurrent enqueue regression that yields eight unique, monotonic operation sequences.

### DATA-025 — A rejected match operation remains authoritative locally and blocks every later operation

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: failed and interrupted `SYNCING` rows are returned by the same pending query as new work (`MatchOperationOutboxDao.kt:20-46`). Every remote match is then re-overlaid with all of those rows (`MatchRepository.kt:305-323,515-537`). The drain stops at the first failed send (`:911-927`), and the only production trigger for another drain is enqueueing another operation (`:509-512`); no startup/reconnect caller invokes `syncPendingMatchOperations`. Even a later trigger starts with the same permanent failure, so subsequent rows remain blocked. The HTTP test explicitly expects the rejected optimistic state to remain in Room after the row becomes FAILED (`MatchRepositoryHttpTest.kt:530-545`).
- Impact: a validation/permission conflict or one offline failure can leave Android permanently displaying a score, match status, incident, or winner the server rejected. Later officiating edits queue behind that row and never reach the server, while refresh/realtime data is repeatedly overwritten by the failed local payload.
- Suggested direction: distinguish retryable transport failures from terminal rejections, retry durably on startup/connectivity with backoff, reconcile/drop terminal overlays against the authoritative response, and let later independent operations progress or surface a blocking conflict explicitly.
- Fix status: **completed in the audited mobile branch; release deployment pending**. Terminal 4xx operation rejections move into durable `RECONCILING` state instead of remaining as authoritative local overlays; only the canonical remote read is retried, and it ACKs the rejected operation only after replacing local state. The focused repository suite passed all 13 cases, including rejection/relaunch/reconciliation behavior that never re-POSTs the rejected score.

### DATA-026 — Manual weekly refund requests discard their occurrence scope before approval

- Severity: **critical**
- Repository: `mvp-site`
- Evidence: weekly cancellation requires and resolves `slotId` plus `occurrenceDate`, and the in-memory automatic-refund row carries them (`src/app/api/billing/refund/route.ts:100-130,183-221`). The `RefundRequests` Prisma model has neither field nor any bill/payment reference (`prisma/schema.prisma:1680-1691`), and the WAITING-row create omits both (`refund/route.ts:309-358`). Later host approval loads only the persisted row and calls the same payment resolver (`src/app/api/refund-requests/[id]/route.ts:33-45,105-130`), so its occurrence filter is empty (`src/server/refunds/refundExecution.ts:97-106`).
- Impact: a request for one weekly occurrence becomes indistinguishable from a whole-series refund by the time a host approves it. The resolver can refund every paid bill for that user—and, under SEC-043, every linked team participant—across all occurrences.
- Source-of-truth relevance: the request record does not preserve the scope that made the cancellation valid, so approval reconstructs materially broader financial intent from event/user/team IDs.
- Suggested direction: make refund requests immutable snapshots of exact registration occurrence, bill/payment IDs, requested/refundable cents, currency, and policy decision; reject approval if the current refundable scope differs from that snapshot.
- Fix status: **completed in the audited branch; production deployment pending**. `6e8f764e` adds immutable occurrence and financial scope fields to refund requests (`slotId`, `occurrenceDate`, bill/payment lists, payment allocation, amount, currency, policy, version, and hash). Request creation snapshots the selected occurrence; approval refuses absent/stale/drifted scope rather than reconstructing a broader series refund. The focused refund suites passed all 25 cases, including persisted weekly-occurrence scope, immutable host-preview data, and approval drift rejection.

### DATA-027 — Android's generic user update rewrites unrelated social/profile arrays from one snapshot

- Severity: **critical**
- Repositories: both
- Evidence: `UserRepository.updateUser` accepts a full `UserData` snapshot and always PATCHes names, username, friend IDs, incoming/outgoing friend-request IDs, following IDs, Stripe state, uploaded-image IDs, profile image, and notification settings together (`UserRepository.kt:1236-1286`). Profile notification saves and Profile Details call this path after copying one changed field into their current snapshot (`ProfileComponent.kt:1001-1043`; `UserRepository.kt:1310-1345`). The server PATCH handler treats every supplied array as an authoritative replacement (`src/app/api/users/[id]/route.ts:199-225` and subsequent update).
- Impact: a concurrent friend/follow/request/image/profile change that lands after Android read its snapshot can be silently removed by saving notification settings or profile data. Unrelated domains share one last-write-wins mutation boundary.
- Suggested direction: replace the generic full-snapshot patch with narrowly typed endpoints/DTOs that include only the intended fields, use canonical social action endpoints for relationship arrays, and apply optimistic concurrency/version checks where replacement semantics remain necessary.
- Fix status: **completed in the audited mobile branch; release deployment pending**. Generic profile updates now PATCH only display-name, username, and profile-image fields; notification settings and uploaded images use dedicated narrow mutations, while social and membership arrays remain server-managed. All 12 focused user-repository tests passed, including an expanded regression that supplies stale nonempty social/image data and proves those fields are omitted while server memberships replace the snapshot.

### DATA-028 — Incident edits proceed after local persistence failures and can disappear

- Severity: **high**
- Repository: `mvp-app`
- Evidence: both `recordMatchIncident` and `removeMatchIncident` call `saveMatchLocally` but ignore its `Result`, then continue clearing optimistic state or processing the network queue (`MatchContentComponent.kt:1527-1529,1559-1565`). Queue success and failure also ignore the result of persisting the updated upload state (`:1845-1882`). The guarded `persistMatchLocally` helper used elsewhere explicitly checks and reports the same repository result (`:1887-1904`), but the incident path bypasses it.
- Impact: a Room/storage failure can leave an incident visible only in component memory while the app reports or proceeds as though it were durable. Navigation/process death can discard the incident, its score delta, or its retry status; a remote success followed by failed local save can also cause the incident to be re-created or displayed inconsistently.
- Suggested direction: use one checked transactional persistence/outbox path for incident state and score effects; do not upload or clear optimistic state until the durable write succeeds, and surface storage failure separately from transport retry.
- Fix status: **not changed; reporting only**.

### DATA-029 — Match finalization is immediately overwritten with an unfinished local object

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: final segment confirmation calls `updateMatchOperations(... finalize = true)`, whose production repository synchronously enqueues an outbox row, applies finalization locally, and upserts the resulting `status = COMPLETE`, `resultStatus = FINAL`, and `actualEnd` match before returning it (`MatchRepository.kt:462-479,860-882`; `MatchOperationLocalApplier.kt:15-35`). `syncMatchImmediatelyBlocking` discards that returned `MatchMVP` and reduces success to a Boolean (`MatchContentComponent.kt:1723-1771`). The caller then applies and saves `updatedScoringMatch`, the pre-finalization object that contains the completed segment but not the lifecycle fields (`:1621-1650`), overwriting the repository's finalized Room row while the finalize outbox entry remains pending.
- Impact: immediately after completing a match, Android can persist and render an internally contradictory record: every segment complete but match lifecycle unfinished/no `actualEnd`. Realtime overlay, navigation, repeat-confirm behavior, and later offline operations can diverge until a server response happens to repair Room; if sync fails, the contradiction persists.
- Suggested direction: return and persist the repository-applied finalized match as the sole local result, or make enqueue plus local state update atomic and prohibit the component from writing a second snapshot afterward. Add a production-repository integration test for the exact final-segment flow.
- Fix status: **completed in the audited mobile branch; release deployment pending**. Final-set confirmation retains and applies the `MatchMVP` returned by the repository finalization operation; it no longer writes the unfinished pre-finalization snapshot back over the canonical result. All 55 focused match-content tests passed, including final set completion asserting `COMPLETE`, `FINAL`, and the returned end timestamp with no second finalization sync.

### DATA-030 — Staff reconciliation deletes and recreates invites outside the event update boundary

- Severity: **high**
- Repositories: both
- Evidence: mobile staff save first deletes obsolete invite IDs one request at a time, then creates replacement invites in a separate bulk request, and only afterward returns an updated event snapshot for another API update (`EventStaffPersistence.kt:199-267`; `UserRepository.kt:958-1000`). Any deletion or create failure aborts the coroutine, but already completed deletions are not restored; a later final event update can also fail after invite mutations have committed. The tests assert successful call sets but contain no failure/compensation scenarios (`EventStaffPersistenceTest.kt`).
- Impact: a transient failure can remove valid staff invitations without applying the intended replacement roles, or create new invitations while the event's official/assistant lists remain old. Retrying from a stale screen can duplicate or further mutate the partially applied state.
- Suggested direction: expose one server transaction that reconciles event staff roles and invite rows from an idempotent desired-state payload, returning the canonical event/invite snapshot; include optimistic concurrency and partial-failure tests.
- Fix status: **not changed; reporting only**.

### DATA-031 — Sport names are not unique and duplicate rows break Discover filter identity

- Severity: **medium-high**
- Repository: `mvp-site`
- Evidence: `Sports.name` has no unique constraint (`prisma/schema.prisma:2318-2377`). `ensureDefaultSports` builds a name map that silently collapses duplicates for update selection but never removes/rejects existing duplicate-name rows, then returns every row (`src/server/defaultSports.ts:745-813`). `/api/sports` likewise returns the full row list after handling only the specifically deprecated generic names (`src/app/api/sports/route.ts:15-82`), and `sportsService` caches it without name deduplication (`src/lib/sportsService.ts:141-174`). Discover reduces rows to names and renders each name as both React key and selection value (`src/app/discover/page.tsx:151-152,1208-1216,1280-1298`).
- Runtime evidence: the desktop guest Discover DOM contained two indistinguishable checked-filter controls named “Indoor Volleyball”. The Next.js development issues badge appeared with duplicate-key issues while the console API exposed no actionable application error.
- Impact: users see duplicate sport filters that toggle the same string state, React receives duplicate sibling keys, and event/division rows can point at different sport IDs that the UI presents as one sport. Defaults, official positions, match rules, and public SEO pages can resolve nondeterministically by whichever duplicate row a map/query retains.
- Suggested direction: add a case-insensitive canonical-name uniqueness constraint (or immutable unique slug), migrate references to one canonical row per sport, deduplicate the API response defensively during rollout, and key/select filters by canonical sport ID rather than display name.
- Fix status: **not changed; reporting only**.

### OPS-001 — Advisory-lock acquire/release can use different pooled PostgreSQL sessions

- Severity: **medium**
- Repository: `mvp-site`
- Evidence: `src/server/affiliateImports/scheduledScrapes.ts:133-143,287-303,349-350` acquires `pg_try_advisory_lock` and later unlocks through separate Prisma queries. Session-scoped locks require the same physical connection, which a pool does not guarantee.
- Impact: unlock can run on another connection while the original pooled session retains the lock, making scheduled scraping remain skipped until that connection dies.
- Fix status: **not changed; reporting only**.

### APP-002 — Discover search races can merge stale filters and skip pages

- Severity: **high**
- Repository: `mvp-app`
- Evidence: initial loading uses `showLoading=false` (`EventSearchComponent.kt:306-315`), while the effective in-flight flag is only set when `showLoading=true` (`:464-515`) and `_isLoading` is never assigned. Filter changes at `:560-570` can start a second offset-zero request; late old responses merge/reapply the old filter and increment shared offset. Organization-tag refresh has a related dropped-refresh race (`:584-596,933-970`).
- Impact: users can see results from the previous filter and skip valid result pages. No component tests cover this concurrency.
- Fix status: **not changed; reporting only**.

### APP-003 — Empty field responses are replaced with stale cached facilities

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `FieldRepository.kt:98-117` replaces a successful empty `/api/fields` response with all cached fields. Active organization-rental and Discover callers use it (`OrganizationDetailComponent.kt:1326-1334`, `EventSearchComponent.kt:1026-1045`).
- Impact: deleted or newly inaccessible fields reappear in mobile rentals/discovery.
- Fix status: **not changed; reporting only**.

### APP-004 — Wear OS silently falls back to plaintext token storage

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: when `EncryptedSharedPreferences` initialization fails, Wear OS catches the error and falls back to ordinary unencrypted `SharedPreferences` for the bearer token (`wearApp/.../WearAuthTokenStore.kt:9-35`).
- Impact: production authentication storage can silently downgrade rather than fail closed or surface a recoverable security error.
- Fix status: **not changed; reporting only**.

### APP-005 — Reviews and time-slot CRUD bypass the declared Room-first data flow

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: organization reviews live only in component `MutableStateFlow` and repository methods return HTTP payloads directly (`OrganizationDetailComponent.kt:201-214,496-544`; `BillingRepository.kt:2111-2143`). `OrganizationReview` and `TimeSlot` are not Room entities; time-slot CRUD is network-only (`FieldRepository.kt:120-208`).
- Impact: these screens have ad hoc in-memory truth, no consistent offline/restart behavior, and a different synchronization model from the repository standard.
- Fix status: **not changed; reporting only**.

### APP-006 — Photo-less avatars become blank offline and create N network requests

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `NetworkAvatar.kt:55-107` uses a backend initials PNG as the only fallback; when that request fails, `imageModel=null` renders an empty gray circle. The URL builder is per user (`core/presentation/util/util.kt:279-287`).
- Impact: offline/error states lose user identity, and rosters/reviews with photo-less users issue one image HTTP request per user instead of rendering local initials.
- Fix status: **not changed; reporting only**.

### APP-007 — Fresh clones lack required Android service configuration

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `google-services.json` is ignored with no tracked template, generator, or documented CI provisioning path, while the Android build applies the Google Services plugin unconditionally.
- Impact: a source-complete fresh clone is not build/run reproducible without undocumented local files.
- Fix status: **not changed; reporting only**.

### APP-008 — Subscription contract failures are converted into empty memberships

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `BillingRepository.kt:1666-1692` calls the real `/api/subscriptions`, then a nonexistent legacy `/api/users/{id}/subscriptions`, and converts two 404 responses into success with an empty list.
- Impact: deployment/contract drift is hidden from users and diagnostics as “no memberships.”
- Legacy relevance: the nonexistent fallback is removable at the 1.6.13 contract floor.
- Fix status: **not changed; reporting only**.

### APP-009 — Team/chat membership has duplicate storage and partial-commit transactions

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: Team membership is stored in JSON arrays and separate junction tables; queries use unindexed substring `LIKE` (`Team.kt:22-24`, `Converters.kt:29-38`, `TeamDao.kt:32-46`). `upsertTeamWithRelations` catches cross-reference failures inside `@Transaction`, allowing the team row to commit with incomplete relations (`TeamDao.kt:105-125`); chat repeats the pattern (`ChatGroupDao.kt:41-70`). `UserDataDao.upsertUserWithRelations` also deletes existing team junctions, upserts the user, catches any replacement-junction failure, and commits the now-incomplete relationship (`UserDataDao.kt:49-64`).
- Impact: membership has multiple local truths, slow/incorrect substring lookup risk, and transactions that can report partial relational state.
- Fix status: **not changed; reporting only**.

### APP-010 — “Follow organization” is visible but intentionally unimplemented

- Severity: **medium-low**
- Repository: `mvp-app`
- Evidence: the menu exposes Follow (`ReadOnlyHostContent.kt:184-194`), while its only handler displays “not available yet” (`EventDetailScreen.kt:2279-2285`). No organization-follow repository/API path exists.
- Impact: a primary visible action is a dead end rather than a disabled/hidden future feature.
- Fix status: **not changed; reporting only**.

### APP-011 — Organization review browsing is permanently capped at 50

- Severity: **medium**
- Repositories: both
- Evidence: mobile fetches without pagination and offers no load-more (`BillingRepository.kt:2111-2115`). The web route ignores pagination parameters (`mvp-site/src/app/api/organizations/[id]/reviews/route.ts:17-21`); server default/max are 50/100.
- Impact: `reviewCount` can exceed the only review rows any client can browse.
- Fix status: **not changed; reporting only**.

### APP-012 — The pinned JDK makes a normal Windows debug install fail in KSP

- Severity: **medium-high**
- Repository: `mvp-app`
- Runtime evidence: `:composeApp:installDebug` under the repository-pinned JetBrains Runtime 21 failed in `:core:database:kspDebugKotlinAndroid` with `NoClassDefFoundError: sun.awt.PlatformGraphicsInfo`. Running the same checkout with Temurin JDK 17 and headless AWT succeeded and installed v1.6.14/versionCode 67 on the emulator. `scripts/android-emulator-dev.sh` invokes that Gradle install with no JDK selection or prerequisite check, so its documented `install`/`reinstall` path inherits the failure.
- Impact: the documented/current project toolchain is not reproducible on this supported development environment; contributors can spend minutes on a full build before an environment-specific processor crash.
- Fix status: **not changed; reporting only**.

### APP-013 — Authenticated empty-state screens render as unexplained blank pages

- Severity: **medium**
- Repository: `mvp-app`
- Runtime evidence: a new authenticated account with no records showed only the “Chats” title/FAB and only the “Event Management” title/back button; neither page explained the empty result or suggested a next action. By contrast, Teams, Bills, Schedule, and Discover did render useful empty states.
- Code evidence: `ChatListScreen.kt:94-117` renders only `items(chatList)` with no empty branch. `EventManagementScreen.kt:55-67` delegates an empty list to `EventList` with no screen-level empty state.
- Impact: valid zero-data states are visually indistinguishable from failed loading or broken rendering.
- Fix status: **not changed; reporting only**.

### APP-014 — Chat-list operation errors are never rendered

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `ChatListComponent` exposes and populates `errorState` for refresh/create failures (`ChatListComponent.kt:33,89-111,169-198`), but `ChatListScreen.kt:56-130` never collects it. The new-chat dialog dismisses immediately after launching asynchronous creation (`ChatListScreen.kt:185-190`).
- Impact: chat loading or creation can fail with no visible explanation, and a user can believe a dismissed dialog means the chat was created.
- Fix status: **not changed; reporting only**.

### APP-015 — Creation forms show validation errors before the user interacts

- Severity: **medium**
- Repository: `mvp-app`
- Runtime evidence: opening Create Team immediately displayed “Team name is required.” Opening Create Event immediately displayed “Enter a Value”; expanding sections immediately showed sport, division, gender, skill, age, and max-team errors before submit/blur.
- Code evidence: the create-team field derives the required message directly from blank state (`CreateOrEditTeamScreen.kt:882`). Event section components similarly render supporting/error text directly from invalid initial models (`EventDetailsBasicInfoSection.kt:179`; `EventDetailsDivisionsSection.kt:257,318`).
- Impact: untouched forms present as already failed, creating noisy, punitive UX and making it harder to distinguish attempted-submit errors from setup guidance.
- Fix status: **not changed; reporting only**.

### APP-016 — Location search requires an unlabeled map-marker confirmation step

- Severity: **medium-high**
- Repository: `mvp-app`
- Runtime evidence: selecting an autocomplete result moved the map but left the action as “Close Map” and did not populate the event location. The user then had to tap one of many anonymous marker nodes; only then did the action become “Select Location.” The Android UI tree exposed the marker targets as clickable `View` nodes with no text or content description.
- Code evidence: search suggestions call only `onSearch(searchInput)` (`EventMap.android.kt:1293-1301`). Create Event sets `selectionRequiresConfirmation=true` and commits only `pendingMapPlace` through the later map action (`CreateEventScreen.kt:331-375`). Marker composables do not provide an accessibility label that appears in the Android semantics tree (`EventMap.android.kt:790-845`).
- Impact: autocomplete appears not to work, keyboard/screen-reader users cannot identify the required marker, and clustered results make it easy to confirm the wrong place.
- Fix status: **not changed; reporting only**.

### APP-017 — Event image selection can silently no-op and block creation

- Severity: **medium-high**
- Repository: `mvp-app`
- Runtime evidence: the Android system photo picker returned to the event image dialog after a photo was selected, but no thumbnail appeared, no upload request was emitted, Confirm remained disabled, and no error was shown. Since event validation requires an image, the flow could not proceed.
- Code evidence: `EventDetails.kt:2811-2824` silently does nothing when `photos` is empty; picker errors are written only to Napier, not the screen. The selector cannot confirm until a nonblank uploaded/selected image ID exists (`SelectEventImage.kt:121-143`).
- Impact: provider, URI, or picker-result failures strand event creation with no recovery guidance even though the user completed the system selection UI.
- Fix status: **not changed; reporting only**.

### APP-019 — Empty Event Templates gives no path or explanation for creating a template

- Severity: **low-medium**
- Repository: `mvp-app`
- Runtime evidence: the Event Templates screen for a new account rendered only “No event templates yet.” with no CTA or explanation of how templates are produced.
- Code evidence: `ProfileEventTemplatesScreen` has loading, empty text, and existing-template cards only (`ProfileFeatureScreens.kt:976-1024`). The actual create action exists only inside an existing event (`DefaultEventDetailComponent.kt:2520-2541`; `EventDetailScreen.kt:2386,2625`).
- Impact: the prominently advertised Home feature is a dead-end for first-time users who cannot infer that they must create/open an event and then use a separate action.
- Fix status: **not changed; reporting only**.

### APP-020 — Production modules depend on the Android test framework

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: the version catalog maps `libs.androidx.core` to `androidx.test:core:1.7.0` (`gradle/libs.versions.toml`). That alias is used as a main Android dependency in `core/repository-impl/build.gradle.kts` and `core/ui/build.gradle.kts`, not only in `androidUnitTest`.
- Impact: test-only framework code is placed on production compile/runtime classpaths, increasing dependency surface and potentially masking a mistaken expectation that this is `androidx.core:core-ktx`.
- Fix status: **not changed; reporting only**.

### APP-021 — Dependency versions bypass and conflict with the version catalog

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `composeApp/build.gradle.kts:185-199` hard-codes Google auth/client versions older than the catalog entries, while `gradle/libs.versions.toml` separately declares newer values. The Compose stack mixes 1.11.1 and 1.11.3 artifacts, and `libs.coil.compose` is declared twice (`composeApp/build.gradle.kts:125,130`).
- Impact: dependency updates have multiple sources of truth, resolution can change transitively, and ABI/build issues are harder to reproduce or review.
- Fix status: **not changed; reporting only**.

### APP-022 — Build resolution and the Android launcher are machine-specific

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `settings.gradle.kts` enables unrestricted `mavenLocal()`, allowing unpublished local artifacts to satisfy dependencies. `scripts/ensure-local-backend.sh:55` contains a developer-specific `/mnt/c/Users/samue/...` fallback, while `scripts/android-emulator-dev.sh:8` defaults to `Pixel_9_Pro_API_35`; this checkout's configured AVDs are `Pixel_9_Pro_XL_API_35` and `Pixel_Tablet`, so the helper fails without an override.
- Impact: two clean machines can resolve different artifacts, and the normal Android helper fails when the original developer's path/AVD naming is absent.
- Fix status: **not changed; reporting only**.

### APP-023 — Release/build configuration carries avoidable size and conflict-masking settings

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: Compose source information is enabled globally, including release (`composeApp/build.gradle.kts:23-25`); the app and Wear modules use broad `META-INF/*` pick-first rules rather than resolving specific conflicts; language splits are disabled; Gradle/Kotlin/native daemons request up to 12 GB, 8 GB, and 12 GB respectively; optimized resource shrinking and strict R8 keep-rule handling are disabled in `gradle.properties`.
- Impact: release artifacts and builds are larger/heavier than necessary, duplicate-resource conflicts can be silently discarded, and normal development/CI requires unusually large memory allowances.
- Fix status: **not changed; reporting only**.

### APP-025 — The local-backend helper can declare a stale database and dependency tree ready

- Severity: **medium-high**
- Repository: `mvp-app` / `mvp-site` development integration
- Evidence: `scripts/ensure-local-backend.sh:143-151` starts only the Postgres container and never runs the site's tracked `prisma migrate deploy` command. It treats an HTTP 200 from `/` as full readiness (`:154-156,247-254`), even though API handlers can still target missing columns. It also skips dependency synchronization whenever any `node_modules` directory exists (`:158-177`) and otherwise uses mutable `npm install` instead of the lockfile-reproducible install path.
- Runtime evidence: the pre-existing local database could serve the home page while 38 tracked migrations were pending; registration then failed with Prisma `P2022` on a missing column. Replaying all 142 migrations into an isolated database was required before broader API/mobile testing could proceed.
- Impact: the advertised one-command mobile development path can look healthy while mutation APIs fail or execute against stale package code, making schema and dependency state an implicit second source of truth.
- Fix status: **not changed; reporting only**.

### APP-026 — The Windows development launcher can install a stale APK after a failed build

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `dev.ps1` runs Gradle, `adb install`, and `adb shell am start` as native commands without inspecting `$LASTEXITCODE` (`Install-And-LaunchAndroid`, lines 158-178). `$ErrorActionPreference = "Stop"` does not by itself convert nonzero native exits into terminating errors on the supported PowerShell variants. After Gradle returns nonzero, the script only checks whether `composeApp-debug.apk` exists; a prior artifact therefore satisfies the check and can be installed. The backend path similarly continues after its port wait times out (`Wait-ForPort`, lines 133-147).
- Impact: a developer or QA run can claim to launch the current checkout while actually exercising an old binary and/or unavailable backend, invalidating version-specific testing and masking build failures.
- Fix status: **not changed; reporting only**.

### APP-027 — Wear player pickers display internal user IDs instead of names

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `loadOfficialSchedule` hard-codes `usersById = emptyMap()` before hydrating teams (`WearMatchRepository.kt:108-111`). `toWearTeam` falls back to the raw participant user ID whenever that map lacks a profile (`:1023-1048`). A chunked `fetchUsers` implementation exists at `:978-989` but has no caller.
- Impact: real roster pickers and incident details show opaque IDs where officials need to identify a player quickly; the debug demo masks the defect by injecting names directly.
- Fix status: **not changed; reporting only**.

### APP-028 — Wear match actions remain re-entrant while mutations are in flight

- Severity: **high**
- Repository: `mvp-app`
- Evidence: Android's `MvpWearViewModel.runMatchAction` sets `isLoading = false` immediately before launching check-in, start, reset, end-segment, and end-match mutations (`MvpWearViewModel.kt:548-579`). Incident Finish changes its label to the already-complete word `Finished` but remains enabled.
- Impact: repeated taps can enqueue multiple lifecycle or score-adjacent offline operations while the first is still running, compounding the unsynchronized operation-store race and producing misleading completion UI.
- Fix status: **not changed; reporting only**.

### APP-029 — Wear set-scoring UI displays cumulative points while editing the active segment

- Severity: **high**
- Repository: `mvp-app`
- Evidence: both score pickers sum scores across every segment (`MvpWearApp.kt:391-403,1470-1473`; `WatchOfficialAppView.swift:236-267,1097-1102`) while a tap writes only the active/next segment's current points (`WearMatchRepository.kt:494-521`; `WatchMatchRepository.swift:429-455`). Neither UI branch accounts for `scoringModel == "SETS"`.
- Impact: after a completed 25–20 set, the next set begins visually at 25–20; adding its first point displays 26–20 even though the active set is 1–0. Officials can enter or trust the wrong score in volleyball, tennis, and other segment/set sports.
- Fix status: **not changed; reporting only**.

### APP-030 — The empty Wear match list renders duplicate Refresh actions

- Severity: **low**
- Repository: `mvp-app`
- Evidence: Android Wear adds a standalone Refresh chip inside the empty branch and then unconditionally renders a second beside Logout (`MvpWearApp.kt:180-201`).
- Impact: the smallest and most common first-use watch state wastes scarce screen space on duplicate actions and makes the hierarchy look accidental.
- Fix status: **not changed; reporting only**.

### APP-031 — Wear can create and edit incidents but provides no delete path

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: both local patch engines implement `incidentOperations` action `DELETE` (`WearMatchRepository.kt:846-858`; `WatchMatchRepository.swift:720-734`), but neither repository/view model exposes a delete method and both incident editors offer only Cancel and Finish (`MvpWearApp.kt:560-577`; `WatchOfficialAppView.swift:341-388`).
- Impact: an official who records the wrong incident cannot remove it from the watch and must switch devices or leave incorrect match history in place.
- Fix status: **not changed; reporting only**.

### APP-033 — Wear login fields are unlabeled in the accessibility tree

- Severity: **medium-high**
- Repository: `mvp-app`
- Runtime evidence: the installed debug Wear activity rendered both fields, but Android UI Automator exposed each `EditText` with empty text/content-description and only a separate child placeholder. Once a value is entered, that placeholder disappears. The UI-tree-derived Sign in tap correctly showed validation, proving the tree was live rather than stale.
- Code evidence: `WearTextField` uses a `BasicTextField` plus conditionally drawn `BasicText` placeholder with no `semantics`, content description, or persistent label (`MvpWearApp.kt:905-942`).
- Impact: TalkBack users cannot reliably distinguish email from password after typing, blocking an authentication path on a small nonvisual interface.
- Fix status: **not changed; reporting only**.

### APP-034 — Wear match timer unnecessarily zero-pads minutes to three digits

- Severity: **low**
- Repository: `mvp-app`
- Runtime evidence: the timer demo rendered `073:52` during the second half of a soccer match.
- Code evidence: Android always uses `minutes.toString().padStart(3, '0')` (`MvpWearApp.kt:1491-1496`), even for ordinary 0–99 minute clocks.
- Impact: the largest watch UI element spends horizontal space on a leading zero and departs from familiar sports-clock notation such as `73:52`.
- Fix status: **not changed; reporting only**.

### APP-044 — Android payment-sheet setup failures silently leave checkout loading forever

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `PaymentProcessor.presentPaymentSheet` does nothing when the stored purchase intent, client secret, or `PaymentSheet` is absent (`PaymentProcessor.android.kt:31-56`). `setPaymentIntent` likewise returns without a failure result when its Compose-provided context or publishable key is absent (`:59-79`). Checkout callers show “Waiting for Payment Completion” immediately before presentation and hide it only from result/error handling (`EventRegistrationActionHandler.kt:949-959`; `ProfileComponent.kt:1565-1580`).
- Impact: malformed purchase-intent responses or a lifecycle race before `PreparePaymentProcessor` yield no sheet, no `PaymentResult.Failed`, and no recovery action while the UI remains blocked.
- Fix status: **not changed; reporting only**.

### APP-045 — Android image uploads synchronously load the entire selected file on the main dispatcher

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: Android calls `InputStream.readBytes()` to materialize the complete file (`ImageUploadHandler.android.kt:11-14,26-35`). Shared callers invoke this non-suspending conversion inside main-dispatcher component scopes before upload, with no byte, pixel, or file-size limit (for example `DefaultCreateEventComponent.kt:400-414` and `ProfileCompletionComponent.kt:88-100`).
- Impact: large camera images can freeze UI and temporarily require multiple full-file allocations, leading to memory pressure or termination before server-side upload validation can run.
- Fix status: **not changed; reporting only**.

### APP-051 — Android's numeric keyboard cannot enter the fractional percentages the form accepts

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: the discount editor explicitly accepts one decimal point and formats up to two fractional digits (`ProfileFeatureScreens.kt:513-540`), but passes `keyboardType = "number"` (`:411-428`). Android maps both `"number"` and `"money"` to Compose `KeyboardType.Number`, not `Decimal` (`PlatformTextField.android.kt:303-309`).
- Impact: touch-keyboard users cannot type advertised/accepted values such as `12.5%`; only whole percentages are reachable unless the user pastes text or uses external hardware.
- Fix status: **not changed; reporting only**.

### APP-052 — Android map components retain active coroutines and back callbacks after destruction

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `MapComponent` creates its own `CoroutineScope(SupervisorJob() + Dispatchers.Main)`, registers a `BackCallback`, and starts two permanent collectors (`MapComponent.kt:55-82,127-202`). Its `InstanceKeeper` cleanup stops only `LocationTracker`; it does not cancel the scope or unregister the callback (`:242-246`).
- Impact: leaving/recreating Discover can retain the component, collectors, state flows, repository/context references, and back callback. If the map was visible, the collector can remain suspended/active around a stopped tracker; repeated navigation can accumulate leaked behavior and stale back handling.
- Fix status: **not changed; reporting only**.

### APP-053 — Android multi-select dropdowns render valid-but-unloaded selections as blank

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: when `selectedValues` is nonempty, `PlatformDropdown` maps only values currently present in `options` and joins the results (`PlatformDropdown.android.kt:52-60`). If options are paginated, failed, filtered, or a legacy value is no longer offered, `mapNotNull` removes every selected value and returns an empty display string instead of the placeholder or raw stored value. Single-select explicitly preserves the raw value (`:62-64`).
- Impact: the authoritative model can contain selections while the form looks blank, encouraging accidental replacement and hiding legacy/source-of-truth mismatches.
- Fix status: **not changed; reporting only**.

### APP-054 — Tappable Android date/dropdown fields expose disabled semantics and no press feedback

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: every read-only field with `onTap` is wrapped in a parent `clickable` whose indication is explicitly `null`, while the visible `OutlinedTextField` is rendered with `enabled = false` (`PlatformTextField.android.kt:217-239`). `PlatformDropdown` uses this path for all 29 shared dropdown call sites (`PlatformDropdown.android.kt:68-93`), DOB/date fields use it as well, and `SearchBox.kt:573-594` independently repeats the same pattern.
- Impact: controls that open pickers are visually/semantically presented as disabled, provide no touch feedback, and can be announced as unavailable by accessibility services even though the outer container accepts taps.
- Fix status: **not changed; reporting only**.

### APP-055 — Player actions can crash before loading-handler injection and strand the loader on failure

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `PlayerInteractionComponent.kt:38-90` stores its loading handler in a `lateinit` property, then every friend/follow/block action dereferences it before and after the repository call. There is no constructor requirement, initialized guard, or `try/finally`; the injected `chatRepository` is unused.
- Impact: a fast interaction before composition-side handler injection, or any caller that omits injection, throws `UninitializedPropertyAccessException`. An unexpected repository exception or cancellation after `showLoading` leaves the global loading surface visible indefinitely.
- Fix status: **not changed; reporting only**.

### APP-056 — The global loading state has no operation ownership or overlap accounting

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `LoadingHandler.kt:21-35` has one mutable `LoadingState`; every `showLoading` overwrites it and every `hideLoading` clears it. Callers such as `PlayerInteractionComponent` can launch multiple independent actions without mutual exclusion or an operation token.
- Impact: when operations overlap, the first completion can hide the second operation's loader, later starts replace earlier progress/messages, and a late completion can clear unrelated work. The UI cannot reliably represent which operation owns the blocking state.
- Fix status: **not changed; reporting only**.

### APP-057 — Event tag selection does not collapse the dropdown when configured to do so

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: selection closes `EventTagSearchDropdown` only when `collapseOnSelect && !hasFocus` (`EventTagSearchDropdown.kt:122-144`). The search field remains focused while a chip in the non-focusable popup is selected, so the same branch sets `expanded = true`. The event editor actively passes `collapseOnSelect = true` (`EventDetailsBasicInfoSection.kt:329-346`).
- Impact: the tag picker remains expanded after selection and can continue obscuring the event editor despite the caller explicitly requesting collapse behavior.
- Fix status: **not changed; reporting only**.

### APP-058 — Guide placement assumes a fixed card height that the content does not enforce

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `GuideHost.kt:62,197-224` positions/clamps the coach-mark card using a fixed 188dp estimated height, while the actual title, body, progress, and buttons are not height-constrained and can grow with copy or font scale.
- Impact: long localized text or large accessibility fonts can make the real card extend below the calculated safe area, clipping guidance or its navigation buttons offscreen.
- Fix status: **not changed; reporting only**.

### APP-059 — Slow billing-address resolution can overwrite newer manual input

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: after a suggestion is selected, `BillingAddressAutocomplete.kt:213-228` launches asynchronous place resolution and unconditionally invokes `onAddressSelected` on success. The standard address field remains editable during the request (`:175-201`), and there is no request ID, cancellation, or current-query/selection equality check.
- Impact: if the user continues typing or chooses another value before the first lookup finishes, the stale response can overwrite line 1, city, state, and ZIP with the older selection.
- Fix status: **not changed; reporting only**.

### APP-060 — Draft/private lifecycle badges overlay event date and price content

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: the event card's normal content column ends with the date/price row and reserves no bottom badge space (`EventCard.kt:283-401`). Draft/private lifecycle text is a separate sibling aligned over the same box at `BottomCenter` with only 12dp bottom padding (`:402-419`).
- Impact: cards with lifecycle labels can draw that label over the date/price row, reducing legibility and tap confidence in a high-frequency discovery surface.
- Fix status: **not changed; reporting only**.

### APP-061 — Long team rosters can push dialog actions offscreen

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `TeamDetailsDialog.kt:109-363` places an unconstrained `LazyColumn` for members (`:245-313`) inside a non-scrollable outer column, followed by join/leave actions and Close (`:315-363`). The roster has no weight, maximum height, or reserved action area.
- Impact: a sufficiently long roster can consume the dialog's vertical constraint and clip or push the only dismissal and membership actions beyond the reachable viewport.
- Fix status: **not changed; reporting only**.

### APP-062 — Team member rows compose conflicting click handlers

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `TeamDetailsDialog.kt:253-277` passes a clickable modifier that toggles compliance to `PlayerCardWithActions`; that component appends a second row-level clickable for its action popup (`PlayerCardWithActions.kt:65-72`). A separate compliance strip is already clickable.
- Impact: a member-row tap can be consumed by one of two nested modifier handlers, unexpectedly toggling compliance, opening the popup, or behaving differently as modifier order changes.
- Fix status: **not changed; reporting only**.

### APP-063 — SearchBox exposes a submit callback that is never called and owns unsynchronizable query state

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `SearchBox.kt:74-145` accepts `onSearch` but never invokes it; edits only call `onChange`, and the field owns a parameterless remembered `searchInput`. `SearchPlayerDialog.kt:93-140` resets its parent `searchQuery` when switching invite mode, but cannot reset the visible child value. The field also has no search IME action.
- Impact: callers cannot distinguish editing from submission, keyboard submit is unreachable, and parent state can say the query is empty while the user still sees and edits the prior value.
- Fix status: **not changed; reporting only**.

### APP-064 — Event filters can apply contradictory or invisible state

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `SearchBox.kt:209-216` marks the filter active only when the end date is non-null, ignoring a changed start date. Its two date pickers independently update bounds without enforcing end >= start (`:303-330`). Price inputs retain typed text but silently refuse to update the applied filter when parsing fails or min exceeds max (`:439-445,475-488`).
- Impact: the filter icon can look inactive while a start-date filter is applied; inverted dates can produce empty results; and visible price text can disagree with the actual filter sent to search.
- Fix status: **not changed; reporting only**.

### APP-065 — Offline chat messages have no deterministic ordering

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the network request explicitly asks for ascending message order, but `MessageDao.getMessagesInChatGroup` executes `SELECT * FROM MessageMVP WHERE chatId = :chatGroupId` with no `ORDER BY` (`MessageDao.kt:29-30`). `MessageRepository.getMessagesInChatGroup` returns that DAO list directly as the local/cache branch (`MessageRepository.kt:23-31`), and Room/SQLite does not guarantee insertion or primary-key order without an ordering clause.
- Impact: after restart or when the network fails, a conversation can render messages out of chronological order even though the same conversation is ordered correctly immediately after a remote fetch.
- Suggested direction: order the DAO query by `sentTime` with an ID tie-breaker and retain that order through relation/query consumers.
- Fix status: **not changed; reporting only**.

### APP-066 — Android reloads only the oldest 100 messages and has no path to newer history

- Severity: **high**
- Repositories: both
- Evidence: Android always requests `limit=100&order=asc`, maps only the returned `messages`, and exposes no index/cursor or load-more method (`MessageRepository.kt:23-31`; `MessagesResponseDto` in `ChatDtos.kt`). The web handler clamps the page to 100, orders ascending, and returns `nextIndex`/`hasMore` pagination metadata (`src/app/api/chat/groups/[id]/messages/route.ts:24-59`).
- Impact: once a chat has more than 100 retained messages, a refresh, reinstall, or new device receives the oldest page and omits every newer server message. Messages created during the current install may remain in Room temporarily, which masks the loss until cache replacement or a clean client.
- Suggested direction: page from the newest end for initial display and implement cursor/index-based older-history loading, with DTOs that retain and test the server pagination contract.
- Fix status: **not changed; reporting only**.

### APP-067 — Guide completion state is shared by every account on the device

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `CurrentUserDataSource` stores one global `completed_guide_ids` preference and exposes account-agnostic collect/mark methods (`CurrentUserDataSource.kt:41,147-165`). `RootComponent` consumes that global set, while normal logout clears neither it nor any user-specific namespace (`RootComponent.kt:299-333`; `UserRepository.kt:754-766`). The only reset call is a manual debug/profile action (`ProfileComponent.kt:992-998`).
- Impact: when a second person signs into the same installation, onboarding and contextual guides completed by the previous account are silently skipped. Guide progress is therefore device-global despite being rendered as part of the signed-in user experience.
- Suggested direction: key completion by user ID or store it in the user-owned backend profile; define intentional behavior for guest-to-account migration and logout.
- Fix status: **not changed; reporting only**.

### APP-068 — Failed profile attachment leaves uploaded image files orphaned

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `ImagesRepository.uploadImage` first creates the server file, extracts its ID, then calls `addImageToUser(fileId).getOrThrow()` (`ImagesRepository.kt:26-54`). If the subsequent user-profile update fails, the outer `runCatching` returns failure but never calls `deleteImage` for the already-created file.
- Impact: retrying after a transient profile-update failure uploads another object while the prior file remains stored and unreferenced. Repeated failures leak storage rows/objects and make the user believe no upload succeeded even though server-side artifacts were created.
- Suggested direction: make upload-and-associate a server transaction/workflow, or compensate by deleting the new file when association fails and surface compensation failure for cleanup.
- Fix status: **not changed; reporting only**.

### APP-069 — Direct-message creation is a cross-client check-then-create race

- Severity: **high**
- Repositories: both
- Evidence: web lists the current user's groups, searches locally for the same two participants, then separately POSTs a new group (`src/lib/chatService.ts:310-340`). Android repeats the same non-atomic sequence against its current `chatGroupsFlow` (`ChatGroupRepository.kt:331-364`). The POST handler always inserts the caller-supplied ID after participant checks (`src/app/api/chat/groups/route.ts:87-140`), and `ChatGroup` has no canonical participant-pair key or uniqueness constraint—only `teamId` is unique (`prisma/schema.prisma:1319-1334`).
- Impact: two devices, web and Android, or two near-simultaneous taps can both observe no existing DM and create separate chats for the same pair. Messages, unread counts, moderation, and history then split across indistinguishable conversations.
- Suggested direction: canonicalize the sorted participant pair on the server and perform an atomic unique upsert/transaction; clients should consume that idempotent endpoint instead of deciding uniqueness from local lists.
- Fix status: **not changed; reporting only**.

### APP-070 — Bracket link pickers offer cycle-producing choices as “valid”

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `filterValidNextMatchCandidates` builds and fully validates each candidate graph, but discards `result.ok` and every validation error; it accepts a candidate solely when that target's incoming count is at most two (`BracketGraphValidator.kt:194-227`). `MatchEditDialog` uses this result directly for winner/loser dropdown choices, then only rejects the resulting cycle after Save is pressed (`MatchEditDialog.kt:231-249,755-773`). Existing tests cover capacity, duplicate-lane, whitespace, and tolerance of an unrelated bad reference, but no candidate-created cycle (`BracketGraphValidatorTest.kt:7-76`).
- Impact: the editor visibly offers a downstream/upstream link that its own validator already knows creates a cycle. The user can select it and fill the rest of the form, only to receive an avoidable validation error at submission.
- Suggested direction: compare validation errors before/after each mutation and exclude candidates that introduce a self-reference, cycle, or new capacity/reference error while still tolerating unrelated pre-existing graph errors; add the missing cycle regression test.
- Fix status: **not changed; reporting only**.

### APP-074 — Match detail crashes when an unnamed team contains a player with an empty last name

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: when a related team name is null, both team labels join player names with `it.lastName.first()` (`MatchDetailScreen.kt:871-895`). `UserData.lastName` is a non-null `String`, not a non-empty type, and incomplete/legacy profiles can decode/cache an empty string; there is no `firstOrNull`, trim, or fallback in this rendering path.
- Impact: opening match detail for that valid-but-incomplete relation throws `NoSuchElementException` during composition, making the match/officiating screen unreachable instead of showing a fallback participant label.
- Suggested direction: centralize safe display-name/initial formatting, treat blank names explicitly, and test empty/whitespace/one-name legacy profiles in team and match UI.
- Fix status: **not changed; reporting only**.

### APP-075 — Refund refreshes race and its component work survives navigation

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `DefaultRefundManagerComponent` creates an independent `CoroutineScope(Dispatchers.Default + SupervisorJob())` with no Decompose lifecycle cancellation (`RefundManagerComponent.kt:32-58`). Init and every pull-to-refresh call launch another uncancelled `loadRefunds`; each response can overwrite the list and set the one shared loading boolean false regardless of newer work (`:61-75`). Approval/rejection use an injected `lateinit` loading handler with no `try/finally` (`:51-55,81-104`).
- Impact: rapid refreshes can let an older response replace newer refund state and hide the refresh indicator while another request is active. Navigating away does not stop the fetch/mutations, and an exception before the final hide call can strand the global loader or crash before screen injection (also APP-055/APP-056).
- Suggested direction: bind one component scope/job to lifecycle destruction, cancel/replace refresh work or use request generations, and make each mutation own cleanup in `finally`.
- Fix status: **not changed; reporting only**.

### APP-076 — The refund approval screen omits the financial scope it is about to execute

- Severity: **critical**
- Repositories: both
- Evidence: Android cards show only a truncated request ID, optional requester/event, and free-text reason before offering Approve/Reject (`RefundManagerScreen.kt:128-273`). The mobile `RefundRequest`/relation model contains no requested amount, refundable amount, currency, payment/bill IDs, occurrence, policy result, or creation date (`RefundRequest.kt:9-17`; `RefundRequestWithRelations.kt:8-26`) because the canonical Prisma request has none (`prisma/schema.prisma:1680-1691`). Approval can then execute multiple Stripe refunds resolved dynamically by event/user/team (`src/app/api/refund-requests/[id]/route.ts:105-145`).
- Impact: a host cannot tell how much money, which payments, which weekly occurrence, or how many people will be refunded before confirming an irreversible financial action. SEC-043/DATA-026 make that missing preview especially dangerous because the actual scope can be far broader than the visible requester/event.
- Suggested direction: return and display an authoritative approval preview with payment count, per-payment/currency amounts, total refundable cents, registrant/occurrence, policy basis, and any scope drift; require confirmation against a versioned preview/idempotency key.
- Fix status: **not changed; reporting only**.

### APP-077 — Android event management permanently truncates a host's list at 200

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the repository makes one `api/events?hostId=...&limit=200` request and models no pagination metadata or next page (`EventRepository.kt:1210-1214,2239-2266`). `DefaultEventManagementComponent` exposes `hasMoreEvents`, `isLoadingMore`, and `loadMoreEvents`, but init immediately sets `hasMoreEvents=false`; `loadMoreEvents` can therefore never pass its guard and contains no load implementation anyway (`EventManagementComponent.kt:67-97`). The screen still wires those states into `EventList` (`EventManagementScreen.kt:23-64`).
- Impact: hosts with more than 200 current/historical events cannot reach the rest from Event Management, while the dormant pagination API makes the screen appear implemented and prevents callers from detecting truncation.
- Suggested direction: consume the server pagination contract with a cursor/index owner and deduplicated page state, or explicitly provide a complete server-side management query; remove the dead loading handler/pagination surface if the product intentionally caps the list.
- Fix status: **not changed; reporting only**.

### APP-078 — Android lets hosts configure payment plans, then deletes them at Create

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: the create component exposes active setters for enabling plans and editing installment count, amounts, and due dates; those setters intentionally bypass selection normalization so the draft retains the plan (`DefaultCreateEventComponent.kt:508-652`). `CreateEventScreen` wires those setters into the form (`CreateEventScreen.kt:305-311`). However `createEvent()` calls `hostSyncedDraft.applyCreateSelectionRules()` immediately before validation/submission (`DefaultCreateEventComponent.kt:326-344`), and that rule unconditionally sets event and every division `allowPaymentPlans=false`, clears the count, and empties all installment arrays (`CreateEventSelectionRules.kt:7-38`). Seeded/template drafts and ordinary field edits are normalized through the same destructive rule.
- Impact: the host can complete a visible installment plan and create the event successfully, but the persisted event silently requires the non-plan payment path. This is a financial-contract mismatch between the reviewed draft and the created product, not merely an unavailable feature.
- Suggested direction: selection rules should preserve valid plan state and only clear it when an explicit incompatible type/price transition requires that change; add a create-payload regression test proving configured event/division installments survive submission.
- Fix status: **not changed; reporting only**.

### APP-079 — Team Management owns an immortal scope and back callback

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `DefaultTeamManagementComponent` ignores Decompose lifecycle scope support and creates a standalone `CoroutineScope(Dispatchers.Main + SupervisorJob())` (`TeamManagementComponent.kt:83-97`). It eagerly collects current user, teams, host events, invite context, friends, sports, and selected-team changes, and registers a maximum-priority `BackCallback` (`:100-105,128-277`), but has no cancellation/unregister path. The callback can remain enabled whenever an editor was selected (`:284-290`).
- Impact: leaving Team Management can retain the component/repository collectors and continue network/cache work. A stale maximum-priority callback can consume a later Back press merely to deselect an off-screen team, while repeated navigation creates additional permanent collectors.
- Suggested direction: use `componentContext.lifecycle.coroutineScope`, unregister/disable callbacks on destruction, and add a navigation-away test that proves collectors and Back handling stop.
- Fix status: **not changed; reporting only**.

### APP-080 — A deleted or externally removed team remains open as a stale editable snapshot

- Severity: **high**
- Repository: `mvp-app`
- Evidence: while a team is selected, the `currentTeams` collector replaces it when an updated row is found; when that ID disappears, it deliberately keeps the old `selectedTeam` and only refreshes its staff users (`TeamManagementComponent.kt:264-275`). `deleteTeam` does not deselect on success (`:435-440`), and external deletion/removal reaches the same missing-ID branch. The screen renders the editor whenever `selectedTeam` is non-null (`TeamManagementScreen.kt:89-160`).
- Impact: after server/local deletion or membership removal, Android can continue displaying and editing a team that no longer exists or is no longer authorized. Subsequent actions fail against a stale snapshot and navigation/back state remains in editor mode.
- Suggested direction: clear selection (or surface an explicit archived/read-only state) when the authoritative team flow loses the ID; wait for mutation acknowledgement before closing or retaining the editor.
- Fix status: **not changed; reporting only**.

### APP-081 — Most Team Management failures are written to an unobservable private state

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the implementation writes repository failures into `_errorState` across team loading, friends/sports, join, leave, delete, search, invite, compliance, and staff hydration (`TeamManagementComponent.kt:106,135-139,224-262,335-470,498-505`). `TeamManagementComponent` does not expose `errorState`, and `TeamManagementScreen` has no collector/popup for it (`TeamManagementComponent.kt:42-81`; `TeamManagementScreen.kt:49-289`). Only create/update/refund callbacks separately populate the screen's local `saveError`.
- Impact: failed leave/delete/invite/join/refresh/search actions appear to succeed or do nothing. Delete closes the editor immediately (`TeamManagementScreen.kt:139-142`), so a rejected deletion is especially misleading and the user receives no recovery guidance.
- Suggested direction: expose one typed UI event/error flow and consume it once in the screen; keep mutation-specific busy/error state beside each action and close editors only after acknowledged success.
- Fix status: **not changed; reporting only**.

### APP-082 — Team and chat invite searches can replace a newer query with stale results

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: the team invite dialog invokes `onSearch(query)` from a `LaunchedEffect` for every query of at least two characters, with no debounce (`CreateOrEditTeamScreen.kt:1430-1437`). `DefaultTeamManagementComponent.searchPlayers` launches a new independent repository request each time and assigns every completion to the same `_suggestedPlayers` list without query identity or cancellation (`TeamManagementComponent.kt:443-451`). Chat management delegates through the shared search dialog to an identical independent-launch implementation (`ChatGroupScreen.kt:492-571`; `ChatGroupComponent.kt:271-277`).
- Impact: a slower response for an earlier prefix can arrive after the latest response, so the visible query and selectable people disagree. An inviter can select the wrong similarly named account from stale results.
- Suggested direction: own query as a flow and use debounce plus `flatMapLatest`, or tag responses and discard any whose normalized query is no longer current.
- Fix status: **not changed; reporting only**.

### APP-083 — Leaving a chat outside its Back action can suppress future notifications globally

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the component sets the singleton push repository's `activeChatId` whenever its chat flow resolves (`ChatGroupComponent.kt:134-150`). It clears that global only in explicit `onBack`, successful delete/leave, or report-and-leave paths (`:196-199,239-268,326-344`). There is no lifecycle-destroy cleanup, so logout, root replacement, deep-link navigation, or component removal through another navigation path can leave the old ID active after the lifecycle scope stops.
- Impact: foreground pushes for that chat are suppressed by `PushNotificationsRepository` because it still believes the off-screen conversation is active. The user can miss notification UI indefinitely until another chat/back action overwrites the singleton state.
- Suggested direction: derive active destination from root navigation state or register lifecycle cleanup that conditionally clears only the ID owned by this component.
- Fix status: **not changed; reporting only**.

### APP-084 — A failed send permanently discards the user's message draft

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `sendMessage` trims the text and immediately sets `_messageInput` to empty before launching `createMessage` (`ChatGroupComponent.kt:205-226`). On failure it only sets an error string and never restores the draft or creates a retryable pending message (`:227-230`).
- Impact: network, authorization, terms, or validation failures erase what the user typed—potentially a long message—with no Retry action or recoverable local outbox.
- Suggested direction: keep the draft until acknowledged or persist a pending/failed message row with retry/copy/edit actions; clear the composer only after ownership transfers to that durable state.
- Fix status: **not changed; reporting only**.

### APP-085 — Chat success and partial-success states are rendered as persistent errors

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: after a message is successfully stored, failure of the separate notification relay writes to the same `_errorState`, making the UI imply the message failed (`ChatGroupComponent.kt:225-235`). A successful report without leaving sets the literal success text `Chat reported.` into `_errorState` (`:326-343`). `ChatGroupScreen` renders every nonblank value permanently in error color and exposes no clear/consume action (`ChatGroupScreen.kt:78-86,209-216`).
- Impact: users can resend an already-created message after seeing an apparent error, and a successful report remains styled as a failure for the life of the screen. Distinct domain outcomes collapse into one sticky string.
- Suggested direction: model send acknowledgement, notification warning, report confirmation, and actionable errors as separate consumable UI events/states; do not treat relay failure as message-send failure.
- Fix status: **not changed; reporting only**.

### APP-086 — Incoming messages always yank the conversation to the bottom

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `ChatGroupScreen` calls `animateScrollToItem(last)` whenever `messages.size` changes, without checking the user's current position or who sent the message (`ChatGroupScreen.kt:101-127`). A tested `shouldAutoScrollToLatest` policy exists that scrolls only near the bottom, on initial load, or for the current user's message (`ChatScrollPolicy.kt:3-12`), but it has no production caller.
- Impact: while reading older messages, any incoming message forcibly moves the user away from their context. This becomes worse once proper history pagination is added; the existing policy/tests give false confidence because the live screen bypasses them.
- Suggested direction: wire the tested policy to list-state visibility/message ownership and show a “new messages” affordance when the user is away from the bottom.
- Fix status: **not changed; reporting only**.

### APP-087 — Chat loading is rendered as an empty, interactive conversation

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `chatGroup` starts as null while direct-message creation/cache/network work runs (`ChatGroupComponent.kt:87-95`). The screen substitutes `ChatGroup.empty()`, an empty user/message list, and the title `Chat`, but still renders enabled options and composer controls (`ChatGroupScreen.kt:78-100,135-295`). `sendMessage` silently returns when the underlying group is still null (`ChatGroupComponent.kt:205-213`).
- Impact: users see a blank chat that looks ready, can type and tap Send, and receive no feedback because the action is dropped. Load failure is visually close to a genuinely empty chat and only a small error line may appear later.
- Suggested direction: render explicit loading/error/not-found states and disable all group actions until a real group ID is available; preserve any draft typed during transition.
- Fix status: **not changed; reporting only**.

### APP-088 — Rental conflict discovery silently stops after 300 organization events

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `RentalAvailabilityLoader.loadBusyBlocks` requests `getEventsByOrganization(..., limit = 300)` once and exposes no pagination/cursor loop (`RentalAvailabilityLoader.kt:78-91`). It derives all direct-event, weekly-event, league-slot, tournament-slot, and match conflicts only from that truncated list (`:92-169`).
- Impact: an organization with more than 300 returned events can have legitimate bookings omitted from the mobile availability grid, allowing a user to proceed toward payment for an occupied field. Which conflicts disappear depends on repository/API ordering.
- Suggested direction: use a server availability endpoint scoped to the requested fields/date window, or exhaust deterministic pagination before declaring a range free; never interpret a page cap as complete conflict state.
- Fix status: **not changed; reporting only**.

### APP-089 — Weekly events block fields continuously across their entire season

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `RentalAvailabilityLoader` handles `EVENT` and `WEEKLY_EVENT` identically by creating one busy block from `event.start` through `event.end` for every field (`RentalAvailabilityLoader.kt:96-110`). League/tournament repeating slots are expanded into their actual day/time occurrences, but weekly events are not.
- Impact: a weekly event that runs one evening per week can make the mobile rental calendar show its fields unavailable 24/7 for every day between the season start and end. This can suppress valid inventory for weeks or months.
- Suggested direction: expand weekly-event schedule days/times into occurrence blocks using the canonical scheduling contract, retaining the direct interval only for truly one-time events.
- Fix status: **not changed; reporting only**.

### APP-090 — Multi-day repeating rental slots work on the server but only one day on Android

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the mobile `TimeSlot.matchesRentalSelection` repeating branch reduces a slot to one day via `toMondayBasedDayIndex` and never reads `daysOfWeek` (`RentalSchedulingUtils.kt:437-492`). The canonical rental-order validator explicitly prefers the full `daysOfWeek` array and accepts any listed day (`src/app/api/public/organizations/[slug]/rental-orders/route.ts:119-132`). Multi-day schedules are a required form-boundary behavior.
- Impact: facilities that publish one rental slot across several weekdays appear available on only one day in Android; valid inventory accepted by the backend cannot be selected in the app.
- Suggested direction: normalize the full day array with the same Monday-based contract used by the server, falling back to legacy `dayOfWeek` only when the array is absent.
- Fix status: **not changed; reporting only**.

### APP-091 — Android can charge for a stitched rental range that the server then rejects

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: mobile `resolveRentalRange` covers each 30-minute segment independently, may select different slots, and returns the stitched range as valid (`RentalSchedulingUtils.kt:155-202`). `OrganizationDetailScreen` sends that whole range as one rental-order selection (`OrganizationDetailScreen.kt:767-806`) and starts PaymentSheet before creating the order (`OrganizationDetailComponent.kt:662-742,1042-1063`). The server requires one availability slot to cover the entire selection (`src/app/api/public/organizations/[slug]/rental-orders/route.ts:253-273`). On order failure, mobile clears `pendingRentalReservation`, shows an error, and has no refund or durable retry path.
- Impact: a range assembled from adjacent availability slots can pass Android validation and payment, then fail server reservation after funds have succeeded. More generally, any post-PaymentSheet order failure loses the only pending context and can leave a charged user without a booking.
- Suggested direction: align client selection rules with the server contract before payment (or make the server accept/price explicit segment IDs), and make payment plus booking a server-owned recoverable transaction with idempotent retry/automatic compensation.
- Fix status: **not changed; reporting only**.

### APP-092 — Multi-selection rental checkout locks every selected field across all gaps

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the screen collapses all selections to the earliest start and latest end and all distinct fields (`OrganizationDetailScreen.kt:252-276`). The purchase-intent request then creates one synthetic time-slot context spanning that full interval and every selected field (`OrganizationDetailComponent.kt:1069-1110`), rather than sending the actual per-field selections used later by the rental-order API.
- Impact: selecting separate bookings—especially on different days—can lock unrelated hours and fields for the duration of checkout, cause false conflicts, and deny inventory to other customers even though those gaps are not being purchased.
- Suggested direction: reserve exactly the normalized per-selection field/time windows under one checkout owner; carry those same windows unchanged through intent creation and order confirmation.
- Fix status: **not changed; reporting only**.

### APP-093 — Discover's filter height is forced to at least 640dp even when the screen is smaller

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventSearchScreen` calculates the pixels actually available below the search box and above navigation, then calls `availablePx.coerceAtLeast(640.dp.toPx())` before passing the value as `filterMaxHeight` (`EventSearchScreen.kt:940-951`).
- Impact: on phones, split screen, large display scaling, or an open keyboard, the filter dropdown is deliberately made taller than its available viewport; controls can extend behind navigation or off-screen.
- Suggested direction: clamp the dropdown to the positive available space, with 640dp as an upper design cap rather than a lower bound, and verify constrained/large-font layouts.
- Fix status: **not changed; reporting only**.

### APP-094 — Weekly date filters exclude seasons that overlap the selected range

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: for `WEEKLY_EVENT`, `EventFilter.filter` accepts the lower bound when the season end is after it, but rejects the event whenever `effectiveWeeklyEnd > date.second` (`EventFilter.kt:31-44`). That requires the whole season to end inside the selected range instead of testing whether any occurrence/season interval overlaps it. Existing `EventFilterTest` covers only ordinary events.
- Impact: filtering for a week or short date window hides ongoing weekly leagues/events whose end date is later, even when they have occurrences during the requested dates.
- Suggested direction: use interval-overlap/occurrence semantics for weekly events and add start-before/end-after, no-fixed-end, and multi-day schedule regression cases.
- Fix status: **not changed; reporting only**.

### APP-095 — The rental timetable exposes dozens of unlabeled controls and pointer-only resize handles

- Severity: **high**
- Repository: `mvp-app`
- Evidence: every 30-minute availability cell is an empty clickable `Box` with no label describing field, date, time, availability, or price (`RentalBuilderContent.kt:597-660`). Selected ranges use a clickable text literal `x` for delete and raw `pointerInput` drag handles with no accessibility semantics or alternate increment/decrement actions (`:703-950`).
- Impact: TalkBack and switch-access users cannot identify which slot an empty control selects, cannot reliably identify Delete, and cannot resize a selection beyond its initial 30 minutes. The primary rental-booking workflow is therefore not operable nonvisually.
- Suggested direction: expose labeled button/collection semantics for cells, use a real labeled delete action, and provide accessible start/end controls or custom semantics actions equivalent to drag resizing.
- Fix status: **not changed; reporting only**.

### APP-096 — Android hides valid rental inventory outside 6:00 AM–midnight

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: rental validation and rendering hard-code `RENTAL_TIMELINE_START_MINUTES = 6 * 60` and `RENTAL_TIMELINE_END_MINUTES = 24 * 60`; `resolveRentalRange`, `findMatchingSlot`, and `canApplyRentalSelectionRange` reject anything outside that interval (`RentalSchedulingUtils.kt:165-168,219-222,303-306,381-382`). The server rental validator has no equivalent 6:00 AM floor (`src/app/api/public/organizations/[slug]/rental-orders/route.ts:215-294`).
- Impact: early-morning and overnight facilities can publish server-valid rental slots that Android never renders or accepts. A slot crossing midnight also cannot be represented by this single-day range model.
- Suggested direction: derive the visible range from configured availability and support cross-midnight selections with explicit dates; if a business-hours restriction is intended, enforce and communicate the same rule server-side.
- Fix status: **not changed; reporting only**.

### APP-097 — Organization review history is permanently capped at the newest 50 entries

- Severity: **medium-high**
- Repositories: both
- Evidence: `getOrganizationReviewsPayload` defaults to 50 reviews (maximum 100) and performs a single `findMany(... take: limit)` while separately returning the total count (`src/server/organizationReviews.ts:8-9,158-218`). The API accepts no page/cursor and the payload has no pagination metadata (`src/app/api/organizations/[id]/reviews/route.ts:15-22`). Android fetches that endpoint once and renders only `payload.reviews`, with no load-more path (`BillingRepository.kt:2110-2116`; `OrganizationDetailComponent.kt:496-510`; `OrganizationReviewsContent.kt:182-285`).
- Impact: once an organization has more than 50 reviews, users can see a larger summary count but can never reach older feedback on either contract consumer. Moderation/reputation context silently disappears behind a hard cap.
- Suggested direction: add deterministic cursor pagination and total/next metadata to the canonical API, then expose load-more behavior in the full reviews surface while keeping the overview preview intentionally bounded.
- Fix status: **not changed; reporting only**.

### APP-098 — Review publishing closes the editor before the save succeeds and loses the draft on failure

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: the Publish handler calls `onSave(...)` and immediately sets `editorOpen = false` (`OrganizationReviewsContent.kt:316-329`). `saveReview` performs the network mutation asynchronously and reports failure only through the shared error flow (`OrganizationDetailComponent.kt:514-528`). Reopening the editor reconstructs its fields from the unchanged server payload, not the failed local draft.
- Impact: a transient network/server failure discards up to 2,000 characters of user-written review text and forces the user to re-enter it after seeing an error popup.
- Suggested direction: keep the editor and draft open until success, model mutation success/failure explicitly, and preserve the draft across retries/dismissal according to a clear policy.
- Fix status: **not changed; reporting only**.

### APP-099 — “Create event now” drops the completed rental context

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: after order creation, `RentalReservationComplete` retains only booking/bill/total (`OrganizationDetailComponent.kt:68-72,1042-1058`). `createEventFromCompletedRentalReservation` clears that state and calls parameterless `navigateToCreate()` (`:752-756`). The original `RentalCreateContext` and order items are not passed; `withRentalOrderResult`, which maps booking item IDs into locked selections, has no production caller (`:1112-1134`). The create component later lists all available rental resources with an empty selection and does not know which booking launched it (`DefaultCreateEventComponent.kt:246-249,947-977`).
- Impact: the CTA does not prepopulate or attach the reservation it just created. Users with multiple bookings must rediscover and select the correct resource manually, and can create an event without the paid booking despite being told they are continuing from it.
- Suggested direction: carry the completed booking context or a booking ID through navigation, resolve canonical booking items in Create Event, and preselect/lock exactly those resources; remove the dead mapper only if the flow is intentionally redesigned.
- Fix status: **not changed; reporting only**.

### APP-100 — One PaymentSheet result can complete or cancel several unrelated checkouts

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `DefaultOrganizationDetailComponent` keeps independent `pendingProductPurchase`, `pendingTeamRegistration`, and `pendingRentalReservation` fields with no shared checkout owner/guard (`OrganizationDetailComponent.kt:279-289`). Product checkout clears `_startingProductCheckoutId` immediately after launching PaymentSheet, so its UI/guard unlocks while the payment is pending (`:611-659`). On `PaymentResult.Completed`, the collector checks rental, product, and team with separate `if` statements and processes every non-null pending value; canceled/failed results clear all three (`:300-376`). Profile independently allows an active installment attempt and pending child-team payment; its collector always prioritizes the child payment and returns without resolving/clearing the bill attempt (`ProfileComponent.kt:735-828,1529-1589,1868-1910`).
- Impact: overlapping intent/setup actions can make one payment result reserve a rental, announce an unrelated product purchase, and advance a team registration together—or cancel unrelated pending work. The stored rental intent may not even be the intent that the user completed, producing rejection after payment.
- Suggested direction: enforce one application-wide checkout session with an immutable operation ID/type and route each result only to its owner; keep controls locked until that session reaches a terminal state and reject stale/mismatched results.
- Fix status: **not changed; reporting only**.

### APP-101 — Organization event and team tabs silently truncate large catalogs

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: organization details fetch events once with `limit = 300` and teams once with the repository default limit of 200 (`OrganizationDetailComponent.kt:416-452`; `ITeamRepository.getTeamsByOrganization` default in `TeamRepository.kt:70-73`). `EventsTabContent` and `TeamsTabContent` render those lists with no paging state or load-more callback (`OrganizationDetailScreen.kt:1080-1165`).
- Impact: established facilities can have older/overflow events and teams disappear from their public Android organization page with no indication that the list is partial.
- Suggested direction: expose deterministic cursor pagination from both repositories and paginate the full tabs; keep the six-card overview previews intentionally bounded.
- Fix status: **not changed; reporting only**.

### APP-102 — Team document-sync progress is persisted and surfaced as an error

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: both BoldSign-operation polling and each clearance-loop iteration assign `ErrorMessage("Waiting for signature sync...")` to `_errorState` (`OrganizationDetailComponent.kt:1210-1244,1288-1307`). The screen collects that state and sends every value to the popup error channel, and the state is never cleared when synchronization succeeds (`OrganizationDetailScreen.kt:284-292`).
- Impact: normal progress is presented as a failure and can remain the component's last error after successful signing. Re-entering/recreating the screen can surface a stale “waiting” message even though the flow has completed.
- Suggested direction: model signing progress separately from consumable errors, clear it on every terminal path, and show non-error progress in the signing UI/loading state.
- Fix status: **not changed; reporting only**.

### APP-103 — Any profile/account refresh overwrites unsaved Profile Details edits

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `ProfileDetailsScreen` copies username, names, email, and profile image into local form state in `LaunchedEffect(currentUser, currentAccount)` every time either full object changes (`ProfileDetailsScreen.kt:137-144`). Image deletion explicitly reloads the current account/user (`ImagesRepository.kt:72-77`), and other repository refreshes can update those StateFlows while the form is open.
- Impact: deleting an uploaded image, auth/profile refresh, or any unrelated current-user field change can silently replace names, username, and photo choices the user has typed but not saved.
- Suggested direction: initialize/reset the draft by stable user ID or explicit successful-save/reset events, and merge external updates only into untouched fields with a visible conflict policy.
- Fix status: **not changed; reporting only**.

### APP-104 — Profile Details marks username required but still enables an invalid save

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: the username field displays an error whenever blank, but `isFormValid` includes only email, first name, last name, and password (`ProfileDetailsScreen.kt:109-130,314-321,478-493`). `UserRepository.updateProfile` sends the blank username, while the canonical PATCH handler rejects an empty normalized username (`UserRepository.kt:1310-1345`; `src/app/api/users/[id]/route.ts:215-225`).
- Impact: the primary Save button appears valid and submits a request that is guaranteed to fail, producing server-error feedback instead of preventing/correcting the field.
- Suggested direction: normalize and validate username in the form using the canonical contract, include it in Save gating, and display uniqueness/format failures on the field.
- Fix status: **not changed; reporting only**.

### APP-105 — Password can change successfully before the rest of Profile Save fails

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `UserRepository.updateProfile` calls and commits `updatePassword` first, then constructs/sends the separate profile update (`UserRepository.kt:1310-1345`). A later username conflict, validation error, authorization failure, or network failure returns one overall “Failed to update profile” message (`ProfileDetailsComponent.kt:156-183`) with no indication that the password already changed.
- Impact: users can believe nothing was saved, retry with the now-obsolete current password, or be surprised at their next login. The operation has no transaction/compensation boundary across authentication and profile data.
- Suggested direction: separate Password Change from Profile Save in the UI, or provide a server-owned atomic workflow/explicit partial-success result; clear password fields and communicate success as soon as the password mutation commits.
- Fix status: **not changed; reporting only**.

### APP-106 — Profile photo picking can fail with no visible error

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: Profile Details closes the gallery picker on `onError` without reporting the error, and an empty `onPhotosSelected` result also does nothing (`ProfileDetailsScreen.kt:164-181`). This mirrors the runtime-confirmed silent picker failure in APP-017 but affects the profile-photo workflow.
- Impact: after completing the system picker, users can return to an unchanged profile with no explanation or recovery guidance; URI/provider conversion failures are indistinguishable from cancellation.
- Suggested direction: distinguish cancel, empty result, provider failure, conversion failure, upload failure, and success in a consumable UI state with a retry action.
- Fix status: **not changed; reporting only**.

### APP-107 — Profile connection search lets older requests overwrite the current query

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: every `searchConnections` call launches an independent coroutine with no debounce, cancellation, request token, or query check before committing results (`ProfileComponent.kt:1976-2015`). `refreshConnections` can simultaneously perform another search for the captured query and replace the same result list (`:1912-1974`).
- Impact: typing quickly can display users for an older query under the newest text, and clearing/changing the query does not prevent a slow prior response from repopulating results. Actions may target someone the user did not currently search for.
- Suggested direction: use a debounced `mapLatest`/cancelable search pipeline keyed by normalized query and discard responses whose key is no longer current.
- Fix status: **not changed; reporting only**.

### APP-108 — Missing requested signing template silently falls back to a different document

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: when Profile Documents requests sign links, `signDocument` chooses a matching `templateId` but falls back to `steps.firstOrNull()` if no match exists (`ProfileComponent.kt:2425-2433`). It then opens or records that fallback step. If the fallback has no title, the modal uses the originally selected document's title (`:2449-2455`), concealing the template mismatch.
- Impact: a user can tap one waiver/consent, be shown or sign a different returned template, and have the wrong legal document recorded. The UI may label that different content as the document they intended to sign.
- Suggested direction: require an exact template/document/signer-context match, fail closed on absence or ambiguity, and have the server return a single signed request bound to the selected document ID.
- Fix status: **not changed; reporting only**.

### APP-109 — My Schedule is an unpaginated 200-event snapshot

- Severity: **high**
- Repositories: both
- Evidence: Android calls `api/profile/schedule` without `from`, `to`, or `limit` and replaces its entire schedule state with that response (`EventRepository.kt:2731-2756`; `ProfileComponent.kt:1108-1133`). The server defaults to `limit=200`, returns no total/cursor, and only queries matches/fields/teams for the capped event IDs (`src/app/api/profile/schedule/route.ts:25-31,104-181`).
- Impact: highly active hosts, officials, and participants can silently lose events and all corresponding matches from My Schedule. Because ordering is ascending by start and no date window is supplied, which portion is retained can become increasingly stale as history grows.
- Suggested direction: request a bounded date window appropriate to the visible calendar and support deterministic pagination/incremental window loading with explicit completeness metadata.
- Fix status: **not changed; reporting only**.

### APP-110 — Payment Plans can omit older unpaid bills behind a 100-row cap

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `IBillingRepository.listBills` defaults to 100 and the Profile payment-plan loader makes one request for the user and one per team without paging (`BillingRepository.kt:566,1331-1339`; `ProfileComponent.kt:1446-1498`). The UI receives no indication that any owner list is partial.
- Impact: an older unpaid/overdue installment can disappear from the only mobile payment-plan surface when newer bill history exceeds the cap, preventing payment or cancellation from Android while the debt remains canonical.
- Suggested direction: query outstanding/actionable bills explicitly and page history separately; expose total/next state and never treat a capped financial list as complete.
- Fix status: **not changed; reporting only**.

### APP-111 — Payment Plans performs serial per-team and per-bill network hydration

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `refreshPaymentPlans` loads each team's bills sequentially, then `buildPaymentPlans` loops every bill and sequentially requests its payments and event (`ProfileComponent.kt:1446-1527`). At the current caps this can produce hundreds of serialized HTTP round trips before one state update; individual payment/event failures are logged and converted to empty/null data.
- Impact: the screen can take minutes on real latency for active users, wastes mobile radio/battery, and silently renders incomplete payment details after partial failures.
- Suggested direction: provide one server aggregation endpoint for actionable plans with owner/event/payment summaries, or batch IDs and parallelize within a strict concurrency limit while surfacing partial-result status.
- Fix status: **not changed; reporting only**.

### APP-112 — The global loading overlay does not actually intercept input

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `LoadingOverlay` claims to “Prevent interaction” by applying `Modifier.clickable(enabled = false) { }` to its full-screen scrim (`App.kt:487-494`). A disabled Compose clickable does not install an enabled gesture consumer; the overlay provides no pointer-input consumption, modal dialog semantics, focus trap, or disabled state to the underlying screen.
- Impact: users can tap controls beneath a visually blocking loading layer, causing duplicate payments, mutations, navigation, or destructive actions while the app implies interaction is disabled.
- Suggested direction: use a modal surface/dialog or explicitly consume pointer events across the scrim, block accessibility focus/actions behind it, and make operation owners idempotent rather than relying only on presentation blocking.
- Fix status: **not changed; reporting only**.

### APP-113 — Declined invite history is downloaded and cached forever, then filtered on-device

- Severity: **medium-high**
- Repositories: both
- Evidence: the canonical invite GET handler applies no status predicate, pagination, or limit and returns every invite ordered by creation (`src/app/api/invites/route.ts:175-248`). Decline deliberately retains rows with `status = DECLINED` (`src/app/api/invites/[id]/decline/route.ts:32-42`). Android fetches/caches the entire response and only afterward excludes declined rows for the list/badge (`UserRepository.kt:1033-1064`; `ProfileComponent.kt:1135-1206`; `RootComponent.kt:737-748`).
- Impact: invite payload, serialization, local cache, and startup/badge work grow without bound for active organizers/participants even though historical declined rows are never shown. This becomes a persistent network/database tax on every refresh.
- Suggested direction: default the user-facing endpoint to actionable pending invites, add cursor pagination/status filters for history/admin use, and apply an explicit retention/archive policy to terminal invite rows.
- Fix status: **not changed; reporting only**.

### APP-114 — Root polls and rehydrates every chat group every 30 seconds for all signed-in users

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: Root starts a perpetual 30-second loop after authentication and calls `refreshChatGroupsAndMessages` regardless of visible screen (`RootComponent.kt:666-681`). Despite its name, that refresh downloads all group summaries and rehydrates every participant/team/display relation before rewriting Room (`ChatGroupRepository.kt:108-159`). Chat list/group components also trigger their own refreshes.
- Impact: push-enabled clients perform at least 2,880 full chat-list refresh cycles per day while the process remains alive, plus redundant screen refreshes and user/team hydration. This wastes battery/data and creates avoidable backend load proportional to every user's chat graph.
- Suggested direction: use push/realtime invalidation plus lifecycle-aware foreground refresh, incremental changed-since APIs, and a substantially slower bounded fallback only when realtime health is unavailable.
- Fix status: **not changed; reporting only**.

### APP-115 — Root repeatedly downloads the full capped schedule just to compute one center shortcut

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: every authenticated Root starts a lifecycle-unaware loop that calls `getMySchedule` every five minutes and recomputes each minute (`RootComponent.kt:687-729`). That endpoint returns the full event/match/team/field snapshot—up to the APP-109 200-event cap—even though `resolveCenterNavAction` needs only the next relevant event/match.
- Impact: the app can issue 288 large multi-table schedule responses per day per active process solely for one bottom-nav action, including while the user is on unrelated screens; stale capped snapshots can still produce the wrong shortcut.
- Suggested direction: expose a tiny next-action endpoint or derive from a lifecycle-aware incremental schedule cache refreshed by mutations/push and foreground resume.
- Fix status: **not changed; reporting only**.

### APP-116 — Persisted match-incident retries do not resume when scoring is reopened

- Severity: **high**
- Repository: `mvp-app`
- Evidence: incident create/delete failures are written back into the persisted `MatchMVP.incidents` collection with pending/failed upload states and an in-memory retry is scheduled (`MatchContentComponent.kt:1845-1882`). However, `processIncidentQueueUntilBlocked` is invoked only after recording/removing a new incident, from its own in-memory retry job, or while confirming a segment (`:1527-1529,1559-1565,1773-1842`). Component initialization observes the match, event, teams, and check-ins but never drains persisted incident work (`:425-480`).
- Impact: killing the process, navigating away, or recreating the component after a failed incident upload strands the durable pending/failed incident indefinitely. Its optimistic score effect can remain visible locally while the server never receives the incident, and confirmation is blocked only after an official later tries to finish the segment.
- Suggested direction: make incident upload states part of the repository-owned durable outbox, trigger a single serialized drain at repository/app startup and connectivity recovery, and expose terminal/retry state explicitly.
- Fix status: **not changed; reporting only**.

### APP-117 — Completing a match records its scheduled timestamp as the actual finish time

- Severity: **high**
- Repository: `mvp-app`
- Evidence: when the confirmed segment ends the match, `confirmSet` chooses `updatedScoringMatch.end`, then `start`, and only then `Clock.System.now()` as the finalize time (`MatchContentComponent.kt:1627-1635`). The local operation applier writes that value into `actualEnd` when `finalize` is true (`MatchOperationLocalApplier.kt:27-33`), and the same operation is sent to the server.
- Impact: a match completed early, late, or on a rescheduled day is recorded as ending at its planned schedule boundary rather than when the official actually completed it. Duration, operational history, downstream schedule logic, and audit records become false.
- Suggested direction: use the current instant (or an explicit official-entered actual time) for lifecycle completion; keep scheduled `start`/`end` fields separate and immutable during scoring.
- Fix status: **not changed; reporting only**.

### APP-118 — One transient team-check-in read failure disables retries for the component lifetime

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `refreshMatchCheckInsIfAllowed` stores `lastLoadedMatchCheckInKey` before issuing the request and returns immediately for that key on every later event/match emission (`MatchContentComponent.kt:1224-1243`). Its failure handler intentionally does nothing and never clears the key (`:1254-1256`).
- Impact: a brief network or authorization failure leaves an official's team check-in panel empty and stale until the entire match-detail component is recreated. Subsequent successful connectivity cannot repair the view, which can lead staff to treat checked-in teams as absent.
- Suggested direction: mark a key complete only after success, or retain explicit loading/error/last-success state and allow bounded retry on refresh, foregrounding, and connectivity recovery.
- Fix status: **not changed; reporting only**.

### APP-119 — Android set scoring cannot represent win-by-two and submits invalid final scores

- Severity: **critical**
- Repositories: both
- Evidence: Android disables all further increments as soon as either team reaches the configured target, regardless of margin (`MatchContentComponent.kt:2466-2477`), and considers any non-tied score with either team at/above the target confirmable (`:2479-2497`). The canonical web/server contract uses `getSetScoreState`/`canIncreaseSetScore` to require a two-point lead at or above the target and validates completed segment operations against that rule (`ScoreUpdateModal.tsx:2039-2061,2091-2098`; `src/lib/matchSetScoring.ts`; `src/server/matches/setScoringRules.ts:175-201`).
- Impact: a target-21 set tied 20–20 becomes stuck at 21–20 on Android because neither side can score again. Android enables confirmation at that invalid one-point margin, but the server rejects it; under DATA-025 the failed operation can then poison the local scoring queue and leave the invalid result overlaid indefinitely.
- Suggested direction: port the canonical shared win-by-two state machine and reachable-score cap to Android from a versioned contract, use it for increment and confirmation decisions, and add identical cross-platform fixtures for regulation, deuce, cap, decrement, and finalization cases.
- Fix status: **not changed; reporting only**.

### APP-120 — The event notification composer discards host text and targets the tournament topic

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `SendNotificationDialog` keeps the entered title/message as private local state but exposes `onSend: () -> Unit`, so it cannot return either value (`SendNotificationDialog.kt:23-29,83-88`). Its only caller consequently sends the constants `"Event Notification"` for both title and body (`EventDetailScreen.kt:3975-3983`). The coordinator also hard-codes `isTournament = true` for every event (`EventNotificationCoordinator.kt:19-26`), which selects the `tournament-` topic rather than the `event-` topic in `PushNotificationsRepository.kt:257-267`.
- Impact: hosts believe they sent their composed operational message, but recipients receive generic text—or, for leagues and other event types subscribed to the event topic, no message at all. This can hide schedule, venue, safety, or cancellation information while the dialog closes as though delivery succeeded.
- Suggested direction: pass `(title, message)` out of the dialog, derive the canonical topic from the event type/subscription contract rather than a Boolean constant, show send progress/result before dismissal, and test the complete screen-to-topic payload.
- Fix status: **not changed; reporting only**.

### APP-121 — Event image upload and deletion failures are silently discarded

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventImageCoordinator.uploadSelected` and `deleteImage` await repository calls but ignore both returned `Result` values; delete always hides loading immediately afterward (`EventImageCoordinator.kt:33-44`). `DefaultEventDetailComponent` launches those methods without inspecting an outcome or updating `errorState` (`DefaultEventDetailComponent.kt:1709-1721`). The coordinator tests cover only success and loading events (`EventImageCoordinatorTest.kt`).
- Impact: a failed event-image upload leaves the picker apparently doing nothing, and a failed delete leaves the image present with no explanation. Hosts can proceed believing required branding was saved or removed, repeating operations and creating support ambiguity.
- Suggested direction: return/propagate failures through the component's error state, use `try/finally` for loading ownership, retain retryable selection state, and add failure-path component tests.
- Fix status: **not changed; reporting only**.

### APP-122 — A required-signature purchase fails open when the signing URL is absent

- Severity: **critical**
- Repository: `mvp-app`
- Evidence: `ensureDocumentSignedBeforePurchase` recognizes that a purchase intent requires an incomplete signature, but if `resolvedSigningUrl()` is blank it logs a warning and returns `true` (`EventPurchaseIntentCoordinator.kt:80-96`). `processPurchaseIntent` then launches the Payment Sheet (`:64-78`). The test suite explicitly expects this fail-open behavior (`EventPurchaseIntentCoordinatorTest.kt:36-58`).
- Impact: a malformed, delayed, or partially compatible purchase-intent response can let a participant pay/continue registration without accepting a waiver or other document the server marked mandatory. A client warning log is not a legal-consent control or user-visible block.
- Suggested direction: fail closed whenever `isSignatureRequired && !isSignatureCompleted`; surface a retryable error when no safe signing URL/step exists, bind completion to the exact required document, and require server-side signature verification again before payment/registration finalization.
- Fix status: **not changed; reporting only**.

### APP-123 — Event participant invite searches can display stale users or teams

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `EventInviteCoordinator.searchUsers` and `searchInviteTeams` perform independent suspend requests and unconditionally replace their shared suggestion lists when each response arrives (`EventInviteCoordinator.kt:31-54,76-119`). There is no query generation, cancellation ownership, or response-to-current-query check; the team path also lets any older completion set the global loading flag false.
- Impact: fast typing or clearing a query can be undone by a late older response, showing candidates that do not match the visible text. A host can then invite/add the wrong participant or team, and the loading state can claim the newest request is finished while it remains in flight.
- Suggested direction: drive searches from a debounced `flatMapLatest` query flow or attach monotonically increasing request IDs and apply results/errors/loading only for the current normalized query.
- Fix status: **not changed; reporting only**.

### APP-124 — Deselecting a rental resource leaves its facility field attached to the event

- Severity: **high**
- Repository: `mvp-app`
- Evidence: after a resource is deselected, `buildEditDraft` identifies rental fields only from the *currently selected* options. It therefore classifies the previously selected rental field in `currentFields` as a custom field and retains it, while filtering out every rental-backed slot (`EventRentalResourcesCoordinator.kt:145-184`). The component immediately feeds the current edit fields/slots through this method after each selection change (`DefaultEventDetailComponent.kt:2867-2874`).
- Impact: the UI toggle appears to detach a booking resource, but the saved event can remain linked to the facility field without its rental slot or booking provenance. Hosts may retain/schedule against a resource they explicitly removed or no longer control.
- Suggested direction: track rental-owned field IDs independently of the current selection (from all available/attached booking options), remove deselected rental fields and their slot references atomically, and preserve only fields explicitly created as local custom resources.
- Fix status: **not changed; reporting only**.

### APP-125 — Blank event names pass Android's overall edit validation

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `computeEventValidationResult` correctly calculates `isNameValid = editEvent.name.isNotBlank()` and adds “Event name is required” to the diagnostic list, but the final `isValid` conjunction starts with `isPriceValid` and never includes `isNameValid` (`EventDetailsValidation.kt:154,387-406,408-411`). Callers can therefore treat an otherwise valid blank-name event as saveable even while the detailed error list says it is invalid.
- Impact: Android can enable and execute event creation/update with an empty name. Depending on server behavior, the host either receives a late API failure after completing the form or persists an unnamed event that is ambiguous in schedules, registrations, notifications, and public listings.
- Suggested direction: include `isNameValid` in the authoritative `isValid` expression, keep submission blocked from that single result, and add a regression test asserting a blank name cannot be submitted.
- Fix status: **not changed; reporting only**.

### APP-126 — Android discards custom match-incident definitions before saving

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: the match-rules editor builds and passes retained custom `incidentTypeDefinitions` into `copyMatchRulesOverride` (`EventDetailsMatchRulesSection.kt:269-280,388-417`). That helper immediately sends them through `normalizeMatchRulesOverride`, whose reconstructed `MatchRulesConfigMVP` copies booleans, supported codes, and timekeeping but omits `incidentTypeDefinitions` entirely (`EventMatchRules.kt:455-487,490-512`). The web editor preserves and tests this field (`MatchRulesSection.tsx:572-580`; `MatchRulesSection.test.tsx:87-94`).
- Impact: a host can add a custom incident type and see its code selected locally, but its authored definition—especially label and behavioral metadata—is removed from the event override before persistence. Later scoring screens must synthesize a generic discipline definition from the code, so the saved configuration does not match what the host created.
- Suggested direction: normalize and retain custom definitions in `normalizeMatchRulesOverride`, remove only definitions that truly match sport defaults or are no longer selected, and add round-trip tests covering a custom code, label, and metadata.
- Fix status: **not changed; reporting only**.

### APP-127 — The Android bracket tab renders as a blank zero-height surface when no rounds exist

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `TournamentBracketView` initializes its measured bracket heights to zero/unspecified and only assigns them inside `calculateMaxHeight` when `displayRounds.isNotEmpty()` (`TournamentBracketView.kt:89-133,182-232`). The `LazyRow` is then rendered at `animatedBoxHeight`, which resolves to `0.dp`, and the composable has no empty-state branch (`:302-319`). `EventDetailScreen` mounts this view directly for the Bracket tab without wrapping an empty-state message (`EventDetailScreen.kt:2975-2983`).
- Impact: before a bracket is built, after all bracket matches are removed, or when bracket data fails to materialize without an error, participants see an apparently broken blank tab with no explanation of whether the bracket is pending, unavailable, or empty.
- Suggested direction: render a deliberate empty/loading/error state before the measured bracket layout, with host guidance to build/manage the bracket and participant copy that the bracket has not been published yet.
- Fix status: **not changed; reporting only**.

### APP-128 — Schedule rendering writes parent FAB state during composition

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: `ScheduleView` invokes the supplied `showFab` state setter directly from the composable body both in its empty branch and on every normal composition (`ScheduleView.kt:171-179,275-277`). `EventDetailScreen` supplies a lambda that mutates its own `showFab` snapshot state. The bracket view already handles the same scroll-driven callback from `LaunchedEffect` (`TournamentBracketView.kt:148-174`), demonstrating the safe pattern used elsewhere.
- Impact: this creates a backward snapshot write while the parent/child composition is executing, causing avoidable extra recompositions and making the floating dock susceptible to flicker or unstable state when other schedule inputs change.
- Suggested direction: derive the desired visibility locally and publish it from `LaunchedEffect`/`snapshotFlow` only when the value changes; never call a parent state setter from the composition body.
- Fix status: **not changed; reporting only**.

### APP-129 — “Show only my matches” reads legacy team arrays instead of canonical active membership

- Severity: **medium-high**
- Repository: `mvp-app`
- Evidence: `ScheduleView.matchIncludesTrackedUsers` checks `captainId`, `managerId`, `headCoachId`, `playerIds`, and `coachIds` directly on each related team (`ScheduleView.kt:962-979`). The match-card role path first calls `Team.withSynchronizedMembership()` and then uses active staff assignments/player registrations (`MatchCard.kt:397-401`), which is the canonical membership-aware path. The two views can therefore disagree for the same match.
- Impact: users represented only through the current registration/assignment records can see their match normally but have it disappear—or never get the “my matches” filter at all—because the schedule filter consults stale legacy ID arrays. The same mismatch affects children and staff tracked by the schedule.
- Suggested direction: centralize one membership predicate based on synchronized active player/staff records and reuse it for match glow, schedule filtering, notifications, and eligibility; retain legacy arrays only inside the compatibility normalizer through 1.6.13.
- Fix status: **not changed; reporting only**.

### APP-130 — Participant billing money fields display raw cents as if they were user-entered currency

- Severity: **high**
- Repository: `mvp-app`
- Evidence: refund and proof-acceptance drafts are initialized with raw cent integers such as `refundableAmountCents.toString()` / `payment.amountCents.toString()` and are passed directly to `MoneyInputField`; bill tax is handled the same way (`ParticipantsVeiw.kt:923-931,1392-1472,1525-1551,1604-1606,1677-1684`). Submission then strips digits and treats the resulting number as cents (`:2436-2438`). The shared money utility defines input values as display dollars and provides `centsToDisplayValue` / `displayValueToCents` for this boundary (`MoneyUtils.kt:12-29`).
- Impact: a refundable $10.00 payment appears as `1000` in a money field. A host who corrects that visually to `10` sends a 10-cent refund; entering `10.00` happens to become `1000` only because punctuation is stripped. The same unit ambiguity affects accepted manual-payment amounts and bill tax, making financial mistakes likely.
- Suggested direction: keep draft values explicitly in display dollars, convert cents with `MoneyInputUtils.centsToDisplayValue`, convert submissions with `displayValueToCents`, show a currency prefix, and add round-trip tests for values such as $0.10, $10.00, and $1,234.56.
- Fix status: **not changed; reporting only**.

### APP-131 — In-flight refund and proof-review actions remain tappable and can submit duplicates or conflicts

- Severity: **high**
- Repository: `mvp-app`
- Evidence: the Accept and Reject buttons are enabled when no proof request is active **or when the active id equals that same proof** (`ParticipantsVeiw.kt:1466-1519`). Consequently both buttons stay enabled after one is tapped. The Refund button uses the same predicate for `refundingPaymentId` (`:1541-1574`). Each tap launches a new coroutine without a per-action idempotency guard.
- Impact: rapid taps can send duplicate refunds, duplicate proof acceptance, or concurrent Accept and Reject decisions for the same proof. Even if the server rejects/idempotently handles some repeats, the UI permits contradictory financial operations and can surface misleading success/error ordering.
- Suggested direction: disable every action for the active proof/payment immediately, separate review from refund busy state, make server mutations idempotent, and ignore late responses that do not match the current operation token.
- Fix status: **not changed; reporting only**.

### APP-132 — Late participant billing responses can populate the wrong participant's refund dialog

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `loadRefundSnapshot` stores the selected context globally, launches an unowned coroutine, and unconditionally writes its returned snapshot/error/loading state (`ParticipantsVeiw.kt:908-937`). Closing the modal does not cancel that request, and opening another participant starts another request against the same state. There is no context id or request generation check before applying either response.
- Impact: if a host closes participant A and opens participant B while A is still loading, A's late billing data can appear under B's title. Subsequent refund controls combine the current dialog context with stale payment ids, exposing another participant's financial details and risking an incorrect refund attempt.
- Suggested direction: key billing state by `billingTeamId`, cancel/replace loads with `flatMapLatest` or a request token, apply results only when the current context still matches, and disable mutation controls until the matching snapshot is confirmed.
- Fix status: **not changed; reporting only**.

### APP-133 — Event creation silently drops invalid configured schedule slots

- Severity: **high**
- Repository: `mvp-app`
- Evidence: create validation checks only that at least one division exists (`DefaultCreateEventComponent.kt:1297-1308`). Payload preparation then uses `mapNotNull` to discard slots with no mapped fields, a missing/invalid one-time end, missing weekday/time values, or an end time not after the start (`:1349-1402`) and creates the event from the remaining list. The component tests explicitly expect an invalid second slot and a repeating slot with no end time to be filtered while event creation succeeds (`DefaultCreateEventComponentTest.kt:944-1069`).
- Impact: a host can configure multiple league sessions, submit the form, and receive a successful event even though one or more sessions were never saved. The resulting public schedule differs from what the host entered, without a blocking error or field-level explanation.
- Suggested direction: validate every visible configured slot before submission and block creation with indexed field-level errors; reserve filtering for drafts the user explicitly deleted, and assert that the persisted slot count matches the submitted valid configuration.
- Fix status: **not changed; reporting only**.

### APP-134 — “Continue as guest” does not update live auth context and redirects back to login

- Severity: **high**
- Repository: `mvp-site`
- Evidence: both guest entry handlers call `authService.guestLogin()` and then perform a client-side push to `/onboarding` (`src/components/landing/LandingPage.tsx:890-901`; `src/app/login/page.tsx:382-397`). `guestLogin` only clears storage-backed users and writes `guest-session=1`; it has no way to update the mounted `AppProvider` state (`src/lib/auth.ts:447-451`). The provider reads that flag only during initial mount/checkAuth and exposes `isGuest` from its own state (`src/app/providers.tsx:116-181,228-248`). Because client-side navigation preserves the provider, onboarding receives the old `isGuest=false` value and redirects unauthenticated users to `/login` (`src/app/onboarding/page.tsx:106-119,303-305`).
- Runtime evidence: in the in-app Chromium browser, clicking the unique main-page “Continue as guest” button reached `/onboarding` with “Redirecting…”, then landed on `/login`; clicking “Continue as guest” there left the browser on `/login`. The console contained no relevant warning/error, so the flow presents as a silent navigation loop.
- Impact: unauthenticated visitors cannot reliably enter guest onboarding/discovery from either public CTA. The local storage flag and React auth state disagree until a full provider remount, producing a silent bounce instead of the advertised guest experience.
- Suggested direction: make guest entry a provider-owned action that atomically updates `authUser`, `user`, and `isGuest` before navigation (and resolves any live server session intentionally). Add a real provider/router integration test that waits for the final onboarding or discovery screen rather than asserting only `guestLogin` and `router.push` calls.
- Fix status: **not changed; reporting only**.

### APP-135 — Eager network-client construction can ANR Android before the first activity appears

- Severity: **high**
- Repository: `mvp-app`
- Evidence: `MvpApp.onCreate` synchronously starts Koin on the application main thread (`composeApp/src/androidMain/kotlin/com/razumly/mvp/MvpApp.kt:21-49`; `composeApp/src/androidMain/kotlin/com/razumly/mvp/di/KoinInitializer.kt:12-27`). `MVPRepositoryModule` marks `UserRepository` as `createdAtStart = true`, which eagerly resolves the network layer (`composeApp/src/commonMain/kotlin/com/razumly/mvp/di/MVPRepositoryModule.kt:40-42`). Its `HttpClient` installs Ktor's timeout plugin during that path (`core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpHttpClientConfig.kt:34-40`).
- Runtime evidence: a fresh `:composeApp:installDebug` completed successfully and installed the current v1.6.14 APK on the Pixel 9 Pro XL API 35 emulator. Two cold launches never displayed `MainActivity`; Android killed the process with `Reason: ... failed to complete startup`. The fresh-build ANR trace shows the main thread spending about 14 seconds in `ZipFile`/`ClassLoader.getResources`/`ServiceLoader` while SLF4J initializes from Ktor `HttpTimeout`, reached through the eager `UserRepository` factory and `Koin.createEagerInstances`, all under `MvpApp.onCreate`. The launcher remained the top resumed activity and UI Automator returned no app root node.
- Impact: on the tested current supported Android runtime, a clean debug install cannot reach any application screen. More generally, application startup performs dependency-container and network logging/service discovery work synchronously before an activity can draw, so slower devices or cold code-loading conditions can cross Android's startup timeout even though no user-visible initialization requires the repository yet.
- Suggested direction: remove `createdAtStart` from `UserRepository`, defer the first network-client/repository resolution until after the initial frame or a background-owned startup phase, avoid JVM `ServiceLoader`-based SLF4J discovery on Android, and add a cold-start instrumentation/macrobenchmark assertion that the first activity becomes displayed without an ANR.
- Fix status: **not changed; reporting only**.

### LEG-004 — Shared mobile resources retain unused starter and abandoned form assets

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: only 7 of the 39 entries in `composeApp/src/commonMain/composeResources/values/strings.xml` have any production generated-resource reference; the other 32 include the old four-item navigation, tournament-creation form labels, validation text, and unused set-confirmation text. Only 2 of the 12 XML drawables in the same resource tree are referenced; the other 10 include the Compose Multiplatform starter logo plus abandoned visibility, Google, surface, group, tournament, and remove icons. `create_new_event` also leaves an accidental literal `"` text node after its closing tag.
- Legacy relevance: these resources are unreachable from the current application and have no compatibility role at the 1.6.13 floor; retaining them expands generated resource APIs and obscures which copy is authoritative.
- Fix status: **not changed; reporting only**.

### LEG-005 — Tracked temporary SQL probes target the retired volleyball team table

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: three root files named `.tmp_placeholder_team_search.sql`, `.tmp_placeholder_team_search2.sql`, and `.tmp_mojibake_team_search.sql` are tracked production-repository artifacts with no caller. Each queries `"VolleyBallTeams"`; the canonical site migration `20260415214000_team_membership_event_team_snapshots` renamed that table to `"EventTeams"`, so the probes now fail against the current schema. One also preserves mojibake search text (`â€“`) alongside the intended en dash.
- Legacy relevance: these are one-off diagnostics from before the canonical table rename, not a supported 1.6.13 compatibility surface.
- Fix status: **not changed; reporting only**.

### LEG-006 — Android retains definition-only and fully commented platform helpers

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: production reference scanning finds no caller for Android `getGoogleUserInfo`, the `DecimalFormat` expect/actual pair, `MapComponent.setRadius`, or `LatLng.toMoko`; `BuildConfigImpl.kt` contains only a package, unused imports, and a fully commented former implementation. `getGoogleUserInfo` is the only production use of the heavyweight Google API/auth client classes, whose two dependencies are still declared directly in `composeApp/build.gradle.kts:185-201`.
- Legacy relevance: these paths do not provide 1.6.13 compatibility behavior. Remove them after confirming no reflection/generated entry point, then remove the now-unneeded OAuth client dependencies rather than preserving two Google sign-in implementations.
- Fix status: **not changed; reporting only**.

### LEG-007 — Shared mobile constants retain an abandoned Appwrite backend catalog

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: `Constants.kt:3-39` defines an Appwrite endpoint plus old database, collection, function, channel, and bucket identifiers, including the retired volleyball-team naming. Production reference scanning finds no use of `DbConstants` or any of its members; only the separate `UIConstants` object in that file is active.
- Legacy relevance: the current mobile client uses the Next/Postgres API contract, so this catalog has no compatibility role at the 1.6.13 floor and inaccurately advertises a second backend source of truth.
- Fix status: **not changed; reporting only**.

### LEG-008 — Shared UI retains definition-only icons, theme layers, and money helpers

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: complete Kotlin symbol/reference scanning finds no production consumer for seven `MVPIcons` vectors (`ArrowDown`, `ArrowUp`, both `BaselineVisibility*` icons, the Compose Multiplatform starter logo, `Volleyball`, and `VolleyballPlayer`). `PasswordField` uses Material icons instead. `Color.kt`'s three seed/brand aliases and `Type.kt`'s `AppTypography` have no consumer; `MVPTheme` does not install that typography. `AppExtendedColors` and both large palettes are provided globally but never read. `MoneyInputUtils.displayValueToCents` and `formatCurrency` are definition-only, and `EmailSignInButton` calculates an unused, incorrectly mixed-type `fontSize` branch (`EmailSignInButton.kt:56-62`).
- Legacy relevance: the starter logo, volleyball-specific art, superseded visibility icons, and transitional theme/money APIs have no Android compatibility role at the 1.6.13 floor. Keeping them expands source/compiled APIs and obscures the active Material/theme and cents-input paths.
- Suggested direction: remove definition-only symbols after a final generated/reflection check; retain only the active cents formatter/filter and theme tokens actually consumed by screens.
- Fix status: **not changed; reporting only**.

### LEG-009 — A tested chat redesign is definition-only while the live screen duplicates older UI

- Severity: **medium**
- Repository: `mvp-app`
- Evidence: production reference scanning finds no caller for `ChatHeader`, `ChatMessageBubble`, or `shouldAutoScrollToLatest`; only their own definitions/tests reference them (`ChatHeader.kt`, `ChatMessageBubble.kt`, `ChatScrollPolicy.kt`). The live `ChatGroupScreen` independently implements a Material `TopAppBar`, its own `MessageCard`, timestamp formatting, and unconditional scroll logic. `ChatMessageBubbleTest` and `ChatScrollPolicyTest` therefore validate code that users never execute.
- Legacy relevance: roughly 430 lines of abandoned redesign/emoji/blur/policy code and its tests have no 1.6.13 compatibility role. More importantly, the unused scroll policy masks APP-086 in the active implementation.
- Suggested direction: either finish the migration and delete the duplicated live implementations, or remove the unreachable redesign and tests; keep one chat UI/policy source of truth.
- Fix status: **not changed; reporting only**.

### LEG-010 — Two shared map-marker abstractions have no production callers

- Severity: **low**
- Repository: `mvp-app`
- Category: dead code/maintenance ambiguity
- Evidence: `AnimatedMarkerContent` and `MaterialMarker` are exported from `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt`, but a full Kotlin reference scan finds only their definitions. The Android map uses `MapEventMarker`, `MapEventClusterMarker`, and `MapPlaceMarker` directly.
- Impact: the unused alternate animation and generic marker styling create a false second map-rendering path and increase the surface reviewers must reconcile against the actual Android implementation.
- Suggested direction: remove these definitions after confirming there is no generated/reflection entry point, or move them into the active map implementation if they represent intended behavior.
- Legacy relevance: neither abstraction participates in the 1.6.13 compatibility contract.
- Fix status: **not changed; reporting only**.

### LEG-011 — Volleyball-specific stylized-text parsing is unreachable production code

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: a full Kotlin reference scan finds no caller of `StylizedText` or constructor use of `TextPatterns`; references are confined to their two definition files. The hard-coded pattern catalog styles volleyball divisions, “twos/quads/pairs/doubles,” and sand/grass/indoor icons (`TextPatterns.kt`; `StylizedText.kt`).
- Legacy relevance: this abandoned presentation experiment has no role in the generic multi-sport 1.6.13 compatibility contract and preserves volleyball-specific assumptions in Discover.
- Suggested direction: remove both files after the final generated/reflection check, or replace them with an actively used sport/tag-driven presentation owned by current domain data.
- Fix status: **not changed; reporting only**.

### LEG-012 — My Schedule retains an unused second calendar implementation

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: `ProfileMyScheduleScreen` delegates the live experience to shared `ScheduleView`. Full Kotlin reference scanning finds no production caller for its private `ScheduleMode`, `ScheduleEntry`, mode selector, month/week/day pickers, calendar title/day cells, date-navigation helpers, or related calendar state; those definitions are self-contained in `ProfileMyScheduleScreen.kt` and total roughly 300 lines.
- Legacy relevance: the abandoned local calendar path has no 1.6.13 compatibility role and duplicates the active shared schedule UI.
- Suggested direction: remove the unreachable implementation and its imports, or migrate deliberately to it and retire `ScheduleView`; retain one tested schedule presentation.
- Fix status: **not changed; reporting only**.

### LEG-013 — Match detail retains a confirmation-dialog API that can never open

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: `showSetConfirmDialog` is initialized to false and its only assignment is another false in `dismissSetDialog`; no production or test path ever sets it true (`MatchContentComponent.kt:372-373,483-485`). `requestSetConfirmation` only validates and sets an error on failure, with no action on success (`:1570-1583`). The live scoring screen bypasses both and calls `confirmSet` directly from its button (`MatchDetailScreen.kt:1479-1482`).
- Legacy relevance: the dialog state, dismiss/request methods, unused string resources, and related test calls represent an abandoned confirmation interaction, not a 1.6.13 compatibility path. Their presence suggests a safety confirmation exists when the active UI performs immediate completion.
- Suggested direction: either restore one intentional, tested confirmation flow and route the button through it, or remove the unreachable API/state/resources and call the operation with naming that reflects immediate execution.
- Fix status: **not changed; reporting only**.

### LEG-014 — Event detail retains six abandoned form/bracket composable files

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: a complete production Kotlin reference scan finds no caller outside each definition file for the empty `Header`, `TeamSizeLimitDropdown`, `MultiSelectDropdownField`, `CollapsableHeader`, any of the three set-count dropdown functions, or `MatchEditControls` (`eventDetail/composables/Header.kt`, `TeamSizeLimitDropdown.kt`, `MultiSelectDropdownField.kt`, `CollapsableHeader.kt`, `SetCountDropdown.kt`, `MatchEditControls.kt`). `Header` also collects event/detail state but renders an empty full-screen column; several other files preserve unused imports from older Material dropdown implementations.
- Legacy relevance: these are disconnected versions of controls now implemented by the active editor, division, and match-management surfaces; none participates in the 1.6.13 compatibility contract.
- Suggested direction: remove the six unreachable files and their stale imports/resources after a generated/reflection check; keep one active control implementation per setting.
- Fix status: **not changed; reporting only**.

### LEG-002 — Mobile contains obsolete migrations, DTOs, and definition-only routes

- Severity: **low-medium**
- Repository: `mvp-app`
- Evidence: unreachable v80→89 migrations remain while the current DB is v32; the complete legacy model DTO family (`EventDTO`, `TeamDTO`, `SubscriptionDTO`, `SensitiveUserDataDTO`, `RefundRequestDTO`, `ProductDTO`, `InviteDTO`, and bill DTOs), their self-contained `to*DTO`/`to*` converters, and `core/presentation/Routes.kt` have no production references outside their own definitions. The active client instead uses `core/network/...` API DTOs. `EventDao.upsertEventWithRelations` is likewise uncalled and, despite its name, only deletes relations before upserting the event; `FieldRepository.createFields` is unused and non-atomic.
- Legacy relevance: compare against v1.6.13 call sites, then remove code older than the supported floor rather than carrying contradictory future-version migrations.
- Fix status: **not changed; reporting only**.

### AUD-003 — Core web interaction surfaces are monolithic

- Severity: **medium**
- Repository: `mvp-site`
- Category: maintainability/code smell
- Evidence:
  - `src/app/discover/components/EventDetailSheet.tsx`: **7,218 lines / 362,571 bytes**.
  - `src/app/events/[id]/schedule/components/EventForm.tsx`: **4,365 lines / 208,378 bytes**.
- Impact: state ownership, effect dependencies, permissions, validation, and error states are difficult to review and test exhaustively; unrelated feature edits share a large blast radius.
- Suggested direction: after behavior coverage exists, identify cohesive state/controllers and view sections that can be separated without creating parallel sources of truth.
- Runtime behavior: pending.
- Fix status: **not changed; reporting only**.

### AUD-004 — Mobile screen/repository responsibilities are concentrated in multi-thousand-line files

- Severity: **medium**
- Repository: `mvp-app`
- Category: maintainability/code smell
- Evidence:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`: **4,136 lines**.
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt`: **3,338 lines**.
  - `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`: **3,747 lines**.
  - `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`: **2,960 lines**.
- Impact: UI state, navigation, persistence, HTTP mapping, and compatibility behavior are harder to reason about independently; duplicated state or accidental direct-network rendering is easier to hide.
- Suggested direction: use the audit to map responsibilities and ownership first; any later decomposition should preserve Room as the mobile rendered-data source of truth and `mvp-site` as the backend contract source.
- Runtime behavior: pending.
- Fix status: **not changed; reporting only**.

### AUD-005 — Mobile logo geometry has four manually duplicated sources of truth

- Severity: **low-medium**
- Repository: `mvp-app`
- Category: maintainability/resource duplication
- Evidence: `ic_launcher_foreground.xml`, `ic_notification_logo.xml`, `mvp_logo.xml`, and `mvp_logo_white_bg.xml` each embed the same ordered 41 `pathData` values (roughly 14 KB per file). Their scale and fill treatments intentionally differ, but there is no checked-in generator or canonical geometry asset from which those variants are produced.
- Impact: a brand-shape correction must be repeated in four files and can silently drift across launcher, notification, light-theme, and dark-theme surfaces.
- Suggested direction: keep the required platform variants but generate them from one canonical vector/geometry source.
- Fix status: **not changed; reporting only**.

### AUD-006 — Image-upload policy is manually duplicated between web and mobile

- Severity: **medium**
- Repositories: both
- Category: source-of-truth/maintainability
- Evidence: mobile `ImageUploadHandler.kt:9-64` owns its MIME-type and extension allowlist/mapping, while web independently owns the same policy in `src/lib/imageUploadPolicy.ts:1-43`. The lists currently match, but neither is generated from or validated against the other.
- Impact: adding or removing a format on one platform can make Android accept a file the server rejects, or hide a format the backend supports; error text and validation behavior can drift silently.
- Suggested direction: publish the backend policy as a versioned capability/contract or generate both validators from one shared definition.
- Fix status: **not changed; reporting only**.

### AUD-007 — Acknowledged phone match operations accumulate forever

- Severity: **medium-high**
- Repository: `mvp-app`
- Category: persistence bloat/dead cleanup path
- Evidence: every phone score or match operation is stored as a `MatchOperationOutboxEntry` and ACK changes only its status (`MatchRepository.kt:442-497,565-573`). `MatchOperationOutboxDao.deleteAckedOlderThan` exists (`MatchOperationOutboxDao.kt:113-117`), but production reference scanning finds no caller anywhere in the repositories or application; only a fake test implementation mentions it.
- Impact: normal live scoring permanently grows Room with serialized JSON payloads, timestamps, errors, and metadata for every tap/action. Long-running officials or facilities accumulate an unbounded historical queue that is neither a supported audit log nor used after ACK.
- Suggested direction: invoke bounded ACK retention/compaction from the single outbox owner and document the retention policy; keep any true audit history server-side rather than in an accidental device queue.
- Fix status: **not changed; reporting only**.

### AUD-008 — Four full Google button illustrations are embedded as 2,636 lines of common Kotlin

- Severity: **low-medium**
- Repository: `mvp-app`
- Category: source/build bloat
- Evidence: `AndroidGoogleButtonDark.kt`, `AndroidGoogleButtonLight.kt`, `iOSGoogleButtonDark.kt`, and `iOSGoogleButtonLight.kt` total 2,636 lines / 150,124 bytes of handwritten/generated-looking `ImageVector` path data. Each variant embeds the complete button background, Google mark, and text outlines. All four live in `commonMain`, and `GoogleSignInButton.kt:29-53` selects one by platform/theme at runtime.
- Impact: Android source compilation and shared UI APIs carry both Apple-only button geometries plus two almost-identical theme copies. Branding updates require replacing four opaque coordinate files, and review diffs cannot meaningfully validate the artwork.
- Suggested direction: keep official branded variants as platform-scoped vector/image resources (or a documented generator output) and ensure the Android target does not compile Apple-only geometry.
- Fix status: **not changed; reporting only**.

## Leads requiring proof

These are not yet confirmed defects:

| Lead | Evidence so far | Required proof |
| --- | --- | --- |
| API-001: duplicate endpoint families may be redundant | Examples include `billing_intent`/`billing-intent`, `purchase_intent`/`purchase-intent`, and several invite-by-email spellings. | Compare implementations, callers, telemetry/history, and the 1.6.13 client contract before classifying removal. |
| BUILD-001: unused frontend dependencies may be removable | Package inventory includes MUI/Emotion, Radix, `react-select`, time-picker, and timezone-select packages despite Mantine-first UI guidance. | Prove zero production imports, account for dynamic/config references, and compare against the v1.6.13 build before classifying removal. |
| ROUTE-001: missing App Router error/loading/not-found boundaries may produce unintended fallback UX | Static route inventory found no first-party `error.tsx`, `loading.tsx`, or `not-found.tsx` files. | Exercise slow, thrown, unauthorized, and missing-resource states for every route group and record actual framework behavior. |

## Audit log

- 2026-07-09: Established clean baselines after pulling both repositories.
- 2026-07-09: Narrowed the audit to code files at user direction while retaining metadata-only bloat findings.
- 2026-07-09: Created a blob-fingerprinted code coverage ledger and recorded initial runtime-tool availability; the current code-only exclusion/classification refinement leaves 2,340 rows.
- 2026-07-09: Recorded four confirmed repository/maintainability findings and four leads pending deeper evidence.
- 2026-07-10: Completed broad first-pass static audits of site, mobile, and cross-repository data contracts; promoted confirmed security, persistence, compatibility, testing, and maintainability findings while keeping whole-file dispositions incomplete.
- 2026-07-10: Installed current Android v1.6.14 using a JDK 17 environment override, repeated the UI-tree-driven auth/signup/DOB flow, reproduced future-DOB acceptance, and captured runtime Room database deletion during schema mismatch.
- 2026-07-10: Created an isolated audit PostgreSQL database, successfully replayed all 142 tracked migrations, and used it for authenticated mobile coverage without modifying the pre-existing local data set.
- 2026-07-10: Exercised authenticated Discover, Chats, Schedule, Home, profile, billing address, notifications, team creation, bills, Stripe, and event-creation states; recorded verification, empty-state, validation, map accessibility, and image-picker failures.
- 2026-07-10: Completed the mobile build/configuration and XML resource pass; recorded stale shared resources and four-way logo geometry duplication while retaining platform-specific variants as intentional behavior.
- 2026-07-10: Completed the full Wear source/config/test pass, ran its 7 tests and debug build, exercised reachable debug UI with UI-tree-derived actions, restored the v1.6.14 phone APK, and recorded offline-operation, scoring, accessibility, and missing-action findings.
- 2026-07-10: Updated scope at user direction to exclude all Apple iOS/watchOS platform-only code and all non-code files; 79 Apple-platform ledger rows are now explicit exclusions and Apple-only/non-code findings were removed from the active tracker.
- 2026-07-10: Completed all remaining Android platform-source implementations; documented payment dead-ends, map lifecycle retention, embedded URL trust, image memory/threading, decimal-input reachability, picker accessibility semantics, unknown dropdown values, and definition-only OAuth/build helpers.
- 2026-07-10: Completed the shared core presentation/navigation pass; documented stale serialized domain snapshots, duplicated fee and image policies, authoritative-terms substitution, loading ownership, asynchronous address races, and deterministic picker/dialog/filter interaction failures.
- 2026-07-10: Completed the shared model pass and reconciled it against active network mappings, Room use, and server schema; documented contradictory notification defaults, the lost field-to-facility relationship, and the complete superseded model-DTO family.
- 2026-07-10: Reconciled active network patch DTOs with serializer and server PATCH semantics; confirmed that omitted nulls prevent Android from clearing numerous optional event, team, and match values.
- 2026-07-10: Completed the remaining shared DAO pass; documented nondeterministic offline chat ordering, partial cross-reference commits, and the misleading unused event-with-relations helper.
- 2026-07-10: Completed the small shared repository implementations, confirmed chat pagination/read-receipt divergence, account-global guide state, cross-logout registration-draft retention, and uncompensated image uploads; `:core:network:allTests` completed successfully (Android unit tests executed; iOS tests skipped by Gradle).
- 2026-07-10: Completed `ChatGroupRepository` and reconciled direct-message creation with the web service, API handler, and Prisma schema; confirmed the client-side check-then-create race has no backend uniqueness invariant.
- 2026-07-10: Completed `PushNotificationsRepository`; traced token registration/removal through the server routes and confirmed silent logout-cleanup failure plus persistent invitation-cache poisoning from the already caller-controlled push relay.
- 2026-07-10: Completed the shared match-operation local applier and reconciled it with the server evaluator; confirmed Android's optimistic winner derivation uses a materially different algorithm from the authoritative match rules.
- 2026-07-10: Completed the bracket graph validator and its tests/caller path; confirmed the candidate filter calculates but ignores cycle validity, exposing choices that are rejected only on Save.
- 2026-07-10: Completed `MatchRepository` and reconciled its Room outbox with DAO and server semantics; confirmed non-atomic sequence/drain ownership, permanent failed overlays/queue poisoning, missing startup retries, and unreachable ACK cleanup.
- 2026-07-10: Completed the shared `core/ui` pass using full implementation review plus structural/reference inspection for vector payload files; recorded definition-only UI/theme assets and four-way branded-button source bloat. The focused Compose Android unit-test task was blocked before execution by the unresolved Maps manifest placeholder.
- 2026-07-10: Reconciled every in-scope ledger row to a terminal review status, completed the site typecheck, and performed final desktop/mobile browser smoke tests. Confirmed the guest-auth state loop and duplicate sport filter identity failure while mapping local missing-schema errors to the existing stale-database finding.
- 2026-07-10: Built and installed the current Android debug APK successfully, reproduced a pre-activity cold-start ANR twice, and extracted the system ANR trace proving synchronous eager Koin/Ktor/SLF4J service discovery on the application main thread.
- 2026-07-12: Completed DATA-004 schema-drift fail-closed remediation across web and mobile. Focused web regressions and `tsc --noEmit` passed; Android and iOS team-repository runs each passed 19 tests. A freshly installed Android build cold-launched to the Login UI with no app crash, Room migration, or illegal-state log.
- 2026-07-12: Completed DATA-005 and reconciled DATA-013. Retired the stale shadow Prisma schema, added canonical schema/generated-client/version checks to the build preflight, refreshed the local dependency installation to the tracked 7.8.0 Prisma pair, and verified the guard test, TypeScript check, and build-command preflight.
- 2026-07-12: Completed DATA-006. Added deterministic 1.6.13/1.6.14 AppReleases seeds for Android and iOS, verified a fresh full migration-chain replay and repeat application, passed Android/iOS update-contract tests, deployed all pending live migrations, and verified the public app-version contract at both old and current build boundaries.
- 2026-07-12: Completed DATA-010. Enforced unique SensitiveUserData identity keys, moved auth/invite/MFA lookups to deterministic unique keys, protected Google-linked accounts from provider-email drift, validated the full migration chain and focused regression suite, and deployed the live uniqueness migration after a zero-duplicate preflight.
- 2026-07-12: Revalidated existing SEC-001 remediation and reconciled SEC-002 in the audited branch. Focused billing authorization tests (17 total), TypeScript, and a fresh local production server confirmed creation/read/list denials. The public production endpoint still answered from an older deployment, so the source completion is explicitly marked deployment-pending.
- 2026-07-12: Reconciled SEC-003 in the audited branch. Verified generic file handlers consult the bill-payment-proof discriminator before storage reads; 20 focused access/download/preview tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-004 in the audited branch. Verified durable field/facility/event-derived time-slot authorization across POST/PATCH/DELETE with 22 focused tests. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-005 in the audited branch. Verified unscoped refund listings are personal-only and cross-host/organization queries are denied; all 12 focused refund route tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-006 in the audited branch. Verified every distinct registration-response scope is authorized before a batch returns; all 7 focused tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-007 in the audited branch. Verified private/unpublished event schedule and realtime-token visibility across five suites (16 tests), including a new standalone field-match regression. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-008 in the audited branch. Confirmed no E2E auth state remains tracked, the path is ignored, and current session verification rejects non-expiring historical tokens; all 7 focused token tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-010 in the audited branch. Confirmed typed session JWTs include a bounded expiry and verification rejects missing/invalid expiry claims; all 7 focused token tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-013 in the audited branch. Confirmed arbitrary account ensure and all generic email-lookup aliases return 410 without database access; all 10 focused tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-016 in the audited branch. Verified direct DOB-verification and Stripe-state patches are rejected before persistence; all 14 focused user-profile tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-019 in the audited branch. Verified missing Stripe credentials fail closed before payment, Stripe Connect, or team checkout mutations; all 33 focused tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-021 in the audited branch. Verified organization list/detail public projections, selector authorization, and sensitive-field omission; all 28 focused tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-022 in the audited branch. Verified scoped, paginated fields/time-slot reads and narrow anonymous discovery output; all 29 focused tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-011 and SEC-015 in the audited branch. Verified the retired universal user mutation endpoint and contextual public user privacy projection; all 16 focused user-route tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-012 in the audited branch. Verified every invitation uses the authenticated actor and is checked against the exact team, event, or organization scope; all four focused invite-route tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-014 in the audited branch. Verified non-admin event creation cannot spoof the host and requires organization event-management permission; all six focused event-create tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-017 in the audited branch. Verified unsigned/unconfigured Stripe webhooks fail closed, with a narrowly explicit development-only bypass; all 18 focused webhook tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-020 in the audited branch. Verified generic session validation rejects signed scoped tokens and enforces issuer, audience, type, expiry, and strict claims; all nine focused auth/realtime token tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-023 in the audited branch. Verified roster-authoritative team chat membership, stale-attacker denial for reads/writes/subscriptions, and self-scoped push cleanup; all 29 focused chat tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-027 in the audited branch. Verified topic mutation/deletion, team-topic reservation, and push-relay sender/recipient/data controls; all 18 focused topic-message tests passed, including two new direct-delete regressions. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-028 in the audited branch. Verified bill-split ownership, opt-in, roster, duplicate, active-payment, and race protections; all eight focused split tests passed, including two new opt-in/outsider-recipient regressions. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-029 in the audited branch. Verified direct signed-document assertions are retired and scoped signing only changes server-issued records; all six focused document tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-030 in the audited branch. Verified anonymous guest registration rejects existing account identities before registrations, relationships, or signing tokens are created; all 11 focused guest-registration/signature tests passed, including a new endpoint-level regression. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-043 and DATA-026 in the audited branch. Verified target-only team refund allocations plus immutable weekly occurrence/payment scope at request and approval time; all 25 focused refund tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-044 in the audited mobile branch. Verified logout preserves authenticated cleanup until the server confirms removal and publishes unauthenticated state before the empty user flow; the targeted Android unit test passed. Emulator verification remains part of the final mobile validation pass.
- 2026-07-12: Reconciled TEST-007 in the audited mobile branch. Verified a missing or untrusted mandatory signing URL stops at a retryable signature state and cannot open PaymentSheet; the focused Android coordinator suite passed. Emulator verification remains part of the final mobile validation pass.
- 2026-07-12: Reconciled DATA-018 in the audited mobile branch. Verified terms consent displays the authoritative version, allows only the canonical supplied terms URL, and blocks consent without it; the focused Android URL/repository tests passed. Emulator verification remains part of the final mobile validation pass.
- 2026-07-12: Reconciled DATA-021 in the audited mobile branch. Verified deliberate nullable event/team/match clears are represented by JSON null while untouched fields remain omitted; focused Android patch tests passed, including a new multi-field event-clear regression. Emulator verification remains part of the final mobile validation pass.
- 2026-07-12: Reconciled SEC-009 in the audited branch. Verified caller-controlled or omitted `clientType` cannot bypass an enabled authenticator challenge; all 32 focused auth route tests passed, including the omitted-client-type MFA regression. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled SEC-018 in the audited branch. Verified paid rental creation refuses unconfigured Stripe verification before any financial or booking write, then validates a succeeded intent against its rental scope; all 39 focused Stripe/rental tests passed. Production deployment remains pending with the rest of the audited branch.
- 2026-07-12: Reconciled DB-001 in the audited mobile branch. Verified the Room migration graph runs on-device without pre-open deletion; all eight migration-path tests passed, including preservation of a queued v24 match operation. Release deployment remains pending.
- 2026-07-12: Reconciled DATA-024 and DATA-025 in the audited mobile branch. Verified serialized durable match-operation enqueue/drain behavior and terminal-rejection reconciliation; all 13 focused repository tests passed, including a new eight-concurrent-enqueue sequence regression. Release deployment remains pending.
- 2026-07-12: Reconciled DATA-027 and DATA-029 in the audited mobile branch. Verified narrow user-profile mutations preserve server-owned relationship data and final set completion retains the repository-finalized match; the focused user and match-content suites passed all 12 and 55 cases respectively. Release deployment remains pending.
