# Add secure claiming and trust signals for affiliate organizations

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, a person who represents an organization found through BracketIQ's affiliate import system can claim the organization's BracketIQ profile. A claimant with a verified email on the organization's own domain can use the fast path. A claimant who controls the official website can instead prove control with a DNS or website token. A claimant who cannot use either method can submit a manual review request. Once a claim is approved and accepted with multi-factor authentication, the claimant becomes the organization owner and can maintain the profile, respond officially to reviews, and manage the events, teams, and rental listings already linked to that organization.

The public result is visible wherever the organization appears. Unclaimed affiliate profiles show a restrained “Unclaimed profile” label and an “Own this organization? Claim this profile” action. Claimed profiles show “Claimed profile.” A separate “Website verified” signal appears only when BracketIQ has verified control of the official site. The existing Stripe-backed “Verified” badge remains payment identity verification and must not be reused for profile ownership. Claiming never silently changes an affiliate listing's external registration or booking behavior.

Organization creation also becomes match-first. When someone begins creating an organization and enters its name, website, and location, BracketIQ searches all existing profiles, including unlisted affiliate profiles. An exact unclaimed match sends the user into the claim flow instead of creating a duplicate. An exact claimed match opens the existing profile and offers a consensual ownership-transfer or ownership-dispute path; it never automatically replaces the existing owner. A possible but non-exact match is shown for confirmation before creation. The server repeats the same match when the final create request arrives so callers cannot bypass the wizard.

The first release uses a web claim wizard in `mvp-site`. The shared organization API exposes additive ownership fields. The Kotlin Multiplatform app in `/Users/elesesy/StudioProjects/mvp-app` displays the same status on organization, event, team, and rental surfaces and opens the web claim wizard. Native DNS, email, or manual verification UI is intentionally deferred so there is only one security-sensitive claiming implementation.

## Progress

- [x] (2026-07-29 16:46Z) Inspected `PLANS.md`, the current organization and review schema, affiliate organization upsert behavior, organization search order, administrator access, email verification, MFA support, affiliate URL safety helpers, web presentation surfaces, and matching mobile presentation surfaces.
- [x] (2026-07-29 16:46Z) Recorded the first complete claiming, verification, review-response, importer-ownership, ranking, dispute, and rollout design in this ExecPlan.
- [x] (2026-07-29 17:00Z) Inspected `CreateOrganizationModal`, `organizationService.createOrganization`, and `POST /api/organizations`, then added match-first creation, claimed-profile ownership transfer, ownership disputes, and server-enforced duplicate prevention to the design.
- [x] (2026-07-29 17:32Z) Created the 39-screen interactive HTML mockup and clickable flow chart under `docs/mockups/affiliate-organization-claiming/`, rendered every screen in Chromium at desktop and 390-pixel mobile widths, and audited 28 named edge cases with no horizontal overflow or broken state content.
- [x] (2026-07-29 18:11Z) Moved organization trust badges into a dedicated full-width card footer, removed public staff-access requests and staff-grant dispute outcomes, added owner-side staff-list and invitation screens, and re-audited all 39 screens and 29 named edge cases at desktop and mobile widths.
- [x] (2026-07-29 18:49Z) Added and locally deployed the additive Prisma ownership, domain, claim, evidence, audit-event, review-response, review-conflict, and claim-specific MFA schema. Generated the Prisma client, confirmed the working local database is migration-current, and applied all 165 migrations successfully to a fresh temporary Postgres database.
- [x] (2026-07-29 18:49Z) Implemented direct-domain normalization, registrable-domain work-email matching, shared-platform policy, deterministic ownership classification, and a dry-run-first JSON/CSV audit and backfill command.
- [x] (2026-07-29 18:49Z) Ran the local audit twice with stable digest `96283c94d4da0dec8abe1cc5cbb38d4bfdc90755610520eb5ff35b148b6ddf68`, wrote the classification locally, and proved idempotence when the second `--write` reported zero affected organizations.
- [x] (2026-07-29 18:49Z) Protected claimed, pending, disputed, suspended, and review-required organization profiles from later affiliate club upserts while keeping new affiliate organizations explicitly `AFFILIATE_IMPORTED` and `UNCLAIMED`.
- [x] (2026-07-29 18:49Z) Passed 84 focused ownership and affiliate-import tests and `npx tsc --noEmit`.
- [x] (2026-07-29 19:18Z) Implemented the claim lifecycle service for initial claims, ownership transfers, structured disputes, manual review, email/DNS/HTML evidence, administrator decisions, revocation, current-owner responses, transactional acceptance, competing-claim expiry, and owner/staff review-conflict reconciliation.
- [x] (2026-07-29 19:18Z) Added the public presentation, claimant claim, email confirmation, website verification, cancellation, submission, claim-specific MFA, current-owner request, and Razumly-admin claim APIs. New claims and disputes notify `samuel.r@razumly.com` by default through the existing email transport; `ORGANIZATION_CLAIM_ADMIN_EMAIL_TO` is the scoped override.
- [x] (2026-07-29 19:18Z) Added pre-follow same-registrable-domain redirect enforcement to the bounded public fetcher, a fixed DNS TXT hostname, a fixed HTML meta-tag contract, hashed single-use email secrets bound to claimant session version, and separate MFA challenges for current-owner approval and incoming-owner acceptance.
- [x] (2026-07-29 19:18Z) Passed 127 focused claim, route, MFA, notification, URL-safety, domain-policy, classification, and affiliate-import tests; passed focused ESLint, `npx tsc --noEmit`, `npm run prisma:check`, `git diff --check`, and the full production `npm run build`.
- [ ] (2026-07-29 19:18Z) Full `npm run test:ci` remains red on unrelated existing suites and was stopped after reproducing failures in `FieldsTabContent.test.tsx` and billing weekly-occurrence suites whose Prisma mocks lack `divisions.findMany`; all claim-focused suites remain green.
- [x] (2026-07-29 20:48Z) Added a lazily loaded administrator Claims tab with a needs-review queue, bounded status/method/request filters, claimant and current-owner context, domain and evidence status, audit history, constrained decision and resolution options, claimant-facing copy, and private administrator notes. Administrator decisions notify the claimant after commit; formal dispute decisions also notify the current owner without exposing claimant-only or internal copy. Delivery failures are audit-recorded without rolling back the decision.
- [x] (2026-07-29 20:54Z) Passed 13 focused administrator-queue, detail-route, decision, decision-email, delivery-failure, and claim-service tests plus `npx tsc --noEmit`, focused ESLint, `git diff --check`, and the production build. Browser-smoked the protected Claims tab with a temporary local Razumly administrator and manual-review fixture at desktop and 390-pixel widths; the rendered queue/detail/decision workspace had zero console errors and no horizontal overflow, no decision was submitted, and the temporary claim, administrator, and organization-state changes were removed afterward.
- [x] (2026-07-29 21:51Z) Repeated the full match-first create, manual claim, administrator approval, claimed-profile transfer/dispute entry, and MFA-acceptance handoff with real local records and outbound email disabled. The run found a blocking profile-security handoff, missing claimant decision copy, initial-claim transfer copy, and a canonical public event ownership-presentation gap; the test claim and administrator were removed and the affiliate organization was restored exactly afterward.
- [x] (2026-07-29 21:51Z) Fixed the MFA setup URL and profile query handling so organization claims open Account security, guide authenticator enrollment, retain a safe same-origin return path, and return to the ownership request after setup. Added the administrator decision to the pending-acceptance screen, made method and warning copy request-specific, and added the host ownership footer plus claim/dispute callout to the canonical `/event/[id]` page.
- [x] (2026-07-29 22:00Z) Browser-verified the repaired approved-claim handoff, claimant-facing administrator decision, Account security authenticator guidance, initial manual-review copy, and canonical public-event host ownership card. Desktop and 390-pixel layouts had no horizontal overflow; the public event had no console errors; the claim flow's only error-level browser entry was the intentionally handled 403 that supplies the MFA setup URL. The temporary claim was deleted and the affiliate organization was restored exactly.
- [x] (2026-07-29 22:16Z) Changed the initial ownership policy so every affiliate-imported organization starts `UNCLAIMED` regardless of placeholder owner, missing account, staff rows, or domain ambiguity. Applied the revised backfill locally: 87 first-party organizations remain claimed, all 178 affiliate organizations are unclaimed, and zero organizations remain `REVIEW_REQUIRED`; a follow-up dry run reported no additional changes with stable digest `0a305f6889670c49dc288526d51524ffee1831b189a52dd792643080b572c975`.
- [x] (2026-07-29 22:47Z) Reworked HTML and DNS verification instructions for non-technical organization owners. HTML verification now provides one complete copyable meta tag, plain-language publishing steps, and a ready-to-send website-manager message. DNS verification provides separately copyable provider fields, plain-language DNS steps, and a ready-to-send domain-manager message. Browser QA confirmed every copy payload, the request-specific final actions, no browser console errors, and no horizontal document overflow at desktop or 390-pixel widths; temporary claim data was removed and the affiliate organization was restored to `UNCLAIMED`.
- [x] (2026-07-29 22:59Z) Moved the organization-profile “Claim this profile” action from a full-width explanatory callout into the right side of the profile header, aligned with the organization name where owner management actions belong. Kept the richer claim callout on event and public-marketing surfaces, removed the duplicate organization-page callout, and browser-verified one claim link, exact title-row alignment at desktop width, clean mobile wrapping, no horizontal overflow, and no console errors.
- [x] (2026-07-29 23:06Z) Temporarily removed the “Unclaimed profile” ownership footer from event cards while preserving the internal organization host link and claimed/website-verified event-card signals. Added a regression test proving unclaimed event cards do not render either the badge or its empty footer container.
- [ ] Add ownership-transfer reminder/expiry processing and scheduled stale-claim cleanup.
- [x] (2026-07-29 19:53Z) Added privacy-safe matching across listed and unlisted organizations, primary domains, affiliate candidates, and source organizations; added a signed 10-minute match decision, transaction-scoped advisory locking, server-side final rechecks, structured 409 responses, and administrator override auditing.
- [x] (2026-07-29 19:53Z) Converted organization create mode into a two-step match-first wizard. Exact unclaimed matches route to claiming; exact claimed matches offer profile, transfer, and dispute paths; softer matches require explicit different-organization acknowledgement; public staff-access requests are absent. Website edits now block conflicting domains and transactionally replace the primary domain while clearing stale domain-bound trust.
- [x] (2026-07-29 19:53Z) Passed 58 focused matcher, match-route, organization-route, edit-route, service, and modal tests; passed focused ESLint, `npx tsc --noEmit`, `git diff --check`, Prisma validation/generation, and the production build. Browser-smoked no-match, unclaimed exact-match, and claimed exact-match flows at desktop and 390-pixel widths against the local database.
- [x] (2026-07-29 20:26Z) Added the web claim wizard for initial claims, transfers, structured disputes, domain-email/DNS/HTML/manual evidence, pending and terminal states, claim-specific MFA acceptance, and safe email-link sign-in handoff. Added privacy-safe ownership presentation to organization, event, team, and rental API contracts and public cards, detail pages, maps, and public organization pages. Ownership badges occupy a dedicated card footer and public staff-access requests remain absent.
- [x] (2026-07-29 20:26Z) Passed 140 focused ownership, claim-wizard, email-confirmation, public-contract, card, event, team, and organization tests plus the event-detail hydration regression; passed focused ESLint, `npx tsc --noEmit`, and the production build. Browser-smoked real local unclaimed and claimed organizations, the full claim/transfer/dispute choices, the public affiliate-event details page, and 390-pixel responsive layout with no console errors or horizontal overflow.
- [ ] Add official review responses and bounded trust-aware sorting.
- [ ] Add additive mobile ownership fields, badges, and web claim deep links without disturbing external affiliate actions.
- [ ] Run focused tests, full type and platform compilation, browser and mobile smoke tests, migration checks, and local end-to-end claim scenarios.
- [ ] Deploy the migration before application code, backfill live affiliate organizations in dry-run then write mode, deploy the application, and verify production behavior.

## Surprises & Discoveries

- Observation: `Organizations.ownerId` is required and has no separate claimed or unclaimed state.
  Evidence: `prisma/schema.prisma` defines one required `ownerId`, while existing affiliate setup intentionally assigns source organizations to an internal Razumly administrator.

- Observation: A later affiliate club upsert can overwrite a real claimant's ownership and profile fields.
  Evidence: `buildAffiliateOrganizationData` in `src/server/affiliateImports/service.ts` copies `sourceOrganization.ownerId` and also returns `website`, `logoId`, `description`, verification fields, and public-page settings; `upsertAffiliateOrganizationForCandidate` passes that entire object as the update payload.

- Observation: The value currently written to `Organizations.website` is not always safe to use for claim verification.
  Evidence: `buildAffiliateOrganizationData` prefers `candidate.officialActionUrl` over `candidate.sourceUrl` and `source.baseUrl`. An action URL can belong to Eventbrite, CommunityPass, TeamSnap, SportsEngine, or another shared registration provider instead of the organization.

- Observation: Reviews are already public and owners and staff are already prevented from creating new reviews.
  Evidence: `src/server/organizationReviews.ts` checks `Organizations.ownerId` and `StaffMembers` before returning `canReview`. Claim approval must also reconcile reviews written before a claimant became an owner or staff member.

- Observation: The existing organization verification state is Stripe identity and payout readiness, not profile ownership.
  Evidence: `Organizations.verificationStatus` is populated by Stripe synchronization and rendered by `OrganizationVerificationBadge`. The new ownership presentation must remain a separate type and component.

- Observation: Organization search does not currently have a trust rank.
  Evidence: `src/app/api/organizations/route.ts` ranks query results by name, location, address, and description match, then by name. The Discover client additionally prefers distance before text relevance.

- Observation: Safe public URL fetching and registrable-domain parsing already exist in the repository.
  Evidence: `src/server/affiliateImports/sourceIntakeUrlSafety.ts` rejects private and reserved addresses, pins the resolved public address, bounds redirects, response size, and time, while `src/server/affiliateImports/sourceDiscoveryRules.ts` already uses `tldts` and maintains shared-tenant host knowledge.

- Observation: The mobile checkout is currently ahead of its remote and has unrelated CocoaPods file changes.
  Evidence: `git -C /Users/elesesy/StudioProjects/mvp-app status --short --branch` reported `master...origin/master [ahead 8]` plus changes to `composeApp/composeApp.podspec`, `iosApp/Podfile.lock`, and `iosApp/Pods/Manifest.lock`. Implementation must preserve them and must not stage them with claiming work unless they become intentionally required.

- Observation: Organization creation currently performs no existing-profile or website-domain match.
  Evidence: `src/components/ui/CreateOrganizationModal.tsx` submits name, website, location, and owner directly through `organizationService.createOrganization`. `POST /api/organizations` validates creation and permissions but does not query existing organization names, websites, affiliate sources, domains, or locations before inserting the row.

- Observation: The existing public event hierarchy can accommodate organization ownership without redesigning the event action.
  Evidence: `PublicEventOverview.tsx` already contains a bounded “Hosted by” organization card, while `EventJoinCard.tsx` separately owns the affiliate organizer-site action. The rendered mockups place ownership badges in a dedicated full-width footer under the host identity, show a claim callout only when the organization is unclaimed, and keep the organizer-site button visually primary.

- Observation: Treating every contested request as an ownership-transfer request leaves duplicate profiles and unauthorized claims without an accurate resolution.
  Evidence: The completed dispute mockups require separate issue reasons and requested outcomes and demonstrate resolutions that uphold the owner, initiate MFA transfer, revoke, suspend, merge, or correct.

- Observation: Placeholder owner and incomplete provenance data made most local affiliate organizations appear to require ownership review.
  Evidence: The first audit classified 110 of 178 affiliate organizations as `REVIEW_REQUIRED`, including 101 whose recorded owner ID was absent from local `AuthUser`. That infrastructure state should not prevent a real representative from claiming a profile, so the initialization policy now makes every affiliate profile unclaimed.

- Observation: A non-null affiliate URL is not necessarily an affiliate relationship.
  Evidence: One first-party BracketIQ fixture had `affiliateUrl=""`. Requiring a non-empty affiliate URL removed that false positive and left the BracketIQ organization `FIRST_PARTY` and `CLAIMED`.

- Observation: Website-control policy needs a broader shared-service list than affiliate source discovery.
  Evidence: Treating booking systems such as ActiveCommunities as discovery intermediaries changed an existing valid-rental result from `NEW` to `REVIEW_REQUIRED`. A separate claim-verification shared-host set preserves source discovery behavior while still preventing third-party booking domains from proving organization ownership.

- Observation: The local database had unrelated schema drift relative to the Prisma schema.
  Evidence: `prisma migrate diff` proposed dropping `Events.divisions`, changing unrelated defaults, and renaming unrelated indexes. The committed ownership migration was therefore written as an explicit scoped migration rather than accepting the generated diff.

- Observation: Final-URL validation alone is too late for ownership verification redirects.
  Evidence: The shared bounded fetcher previously followed a redirect before the caller could compare registrable domains. Its new `validateRedirect` hook rejects a cross-domain destination before the second network request begins.

- Observation: The existing internal notification module already defaulted to `samuel.r@razumly.com`.
  Evidence: `src/server/adminNotifications.ts` used that address for account, organization, and event notifications. Claim notifications now share that default while using a claim-specific override that does not redirect unrelated administrator email.

- Observation: A non-null `Organizations.ownerId` affects dispute revocation as well as initial classification.
  Evidence: Returning a disputed profile to `UNCLAIMED` cannot leave the former owner in `ownerId`, because current permission checks treat that field as authoritative. The reviewed revocation transaction assigns the deciding Razumly administrator as the placeholder owner before exposing the profile as unclaimed.

- Observation: Event list/search hydration and event-detail hydration are separate public contracts.
  Evidence: Browser testing a real affiliate event initially showed “Claimed profile” even though list/search responses correctly returned `UNCLAIMED`. `GET /api/events/[eventId]` selected only organization identity fields, so the client applied its safe legacy default. The detail route now selects ownership fields explicitly and its existing organization-hydration test asserts the full projection.

- Observation: An administrator claim list is not sufficient for a safe ownership decision without both account sides and the evidence history.
  Evidence: The protected list originally returned only claimant IDs, and the detail endpoint returned the claimant but not the current owner. The Claims workspace now hydrates claimant summaries in one batch and includes the current owner only in the protected detail response, while omitting raw evidence metadata hashes from that response.

- Observation: The repository-wide CI suite currently has unrelated failures outside organization claiming.
  Evidence: `npm run test:ci` reproduced disabled rental checkout buttons in `FieldsTabContent.test.tsx` and missing `divisions.findMany` methods in billing weekly-occurrence test mocks. The claim implementation does not edit those surfaces; 11 focused suites and the production build pass.

- Observation: A single broad relevance query can omit a true domain match when many weak name or location matches reach the result cap first.
  Evidence: The implemented matcher now loads organizations discovered by exact registrable-domain, affiliate-candidate, or source linkage separately from bounded text candidates, then de-duplicates before scoring.

- Observation: Updating `Organizations.website` without replacing `OrganizationDomains.isPrimary` leaves claim verification pointed at the old website.
  Evidence: The organization edit route previously updated only the profile string. Website changes now conflict-check first, replace the primary domain in the same transaction, and clear `SITE_CONTROL` or `AFFILIATION` trust when the controlled host changes.

- Observation: Returning an MFA setup URL without the profile security tab creates a dead end even when the profile already contains working authenticator enrollment.
  Evidence: Manual approval testing reached `APPROVED_PENDING_ACCEPTANCE`, but `/profile?mfa=organization-claim&returnTo=...` rendered the ordinary profile overview because the profile only opened authenticator controls for `tab=security`. The API now includes the tab, and the profile also recognizes the organization-claim reason directly.

- Observation: Ownership presentation must be added to both interactive event details and the canonical server-rendered public event route.
  Evidence: `PublicEventOverview` had the correct badge footer and claim callout, while `/event/[id]` still rendered only a plain Host field. The canonical route now receives ownership fields from `getRegularPublicEventSeoData` and renders the same ownership semantics.

- Observation: A stale generated Next.js development cache can block browser QA even when source compilation is valid.
  Evidence: The first verification restart returned `ENOENT` for `.next/dev/required-server-files.json`. Moving only the generated `.next/dev` directory to a recoverable temporary location and restarting rebuilt the cache; the same routes then rendered normally.

- Observation: Correct verification fragments are not sufficient instructions for a typical organization owner.
  Evidence: The first HTML status screen exposed separate “Meta name” and “Meta value” strings without giving the user a complete tag to paste or explaining where and when to publish it. The copy-first browser run verified that the complete HTML tag and each DNS provider field now reach the clipboard exactly, while manager-ready messages preserve all technical values.

- Observation: The organization detail page does not need a second explanatory ownership block after already labeling the profile as unclaimed.
  Evidence: The original full-width blue callout repeated the ownership state and pushed the primary tabs downward while leaving the profile header's right-side management-action slot empty. A dedicated header action preserves the claim path with less visual weight.

- Observation: Hiding only the unclaimed badge component would leave an empty bordered ownership footer on event cards.
  Evidence: `EventCard` owned the footer border and padding outside `OrganizationOwnershipBadges`. The card now suppresses that entire footer for unclaimed organizations rather than returning an empty visual row.

## Decision Log

- Decision: A user claims an organization profile, never an individual event, team, or rental.
  Rationale: Affiliate events, canonical teams, and rental facilities already point to an organization. One organization claim gives all related listings a consistent trust state without creating conflicting per-listing owners.
  Date/Author: 2026-07-29 / Codex

- Decision: Keep `Organizations.ownerId` required in the first release and add explicit `originType` and `ownershipStatus` fields.
  Rationale: Making `ownerId` nullable would broaden this feature into a repository-wide authorization migration and would break the mobile `Organization` model, which currently requires a non-null owner. Explicit state removes the need to infer claimability from an email domain while preserving existing permission code.
  Date/Author: 2026-07-29 / Codex

- Decision: Existing first-party organizations default to `FIRST_PARTY` and `CLAIMED`; new affiliate organizations are created as `AFFILIATE_IMPORTED` and `UNCLAIMED`.
  Rationale: This is an additive migration with safe defaults. Only a controlled backfill changes existing affiliate rows.
  Date/Author: 2026-07-29 / Codex

- Decision: Verify a claim-specific work email without forcing the user to replace the primary BracketIQ login email.
  Rationale: A user may reasonably sign in with a personal address while receiving mail at the organization. The verified address is evidence attached to the claim and cannot be used to sign in unless the user separately changes the account email through the existing flow.
  Date/Author: 2026-07-29 / Codex

- Decision: Support `DOMAIN_EMAIL`, `DNS_TXT`, `HTML_META`, and `MANUAL_REVIEW` as first-release claim methods.
  Rationale: Domain email proves an organizational affiliation; DNS and HTML tokens prove control of the official website; manual review covers clubs using Gmail, municipal domains, shared registration platforms, directory pages, and other valid exceptions.
  Date/Author: 2026-07-29 / Codex

- Decision: Domain email matching uses the registrable domain from `tldts`, and shared platforms are never automatically claimable through the platform's domain.
  Rationale: String suffix checks mishandle domains such as `club.co.uk`, and an email at a shared platform does not establish authority over one tenant or club.
  Date/Author: 2026-07-29 / Codex

- Decision: A verified claim becomes `APPROVED_PENDING_ACCEPTANCE` before ownership transfer, and the claimant must complete a purpose-scoped MFA step to accept it.
  Rationale: Administrators can finish manual review without waiting for the user, while the actual ownership transfer remains protected by recent step-up authentication.
  Date/Author: 2026-07-29 / Codex

- Decision: Reuse the existing profile Account security authenticator enrollment for organization-claim setup, preserve only a validated same-origin return path, and then require the separate claim-purpose authenticator challenge.
  Rationale: Enrollment and ownership acceptance are different security operations. Reusing profile security avoids a second enrollment implementation, while returning to the claim and starting a purpose-scoped challenge preserves the intended step-up boundary.
  Date/Author: 2026-07-29 / Codex

- Decision: Reviews remain available on unclaimed profiles, and organizations cannot turn reviews off.
  Rationale: Disabling reviews would let an organization avoid public accountability by refusing to claim. Claiming instead unlocks official responses, notifications, profile maintenance, and a reputation signal.
  Date/Author: 2026-07-29 / Codex

- Decision: Claim and website-control badges remain separate from Stripe verification.
  Rationale: “Claimed profile,” “Website verified,” and payment “Verified” communicate different facts and must not imply legal endorsement or payout readiness.
  Date/Author: 2026-07-29 / Codex

- Decision: Trust affects ordering only after the existing primary relevance signal.
  Rationale: A claimed organization should receive a useful secondary advantage, but claiming must not make a distant or irrelevant listing outrank a closer, better-matching result.
  Date/Author: 2026-07-29 / Codex

- Decision: The importer continues to update source-owned affiliate fields after a claim but cannot update owner-controlled profile fields.
  Rationale: Scrapes must keep schedules, prices, external action URLs, and source freshness current without taking ownership back or overwriting a claimant's website, logo, description, public settings, Stripe state, or tax settings.
  Date/Author: 2026-07-29 / Codex

- Decision: The web application owns the claim wizard; the first mobile release displays state and opens the canonical web claim URL.
  Rationale: Email links, DNS polling, HTML verification, manual evidence, and MFA acceptance are security-sensitive. One implementation reduces inconsistent behavior and duplicated attack surface.
  Date/Author: 2026-07-29 / Codex

- Decision: Change organization creation from a direct form into a match-first wizard.
  Rationale: The strongest time to prevent a duplicate affiliate and first-party profile is before the new row exists. Name, website, and location are sufficient to show likely matches before the user completes tax, tool, tag, logo, and other setup fields.
  Date/Author: 2026-07-29 / Codex

- Decision: Repeat duplicate matching in `POST /api/organizations`; client-side suggestions are not an authorization or uniqueness boundary.
  Rationale: A caller can bypass `CreateOrganizationModal` and call the API directly. Exact matches must return a structured 409 response unless a Razumly administrator explicitly performs a reviewed override.
  Date/Author: 2026-07-29 / Codex

- Decision: Treat an already claimed profile as an ownership-transfer or ownership-dispute workflow, not a normal claim.
  Rationale: A matching-domain email proves that the new requester may be affiliated with the organization but does not justify silently displacing an existing owner. Staff access is initiated by the organization owner through the existing staff invitation system; ownership replacement requires an authenticated transfer or administrator-reviewed dispute.
  Date/Author: 2026-07-29 / Codex

- Decision: Pending competing requests do not immediately remove an existing claimed badge or ranking boost.
  Rationale: Anyone can file a request. The organization becomes `DISPUTED` only after an administrator marks the evidence credible enough to open a formal ownership dispute.
  Date/Author: 2026-07-29 / Codex

- Decision: Exact duplicates block ordinary creation; related-domain and name/location suggestions allow an acknowledged continuation.
  Rationale: One domain can legitimately represent multiple branches, programs, facilities, or legal entities. Exact URL plus identity matches should not create another profile, while softer matches must warn without making legitimate structures impossible.
  Date/Author: 2026-07-29 / Codex

- Decision: Bind organization creation to a signed 10-minute match snapshot and recheck after acquiring an identity-scoped PostgreSQL advisory lock.
  Rationale: A client-only wizard can be bypassed, a stale acknowledgement can miss a newly created profile, and concurrent submissions can both pass an unlocked preflight. The token binds normalized identity and acknowledged matches to the user; the server still recomputes matches inside the creation transaction.
  Date/Author: 2026-07-29 / Codex

- Decision: A changed website host removes domain-bound trust until the new host is verified.
  Rationale: A claimed owner may legitimately update the organization website, but a previous domain-email or site-control proof cannot vouch for a different registrable domain. Manual-review ownership remains intact because it was not established through the replaced domain.
  Date/Author: 2026-07-29 / Codex

- Decision: A current owner's nonresponse never causes an automatic ownership transfer.
  Rationale: An abandoned account is possible, but silence is not proof that the requester should replace it. Send one reminder after 7 days and expire an ordinary ownership-transfer request after 14 days. The requester may then escalate to administrator-reviewed ownership dispute, where independently verified domain control and public evidence can support a decision.
  Date/Author: 2026-07-29 / Codex

- Decision: A website domain already verified for another organization cannot be attached to a new profile without review.
  Rationale: This prevents a second profile from borrowing an existing organization's website trust. Legitimate branches or programs that share a parent domain may continue through a `DUPLICATE_PROFILE_REVIEW`; an administrator can approve the distinct profile and record whether the domain is shared, inherited, or not eligible for an independent website-verification badge.
  Date/Author: 2026-07-29 / Codex

- Decision: Create an ownership dispute as a structured issue-and-outcome request rather than another initial claim.
  Rationale: The user must say what is wrong and what they want BracketIQ to do. Supported issues are former representative, unavailable owner, unauthorized or misleading claim, duplicate or incorrect profile, and other. Requested outcomes are ownership transfer, review or revocation of the current claim, and merge or correction of profiles.
  Date/Author: 2026-07-29 / Codex

- Decision: A complete dispute receives current-owner response before final administrator resolution, but public trust changes only after an administrator marks it credible.
  Rationale: The current owner needs a fair opportunity to provide independently verifiable context, while an abusive filing must not immediately damage a public profile. Give the owner 7 days to respond and permit one administrator-approved 7-day extension. Urgent suspension remains a separate reasoned administrator action for credible fraud or security risk.
  Date/Author: 2026-07-29 / Codex

- Decision: Dispute resolution supports bounded corrective outcomes rather than a winner-take-all transfer.
  Rationale: Evidence may show that the current owner is legitimate, that ownership should transfer, or that the underlying problem is a duplicate profile. Final outcomes are uphold current owner, initiate MFA-protected ownership transfer, revoke to unclaimed, suspend owner access, and merge or correct profiles. Staff access is never granted through a public dispute.
  Date/Author: 2026-07-29 / Codex

- Decision: Staff membership is always initiated from organization management by the owner or an authorized manager.
  Rationale: Public staff-access requests would create unsolicited permission-review work and invite social-engineering pressure. The owner already has the context to identify staff, choose the role, and review its permissions before sending an invitation.
  Date/Author: 2026-07-29 / Codex

- Decision: Every affiliate-imported organization starts `UNCLAIMED`; existing owner IDs, staff rows, missing accounts, or domain ambiguity do not establish ownership.
  Rationale: Affiliate profiles were created and maintained by the import system, and their historical owner IDs are implementation placeholders rather than verified claims. A real representative must complete the claim process. Domain ambiguity limits automatic verification methods but does not hide the claim action; manual review remains available.
  Date/Author: 2026-07-29 / Codex

- Decision: Keep claim-verification shared hosts separate from affiliate-discovery intermediary hosts.
  Rationale: A booking platform can be a valid affiliate inventory source while still being ineligible to prove ownership of a tenant organization. Separate policies preserve both facts and keep existing discovery scoring unchanged.
  Date/Author: 2026-07-29 / Codex

- Decision: Affiliate organization profile upserts stop as soon as an existing profile leaves `UNCLAIMED`.
  Rationale: `CLAIM_PENDING`, `CLAIMED`, `REVIEW_REQUIRED`, `DISPUTED`, and `SUSPENDED` all indicate that automated imports must not replace the owner, name, website, logo, description, branding, visibility, payment verification, or other profile-controlled fields. Listing targets and their outbound actions continue to update separately.
  Date/Author: 2026-07-29 / Codex

- Decision: Send an administrator notification as soon as every claim or dispute is created.
  Rationale: Even an automatic email or website claim needs an operational audit signal, and a dispute must reach human review promptly. The default recipient is `samuel.r@razumly.com`; `ORGANIZATION_CLAIM_ADMIN_EMAIL_TO` may override only claim mail, and delivery failure is recorded without rolling back a valid request.
  Date/Author: 2026-07-29 / Codex

- Decision: Send decision email only after the administrator transaction commits, and keep claimant and current-owner copy separate.
  Rationale: Email transport failure must not undo an audited ownership decision. Claimants receive the required user-facing decision and next step; current owners receive only the formal dispute outcome and organization link, never claimant-only reasoning or internal administrator notes.
  Date/Author: 2026-07-29 / Codex

- Decision: Validate every HTML-verification redirect before following it.
  Rationale: Fetching an unrelated redirect target and rejecting only the final URL would unnecessarily contact a claimant-influenced third-party host. The bounded fetcher now exposes a redirect guard, and organization verification permits only the approved registrable domain.
  Date/Author: 2026-07-29 / Codex

- Decision: Keep consensual transfer approval and dispute resolution on separate authority paths.
  Rationale: A current owner may approve an ordinary transfer only after the requester completes any selected automatic evidence, and that approval uses the current owner's `ORGANIZATION_CLAIM` MFA challenge. A dispute can reach transfer acceptance only through an explicit Razumly administrator `INITIATE_OWNERSHIP_TRANSFER` resolution, followed by the incoming owner's separate MFA challenge.
  Date/Author: 2026-07-29 / Codex

- Decision: Use the deciding Razumly administrator as the required placeholder owner when a reviewed resolution revokes a profile to unclaimed or suspends owner access.
  Rationale: `Organizations.ownerId` remains non-null in the first release and grants permission independently of ownership status. Reassigning that field in the audited resolution prevents the revoked account from retaining owner access while preserving the additive schema design.
  Date/Author: 2026-07-29 / Codex

- Decision: Make website-control verification copy-first and delegation-friendly.
  Rationale: Most claimants are business owners, not web developers. HTML verification therefore exposes one complete tag instead of separate implementation fragments; DNS retains separate copy actions because domain providers require separate type, host, and value fields. Both methods include plain-language steps and a complete message the claimant can send to the person who manages the website or domain.
  Date/Author: 2026-07-29 / Codex

- Decision: Present “Claim this profile” as the organization header's management action on the organization detail page.
  Rationale: Claiming is the unclaimed viewer's equivalent of the owner-management action. Aligning it with the organization name makes that relationship clear and avoids a large repeated callout; event-detail and public-marketing contexts can retain explanatory callouts because they do not otherwise expose the organization management header.
  Date/Author: 2026-07-29 / Codex

- Decision: Do not show “Unclaimed profile” on event cards for the current release.
  Rationale: The compact event-card footer adds visual noise without being the primary place to start a claim. Preserve the organization host link so users can reach the profile and its header claim action; continue showing positive claimed and website-control signals on event cards for now.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

Planning, interaction mockups, the additive data foundation, the server claim workflow, match-first organization creation, the public claim wizard, public ownership presentation, and the administrator review workspace are working locally. The Prisma client includes every ownership model; domain policy, classification, verification, claim state changes, claimant routes, protected administrator routes, claim-specific MFA, administrator notifications, post-commit decision emails, privacy-safe matching, signed match acknowledgements, concurrency locking, duplicate enforcement, and the two-step creation wizard are tested. The audit/backfill is deterministic and idempotent; affiliate club imports no longer overwrite profiles after they leave the unclaimed state; and website edits cannot silently retain trust from a replaced domain. The local classification now contains 87 first-party claimed organizations and 178 unclaimed affiliate organizations, with zero profiles requiring ownership review. Historical owner IDs, missing owner accounts, staff rows, and ambiguous domain provenance no longer make an imported profile look claimed or prevent a representative from starting the claim flow. Desktop and 390-pixel browser checks intercepted the real local unclaimed `503 Baseball` affiliate profile and the claimed `BracketIQ` profile with the expected claim, transfer, and dispute actions. Event cards now omit the unclaimed ownership footer while retaining their organization-profile links and positive claimed/site-control signals. The organization detail page presents its claim action in the profile header's management position instead of a second full-width ownership callout, with the title and action aligned on desktop and a clean wrapped layout on mobile. A real affiliate event detail also confirmed the unclaimed badge and claim callout after browser testing exposed and corrected an event-detail hydration omission. The repaired approval flow now also exposes the administrator decision, opens the Account security authenticator section, preserves the exact safe return path, and renders the canonical public event's ownership badge and claim callout without horizontal overflow. The HTML and DNS website-control status screens are now copy-first, explain the publishing task in plain language, and let a claimant copy complete instructions for a website or domain manager; browser checks confirmed the exact clipboard payloads. Temporary browser fixtures were removed and the source organization state was restored after validation. The production build includes the claim and match route trees. No live migration or live backfill has run. Official review responses, trust-aware ranking, mobile presentation, scheduled reminder/expiry processing, and live rollout remain outstanding.

At each completed milestone, update this section with what is working, validation evidence, deviations from the original design, and any remaining risk. At final completion, explicitly state how many affiliate organizations were classified as unclaimed, claimed, or requiring review; how many live claims were migrated or created; and whether periodic website reverification is active.

## Context and Orientation

BracketIQ stores organizations in `Organizations` in `prisma/schema.prisma`. `ownerId` is the user who receives full organization permission. `src/server/accessControl.ts` also grants access to global Razumly administrators and to staff through organization roles. An “affiliate organization” in this plan means an organization created or used by the affiliate ingestion system, including a source organization linked by `AffiliateScrapeSources.organizationId`, a club organization created from `AffiliateImportCandidates.publishedOrganizationId`, or an organization connected to an imported event, canonical team, or rental facility.

Affiliate events are real `Events` rows with `organizationId`, source metadata, and an external `affiliateUrl`. Affiliate teams are real `CanonicalTeams` rows with `organizationId`, source metadata, and `affiliateUrl`. Affiliate rentals are `Facilities` rows with `organizationId` and `affiliateUrl`; internal rental checkout remains separate. The source, candidate, and target persistence logic is centralized in `src/server/affiliateImports/service.ts`. Claiming does not delete source or candidate records and does not remove these outbound action URLs.

Organization reviews live in `OrganizationReviews`. `src/server/organizationReviews.ts` provides public review summaries and eligibility. `src/app/api/organizations/[id]/reviews` is the shared web/mobile API. Web review UI is in `src/app/organizations/[id]/OrganizationReviewsPanel.tsx` and `src/app/o/[slug]/page.tsx`. Mobile review UI is in `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationReviewsContent.kt`.

`Organizations.verificationStatus` and `src/components/ui/OrganizationVerificationBadge.tsx` describe Stripe verification. This plan introduces ownership-specific fields and a separate `OrganizationOwnershipBadge`; it must not change the meaning of the existing badge.

The public organization list comes from `src/app/api/organizations/route.ts`. Public event list responses come from `src/app/api/events/route.ts`, which already loads organization display data through `loadEventOrganizationsById`. Public team list responses come from `src/app/api/teams/route.ts`. Rental Discover data is assembled from organization and facility data in `src/app/discover/page.tsx`. Shared cards include `src/components/ui/OrganizationCard.tsx`, `EventCard.tsx`, and `TeamCard.tsx`. Event organization attribution is rendered in `src/app/discover/components/eventDetail/PublicEventOverview.tsx`.

Organization creation is currently hosted by `src/components/ui/CreateOrganizationModal.tsx`. The modal collects every field in one form and calls `organizationService.createOrganization` in `src/lib/organizationService.ts`, which posts directly to `src/app/api/organizations/route.ts`. The route requires a verified account email and validates owner and tax agreement fields, but it does not check whether the submitted website or organization identity already exists. This plan inserts a privacy-safe match service before full form completion and repeats it inside the create route.

The administrator dashboard is `src/app/admin/AdminDashboardClient.tsx`. Its existing “Verification” tab is for Stripe state. Claim review gets a separate “Claims” tab backed by new routes under `src/app/api/admin/organization-claims`. Every administrator claim route must call `requireRazumlyAdmin` from `src/server/razumlyAdmin.ts`.

The current email transport is `src/server/email.ts`. Authenticator MFA is implemented by `src/server/authTotpMfa.ts`, purpose constants in `src/server/authMfaPurpose.ts`, and the `AuthMfaChallenges` model. Add a purpose named `ORGANIZATION_CLAIM`; do not reuse login, setup, Stripe, or account-deletion challenges.

A “registrable domain” is the portion of a hostname controlled by one registrant, such as `example.com` or `example.co.uk`. Use `tldts` with private-domain handling to compute it. A “shared platform” is a domain where unrelated organizations receive pages or paths, such as Eventbrite, SportsEngine, TeamSnap, Facebook, Instagram, or a municipal booking platform. Control of a shared-platform email or page is not sufficient for automatic claiming.

“Website control” means BracketIQ found a generated token in a DNS TXT record or in an HTML meta tag on the approved official website. It does not mean BracketIQ has legally verified the business. “Manual review” means a Razumly administrator compared the request with independently sourced public information and made an auditable approval or rejection.

## Data Model and Public Contract

Add these enums to `prisma/schema.prisma`:

    enum OrganizationOriginTypeEnum {
      FIRST_PARTY
      AFFILIATE_IMPORTED
    }

    enum OrganizationOwnershipStatusEnum {
      UNCLAIMED
      CLAIM_PENDING
      CLAIMED
      REVIEW_REQUIRED
      DISPUTED
      SUSPENDED
    }

    enum OrganizationClaimStatusEnum {
      PENDING_VERIFICATION
      PENDING_MANUAL_REVIEW
      APPROVED_PENDING_ACCEPTANCE
      APPROVED
      REJECTED
      CANCELLED
      DISPUTED
      REVOKED
      EXPIRED
    }

    enum OrganizationClaimMethodEnum {
      DOMAIN_EMAIL
      DNS_TXT
      HTML_META
      MANUAL_REVIEW
      LEGACY_OWNER
    }

    enum OrganizationClaimRequestTypeEnum {
      INITIAL_CLAIM
      OWNERSHIP_TRANSFER
      OWNERSHIP_DISPUTE
      DUPLICATE_PROFILE_REVIEW
    }

    enum OrganizationOwnershipIssueReasonEnum {
      FORMER_REPRESENTATIVE
      OWNER_UNAVAILABLE
      UNAUTHORIZED_OR_MISLEADING_CLAIM
      DUPLICATE_OR_INCORRECT_PROFILE
      OTHER
    }

    enum OrganizationOwnershipRequestedOutcomeEnum {
      OWNERSHIP_TRANSFER
      REVIEW_OR_REVOKE_CLAIM
      MERGE_OR_CORRECT_PROFILE
    }

    enum OrganizationOwnershipResolutionEnum {
      UPHOLD_CURRENT_OWNER
      INITIATE_OWNERSHIP_TRANSFER
      REVOKE_TO_UNCLAIMED
      SUSPEND_OWNER_ACCESS
      MERGE_OR_CORRECT_PROFILE
    }

    enum OrganizationClaimEvidenceStatusEnum {
      PENDING
      VERIFIED
      FAILED
      EXPIRED
      REVOKED
    }

    enum OrganizationClaimVerificationLevelEnum {
      NONE
      AFFILIATION
      SITE_CONTROL
      MANUAL_REVIEW
    }

Add `originType OrganizationOriginTypeEnum @default(FIRST_PARTY)`, `ownershipStatus OrganizationOwnershipStatusEnum @default(CLAIMED)`, `claimedAt DateTime?`, `claimedByUserId String?`, `claimVerificationLevel OrganizationClaimVerificationLevelEnum @default(NONE)`, `ownershipVerifiedAt DateTime?`, and `ownershipVerificationLastCheckedAt DateTime?` to `Organizations`. Index `originType`, `ownershipStatus`, and the pair `(originType, ownershipStatus)`. Keep the existing Stripe verification fields unchanged.

Add `OrganizationDomains`. It stores `id`, timestamps, `organizationId`, the canonical official `url`, normalized `host`, `registrableDomain`, `source`, `isPrimary`, `isSharedPlatform`, `verifiedAt`, and `lastCheckedAt`. Enforce one row per organization and host and index the registrable domain. A source or importer may propose a domain, but only an administrator or an accepted claimant may replace the primary domain after a claim.

Add `OrganizationClaims`. It stores `id`, timestamps, `organizationId`, `claimantUserId`, `requestType`, `status`, `method`, `verificationLevel`, optional `organizationDomainId`, optional normalized `verificationEmail` and `verificationEmailDomain`, the claimant's role title, explanation, optional public evidence URL, independently verifiable contact details, submission time, expiration time, decision time and administrator ID, internal decision notes, user-facing decision message, acceptance time, revocation fields, and dispute fields. Dispute fields include optional `issueReason`, `requestedOutcome`, `resolution`, `parentRequestId` for a denied or expired ownership-transfer request, current-owner notification and response timestamps, a bounded current-owner response, credibility decision timestamps, and extension metadata. Store normalized email only in management responses; never return it from public organization payloads. Enforce at most one nonterminal initial claim per organization and one nonterminal request per organization and claimant through transaction locking and service checks; PostgreSQL partial uniqueness may be added in the SQL migration if Prisma cannot express it.

Add `OrganizationClaimEvidence`. It stores `id`, timestamps, `claimId`, `method`, `status`, an email secret hash or public site challenge value as appropriate, expiration time, verification time, last-check time, failure reason, and bounded JSON metadata. Raw email confirmation secrets must never be stored. DNS and HTML challenges may be stored because the claimant intentionally publishes them.

Add `OrganizationClaimEvents`. It stores an append-only audit trail with `id`, `organizationId`, optional `claimId`, optional actor user ID, a stable event type, timestamp, and bounded metadata. Events include creation, challenge sent, challenge verified, manual submission, administrator decision, MFA acceptance, ownership transfer, dispute, suspension, revocation, and periodic reverification result. Do not put raw tokens, complete email message bodies, session cookies, or sensitive documents in metadata.

Add `OrganizationReviewResponses`. It stores `id`, timestamps, `organizationReviewId`, `organizationId`, `responderUserId`, `body`, `status`, and hiding metadata. Enforce one official response per review. Add `hiddenReason String?` to `OrganizationReviews` so a pre-claim self-review can be hidden without deleting evidence.

Add `ORGANIZATION_CLAIM` to `AuthMfaChallengePurposeEnum` and to `src/server/authMfaPurpose.ts`.

Extend the public organization shape in `src/types/index.ts`, `src/lib/organizationService.ts`, and the mobile `Organization` serializer with additive defaults:

    originType: "FIRST_PARTY" | "AFFILIATE_IMPORTED"
    ownershipStatus: "UNCLAIMED" | "CLAIM_PENDING" | "CLAIMED" | "REVIEW_REQUIRED" | "DISPUTED" | "SUSPENDED"
    claimVerificationLevel: "NONE" | "AFFILIATION" | "SITE_CONTROL" | "MANUAL_REVIEW"
    claimable: boolean
    claimUrl: string | null
    ownershipAction: "CLAIM" | "REPORT_OWNERSHIP_ISSUE" | "NONE"

Public responses may expose those fields, `claimedAt`, and `ownershipVerifiedAt`. An unclaimed affiliate profile uses `CLAIM`. A claimed organization detail may use `REPORT_OWNERSHIP_ISSUE` for signed-in nonowners, while compact event, team, rental, and search cards normally use `NONE`; it never describes that action as a new initial claim. Staff access is not a public ownership action. They must not expose internal owners, claimant IDs, email addresses, evidence, administrator notes, challenge values, or audit events. Older mobile clients must decode successfully because every new Kotlin field has a default.

## Plan of Work

### Milestone 1: Add the schema, classification audit, and safe backfill

Create an additive migration for the enums, organization fields, domain, claim, evidence, event, and review-response tables. Generate the Prisma client. Do not change existing `ownerId`, Stripe verification, affiliate URLs, or public status during the migration.

Extend `scripts/audit-affiliate-org-readiness.ts` or create `scripts/audit-affiliate-organization-claims.ts` as a read-only default command. The script determines affiliate organization IDs from `AffiliateScrapeSources.organizationId`, `AffiliateImportCandidates.publishedOrganizationId`, imported `Events.organizationId`, imported `CanonicalTeams.organizationId`, and affiliate `Facilities.organizationId`. It joins the owner to `AuthUser`, evaluates Razumly admin access using the same allowed-domain and allow-list policy as `src/server/razumlyAdmin.ts`, and checks active external staff.

The dry-run report classifies each organization deterministically. Every affiliate-imported organization becomes `AFFILIATE_IMPORTED` and `UNCLAIMED`; historical owner IDs and staff rows are not migrated as proof of ownership. A single direct official domain becomes the primary claim-verification domain. Missing or conflicting domains leave automatic domain verification unavailable while preserving manual review as a claim method. First-party organizations remain `FIRST_PARTY` and `CLAIMED`.

Add `--write`, `--org=<id>`, and `--live` flags. `--write` performs idempotent updates and creates primary `OrganizationDomains` only when the official website is direct and unambiguous. `--live` requires `DATABASE_URL_LIVE`, writes a dated JSON and CSV report under `output/affiliate-organization-claims/`, and never implies `--write`. Before a live write, capture row counts and exact affected IDs. The script must be safe to rerun.

This milestone is accepted when a clean local database migrates, the audit produces stable classifications twice, `--write` changes only the expected affiliate rows, and rerunning `--write` reports zero additional changes.

### Milestone 2: Implement domain policy, claim eligibility, and verification

Create `src/server/organizationClaims/domainPolicy.ts`. Reuse `tldts` and consolidate the relevant shared, social, intermediary, and directory host knowledge currently embedded in `sourceDiscoveryRules.ts` into a reusable exported policy without changing source-discovery behavior. The module must canonicalize the official URL, reject credentials and non-HTTP protocols, compute the host and registrable domain, identify shared platforms, and compare a work email domain with the official registrable domain. Subdomains of the same registrable domain match; shared-platform registrable domains never match automatically.

Create `src/server/organizationClaims/verification.ts`. Reuse `assertSafePublicUrl` and `fetchBoundedPublicResource` from `src/server/affiliateImports/sourceIntakeUrlSafety.ts` for HTML checks. Restrict verification to the primary approved organization domain, ports 80 and 443, at most three redirects that remain on the same registrable domain, a 10-second timeout, and a 1 MiB response. A DNS verification checks TXT records at `_bracketiq-challenge.<registrable-domain>` for the exact generated value. An HTML verification checks the official homepage for `<meta name="bracketiq-site-verification" content="<value>">`. Every check records a bounded result and never follows a claimant-supplied arbitrary URL.

Create `src/server/organizationClaims/service.ts`. It exposes claimability, creates initial claims and claimed-profile ownership transfer or dispute requests, sends and confirms domain-email challenges, creates and checks DNS or HTML challenges, submits manual requests, records audit events, expires stale claims, approves or rejects manual claims, and returns privacy-safe presentation data. Email links expire after 30 minutes. Site challenges expire after 7 days. Pending manual requests expire after 30 days unless an administrator has moved them into review. Apply existing rate-limit infrastructure by user, organization, email hash, and client IP.

For `DOMAIN_EMAIL`, send a signed opaque token to the work email and store only its hash. Confirmation verifies the user, claim, organization, intended email, expiry, and current session version. A valid uncontested email claim moves to `APPROVED_PENDING_ACCEPTANCE` with verification level `AFFILIATION`.

For `DNS_TXT` or `HTML_META`, a successful challenge moves an uncontested claim to `APPROVED_PENDING_ACCEPTANCE` with verification level `SITE_CONTROL`. A redirect to a different registrable domain, a shared platform, a private network, or a mismatched token fails closed.

For `MANUAL_REVIEW`, collect role, explanation, an optional public evidence URL, and an official contact that an administrator can compare with independently sourced information. Do not collect government identity documents, tax IDs, payment details, or private legal documents in the first release. The administrator may request clarification through the normal support channel, but the database retains only the decision message and bounded review notes.

If `ownershipStatus=CLAIMED`, reject `INITIAL_CLAIM`. Offer `OWNERSHIP_TRANSFER` or `OWNERSHIP_DISPUTE` instead. An ownership-transfer request may be accepted by the current owner through MFA. An ownership-dispute request always enters administrator review even when the requester verifies domain email or site control. Filing it does not change the public organization status until an administrator marks the dispute credible. Staff access does not use this service; owners and authorized managers add known users through the existing staff invitation and role system.

This milestone is accepted by tests covering direct domains, `co.uk` domains, subdomains, Unicode/punycode, shared platforms, generic mail providers, token expiry, token replay, cross-user use, DNS success and failure, same-domain HTML redirects, cross-domain redirects, private-address rejection, and concurrent claim attempts.

### Milestone 3: Add claim APIs, MFA acceptance, and ownership transfer

Add these routes:

    GET  /api/organizations/[id]/claim
    POST /api/organizations/[id]/claims
    GET  /api/organizations/[id]/claims/[claimId]
    POST /api/organizations/[id]/claims/[claimId]/verify
    POST /api/organizations/[id]/claims/[claimId]/submit
    POST /api/organizations/[id]/claims/[claimId]/cancel
    GET  /api/organization-claims/email/confirm?token=...
    POST /api/organizations/[id]/claims/[claimId]/mfa/start
    POST /api/organizations/[id]/claims/[claimId]/mfa/confirm
    GET  /api/organizations/[id]/ownership-requests
    PATCH /api/organizations/[id]/ownership-requests/[requestId]
    POST /api/organizations/[id]/ownership-requests/[requestId]/mfa/confirm

The public `GET .../claim` route returns only the organization ownership presentation, supported methods, canonical display domain, and sign-in requirement. Claim-specific reads and writes require the claimant session. Creation requires a verified primary BracketIQ account email even if the work email differs. Return stable error codes such as `ORGANIZATION_NOT_CLAIMABLE`, `CLAIM_ALREADY_PENDING`, `DOMAIN_EMAIL_MISMATCH`, `SHARED_PLATFORM_REQUIRES_MANUAL_REVIEW`, `CLAIM_VERIFICATION_EXPIRED`, and `MFA_REQUIRED_FOR_ORGANIZATION_CLAIM`.

For a claimed organization, the same claim page presents “Request ownership transfer” and “Report an ownership issue.” It also explains that staff are added by the organization owner from organization management. The ownership-request routes require the current owner, a user with `organization.manage`, or a Razumly administrator and return no secret evidence to ordinary staff. A current owner receives transfer requests inside organization management and by email. Approving ownership transfer requires purpose-scoped MFA from the current owner, then acceptance and MFA from the incoming owner. An ownership dispute bypasses current-owner approval only after administrator review; both parties are notified and the previous owner remains in place until the final audited decision.

Send a reminder to the current owner after 7 days. An unanswered ownership-transfer request expires after 14 days and does not alter permissions, ownership status, badges, or ranking. The requester may explicitly escalate an expired or denied transfer request into `OWNERSHIP_DISPUTE`; this creates a new administrator-review action while retaining the linked request history. Administrator approval still requires independently checked evidence and incoming-owner MFA. A current owner can deny a transfer request with a reason, and the requester can report that decision as an ownership issue without receiving any private owner information.

An ownership dispute starts from “Report an ownership issue” on the claimed-profile page, the exact-claimed result in organization creation, or an expired or denied ownership-transfer request. Require the requester to choose one `issueReason` and one `requestedOutcome`, explain what changed, identify their role, provide an independently sourced official contact, and certify that the request is accurate. Let them strengthen the request with domain email, DNS, HTML, and bounded public evidence, but never accept a verified method as automatic proof that the existing owner is invalid. Rate-limit disputes by user, organization, domain, and client IP and block a second nonterminal dispute by the same requester.

After completeness and abuse checks, notify the current owner with the issue category, requested outcome, requester display name and verified-evidence classes, but not private contact details, raw evidence, secret values, or administrator notes. Give the current owner 7 days to respond with a bounded explanation and public evidence URL. A Razumly administrator may grant one 7-day extension. Silence closes the response window but does not prove the request or transfer ownership; the administrator still compares independent evidence. Return stable errors such as `OWNERSHIP_DISPUTE_ALREADY_PENDING`, `OWNERSHIP_DISPUTE_EVIDENCE_REQUIRED`, `OWNERSHIP_DISPUTE_RESPONSE_CLOSED`, and `OWNERSHIP_DISPUTE_RATE_LIMITED`.

Add the MFA purpose and purpose-scoped challenge helpers. If authenticator MFA is not enrolled, return a redirect to `/profile?mfa=organization-claim&returnTo=<claim-url>`. Confirmation consumes an `ORGANIZATION_CLAIM` challenge only. Do not accept a login, setup, account-deletion, or financial challenge.

Accepting an approved claim runs one transaction. Lock the organization and claim rows, recheck that the organization is still claimable, set the claim to `APPROVED`, set the organization owner to the claimant, set `ownershipStatus=CLAIMED`, copy the approved verification level and timestamps, ensure default organization roles, record the ownership-transfer audit event, and expire or reject competing claims. Global administrators retain access through `hasOrgPermission`; no internal administrator is added as organization staff.

Call a new `reconcileOrganizationReviewConflicts(organizationId)` helper after transfer. It hides published reviews authored by the new owner or active staff, records `hiddenReason=OWNER_OR_STAFF_CONFLICT`, and leaves unrelated reviews untouched. Call the same helper after staff membership changes so a person cannot retain a public review after becoming staff.

This milestone is accepted when an email-, DNS-, HTML-, and manually approved claim each reach `APPROVED_PENDING_ACCEPTANCE`, only the claimant can complete MFA acceptance, exactly one owner transfer occurs under concurrent requests, the old internal owner loses owner-specific status but retains global admin access, and prior claimant/staff reviews become hidden.

### Milestone 4: Add the administrator claim and dispute queue

Add `claims` to the `AdminTab` union in `src/app/admin/AdminDashboardClient.tsx`. Label it “Claims” and keep it separate from the existing Stripe “Verification” tab. Add:

    GET   /api/admin/organization-claims
    GET   /api/admin/organization-claims/[claimId]
    PATCH /api/admin/organization-claims/[claimId]

The list supports status, method, organization, claimant, and date filters with pagination. The detail response includes the organization, official-domain provenance, claimant role and explanation, verification attempts, independently sourced contact fields, audit events, existing owner/staff summary, linked affiliate source and candidate summary, and any competing claim. It never returns raw secret hashes.

Administrator actions are `REQUEST_INFORMATION`, `APPROVE`, `REJECT`, `MARK_DISPUTED`, `RESOLVE`, `SUSPEND`, `REVOKE`, and `RESTORE`. Approval requires a user-facing decision message and an explicit verification level. Rejecting and revoking require a reason. A competing request against a claimed organization stays a pending transfer or dispute request until an administrator marks it credible. Only then may the organization become `DISPUTED`; even that state cannot transfer ownership without a final reviewed decision and MFA acceptance. Revocation changes organization ownership status to `SUSPENDED` or `UNCLAIMED` according to the recorded decision but does not delete the organization or affiliate targets.

`RESOLVE` requires one `OrganizationOwnershipResolutionEnum` value and a user-facing decision message. `UPHOLD_CURRENT_OWNER` closes the dispute without changing ownership. `INITIATE_OWNERSHIP_TRANSFER` creates the approved-pending-acceptance state and requires incoming-owner MFA; administrators do not directly write a new owner from the dashboard. `REVOKE_TO_UNCLAIMED` removes the disputed owner's organization permissions and returns an affiliate profile to claimable state. `SUSPEND_OWNER_ACCESS` is reserved for credible fraud or security risk and requires an explicit reason. `MERGE_OR_CORRECT_PROFILE` records the surviving profile and field/link changes; any destructive merge implementation requires a separate data-safe migration or reconciliation plan. None of these resolutions grants staff membership; that remains an owner or authorized-manager invitation.

Send transactional emails to the claimant for submission, requests for information, approval pending acceptance, rejection, dispute, revocation, and completion. On approval and ownership transfer, also notify an independently sourced organization contact when one exists. Email delivery failure must be recorded and retriable but must not roll back a completed database decision.

This milestone is accepted when a Razumly administrator can review and decide a manual claim, a non-admin receives 403 from every admin route, a dispute cannot transfer ownership, required reasons are enforced, and the dashboard distinguishes claim verification from Stripe verification.

### Milestone 5: Prevent duplicate creation and route people to claim, ownership transfer, or dispute

Create `src/server/organizationMatch.ts`. It normalizes name, website, location, and coordinates, then compares the proposed profile against all potentially matching listed and unlisted organizations. The server may search unlisted affiliate profiles even when the requester cannot browse them normally, but the response is limited to display name, public logo when available, approximate city/region, ownership presentation, confidence and reason codes, and the submitted website domain when it is the matching domain. It never exposes an unlisted profile's contact details, exact private address, staff, internal owner, source evidence, administrator notes, or unpublished description.

Matching uses three confidence levels. `EXACT` means the canonical official URL is equal, or the primary registrable domain plus strongly normalized organization name are equal, or the normalized name and near-identical location match an affiliate source/candidate record. `RELATED` means the registrable domain is the same but the identity differs, or the name and location are similar. `POSSIBLE` means only one weaker identity signal matches. Shared-platform domains never create an exact domain match by themselves.

Add:

    POST /api/organizations/matches

The authenticated request accepts partial `name`, `website`, `location`, and coordinates and returns privacy-safe matches with `confidence`, reason codes, ownership status, and a recommended action. Recommended actions are `CLAIM_PROFILE`, `REQUEST_OWNERSHIP_TRANSFER`, `REPORT_OWNERSHIP_ISSUE`, `OPEN_PROFILE`, or `CONTINUE_NEW_ORGANIZATION`.

Convert the create mode in `src/components/ui/CreateOrganizationModal.tsx` into two steps. Step one is “Find or create your organization” and asks for name, website, and location. Debounce server matching after a valid website or sufficient name/location input. Show existing profiles before the rest of the form. An exact unclaimed match makes “Claim this profile” the primary action. An exact claimed match offers “Open organization profile,” “Request ownership transfer,” and “Report an ownership issue.” It does not offer staff access; owners add staff from organization management. A related or possible match lets the user open it or explicitly confirm “This is a different organization” before continuing. Editing an existing organization does not use the creation wizard, but changing its website must run the same domain-conflict check before save.

The final create request includes a short-lived signed `organizationMatchToken` returned by the match endpoint. The token binds the normalized name, domain, location bucket, match IDs, confidence decisions, user ID, and expiration. `POST /api/organizations` recomputes the match even when the token is valid. An exact match returns HTTP 409 with code `ORGANIZATION_ALREADY_EXISTS`, privacy-safe matches, and recommended actions. A related or possible match requires a valid acknowledgement token. Only a Razumly administrator can explicitly override an exact match, and the override reason is written as a claim audit event.

When creation succeeds, create or update the primary `OrganizationDomains` row in the same transaction, set `originType=FIRST_PARTY`, `ownershipStatus=CLAIMED`, and `claimedByUserId=ownerId`, but leave `claimVerificationLevel=NONE` until domain email, DNS, HTML, or manual verification occurs. A newly created owner does not receive a “Website verified” badge merely because they typed the URL.

If the submitted domain is already verified for another organization, do not attach it to the new profile. An exact identity match remains blocked and routes to that profile. A plausible distinct branch or program may submit `DUPLICATE_PROFILE_REVIEW`; until an administrator approves it, the new profile is not created and the domain cannot be used for automatic verification. The administrator records whether the result is a duplicate to merge, a distinct organization sharing a parent site, or a distinct organization that must provide its own official domain.

Add matching and UI regressions to `src/server/__tests__/organizationMatch.test.ts`, `src/app/api/organizations/matches/__tests__/route.test.ts`, `src/app/api/organizations/__tests__/organizationsRoute.test.ts`, and `src/components/ui/__tests__/CreateOrganizationModal.test.tsx`. Cover unlisted affiliate matches, claimed and unclaimed actions, exact URL, registrable domain plus name, same-domain sibling organizations, verified-domain conflicts, shared platforms, name/location matches, stale tokens, API bypass attempts, concurrent creates, website edits, and administrator overrides.

This milestone is accepted when entering an existing affiliate website in the wizard offers its existing profile instead of silently creating a duplicate; an unclaimed match starts a claim; a claimed match opens the existing profile or starts ownership transfer or dispute; an acknowledged soft match can create a distinct organization; and a direct API call cannot create an exact duplicate.

### Milestone 6: Make affiliate persistence claim-aware

Split affiliate organization fields into source-owned and owner-owned groups in `src/server/affiliateImports/service.ts`. New unclaimed affiliate organizations may receive source-derived name, location, address, description, website proposal, logo, sports, public slug, and public page state. Once `ownershipStatus=CLAIMED`, normal scrapes may update only affiliate provenance and target listing data. They must not change `ownerId`, ownership fields, primary official domain, website, logo, description, public branding/settings, Stripe verification, products, tax settings, or organization-managed sports and tags.

Do not use `candidate.officialActionUrl` as the automatic official organization domain. Preserve it on the event, team, or facility target. An organization-domain proposal should prefer a reviewed direct organization website from the club candidate or source base URL. Shared-platform and booking/action URLs remain source evidence but are marked non-primary and non-claimable.

When source data conflicts with a claimed profile, record a bounded warning on the candidate or scrape run for administrator review instead of overwriting the claim-controlled field. Existing event, team, and rental upserts continue to update source-owned schedule, price, availability, source URL, and affiliate action URL fields.

Add regression tests to `src/server/affiliateImports/__tests__/service.test.ts` for an unclaimed create, an unclaimed refresh, a claimed refresh, a shared-platform action URL, and a claimed organization with new candidate content. This milestone is accepted when repeating a scrape cannot change a claimed owner or claimed profile field and still updates the linked affiliate target's current external data.

### Milestone 7: Add the web claim experience and official review responses

Create `src/app/organizations/[id]/claim/page.tsx` and focused client components under `src/app/organizations/[id]/claim/`. The wizard has sign-in, method selection, domain email, DNS, HTML meta, manual review, pending, approved-pending-MFA, completed, rejected, disputed, and expired states. It explains what each method proves, displays copyable site challenges, supports rechecking, preserves safe progress after authentication, and never displays internal owner email addresses.

Create `src/components/ui/OrganizationOwnershipBadge.tsx` and `OrganizationClaimCallout.tsx`. “Unclaimed profile” is neutral rather than punitive. “Claimed profile” appears for approved ownership. “Website verified” appears only for `SITE_CONTROL`. Place ownership badges in a dedicated bottom row of the organization host card, below the logo and identity row, so they never compress or wrap the organization name into a narrow column. `REVIEW_REQUIRED`, `DISPUTED`, and `SUSPENDED` do not expose an ordinary claim action. A claimed organization detail may expose “Report an ownership issue” without suggesting that ownership is available; compact event, team, rental, and search cards show status only. Keep `OrganizationVerificationBadge.tsx` unchanged except for layout coordination.

Update `OrganizationCard.tsx`, `src/app/o/[slug]/page.tsx`, `src/app/organizations/[id]/page.tsx`, `EventCard.tsx`, `TeamCard.tsx`, `src/app/discover/components/eventDetail/PublicEventOverview.tsx`, and the rental cards in `src/app/discover/page.tsx` and `DiscoverMapModal.tsx`. Cards show at most a compact ownership signal. Detail/profile surfaces show the claim callout. The claim action never replaces or intercepts “Register on official site,” “Book on official site,” or external team registration.

Use `docs/mockups/affiliate-organization-claiming/index.html` as the review reference for ownership placement and flow states. The public event examples `EV-01` through `EV-05` put ownership in a full-width footer row on the existing host card and keep the affiliate organizer-site action primary. Creation uses `CR-01` through `CR-09`; the initial claim uses `CL-00` through `CL-10`; claimed-profile ownership and transfer use `AC-01` and `TR-01` through `TR-04`; owner-initiated staffing uses `OW-01` and `OW-02`; disputes use `DS-01` through `DS-07`. The implementation may use native Mantine components and current responsive primitives, but it must preserve the information hierarchy, labels, decision boundaries, and edge-state transitions represented by those IDs.

Extend review payloads with one optional privacy-safe official response. Add create/update/delete routes nested under the review. Require the organization owner or a staff member with `organization.manage`; do not allow the organization to edit or hide the review itself. Render “Official response from <organization>” on the internal review panel, public organization page, and mobile review content. Report and moderation behavior remains available for both the review and its response.

This milestone is accepted in desktop and mobile-sized browsers when an unclaimed affiliate organization presents one clear claim entry point, a first-party organization does not, a pending claim cannot be duplicated, a claimed organization displays the correct badge, an owner can respond but cannot remove a review, and all affiliate outbound actions behave exactly as before.

### Milestone 8: Add bounded trust-aware ranking

Create `src/server/organizationTrust.ts` with a batch API that accepts organization IDs and returns public trust presentation and a stable secondary ranking tuple. The tuple is:

    ownership tier: SITE_CONTROL=3, AFFILIATION or MANUAL_REVIEW=2, CLAIMED legacy=1, all other states=0
    Bayesian review score: (reviewCount / (reviewCount + 5)) * organizationAverage
                           + (5 / (reviewCount + 5)) * globalPublishedAverage
    published review count
    normalized organization name

If there are no published reviews globally, use 3.5 as the prior average. Hidden reviews and official responses do not contribute to the rating. `DISPUTED` and `SUSPENDED` ownership tiers are zero. Compute aggregates in batches for the current result page; do not query once per organization.

In `src/app/api/organizations/route.ts`, preserve the current name, location, address, and description relevance tuple. Within equal text relevance, compare ownership tier, Bayesian score, review count, then name. With no query, preserve distance on the Discover client, then use the trust tuple, then name. For rentals, events, and teams, preserve their current primary ordering by distance, next occurrence/start time, open-registration relevance, and filters; use organization trust only when the existing primary values compare equal. Do not reorder management, owner-scoped, template, or admin responses.

Include a public `trustSignals` object only if clients need it for display; never expose the exact internal ranking tuple as a promise that clients may game. Add deterministic unit tests proving that exact relevance and distance remain primary, a claimed result wins an otherwise equal comparison, one five-star review does not overwhelm an established review history, and a disputed claim gets no boost.

This milestone is accepted when a local fixture with otherwise equal organizations visibly orders site-verified, claimed, and unclaimed profiles in that sequence while a closer or stronger text match still ranks first.

### Milestone 9: Add mobile parity without duplicating the claim wizard

In `/Users/elesesy/StudioProjects/mvp-app/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt`, add serializable ownership enums and fields with defaults matching the server contract. Keep `ownerId` required. Add ownership badge and claim-callout composables under `core/ui`.

Update `DiscoverOrganizationCard.kt`, `DiscoverRentalCard.kt`, shared `EventCard.kt`, the team Discover list, `ReadOnlyHostContent.kt`, and `OrganizationDetailScreen.kt`. Cards receive compact claimed or website-verified presentation. Organization detail and affiliate host detail show “Claim this profile” only for `claimable=true`; the action opens the absolute BracketIQ `claimUrl` using the existing platform URL handler. Do not add native email, DNS, HTML, manual-review, or MFA form state.

Add Kotlin serialization tests for old payloads without ownership fields and current payloads with them. Add Compose or presentation tests for unclaimed, claimed, website-verified, pending, and first-party states. Preserve the existing external event/team/rental click behavior.

This milestone is accepted when Android and iOS compile, older cached organization JSON still decodes, mobile displays the same labels as web, and tapping the claim action opens the web wizard while external registration and booking continue to open their protected outbound URLs.

### Milestone 10: Reverification, operational rollout, and final evidence

Add `scripts/reverify-organization-claims.ts`. It checks only approved `SITE_CONTROL` evidence due for reverification, uses the same safe DNS/HTML routines, records results, and applies a 14-day grace period after the first failure. During the grace period the owner retains access and receives a notification. After repeated failure, remove only the “Website verified” level and ranking tier; do not remove ownership automatically. An administrator handles ownership disputes or revocation.

Document the scheduled job and add a package command such as `organization-claims:reverify`. The job is idempotent, acquires an advisory lock, processes a bounded batch, continues after individual failures, and sends an administrator summary.

Deploy in this order: take a database backup; apply the additive migration; deploy code that understands both default and backfilled states; run the live classification audit without writes; verify that every affiliate-imported row is `UNCLAIMED` and every first-party row remains `CLAIMED`; run the live backfill with `--write`; deploy mobile after the server contract is live; then enable the reverification schedule. Never deploy application code that queries new claim columns before the migration.

This milestone is accepted when production API samples contain no private claim data, one controlled production claim completes end to end, the claimant can manage the organization, the importer cannot revert ownership, review response and ranking behavior are visible, all outbound links still work, and the live audit report accounts for every affiliate organization.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Before editing, inspect both repositories:

    git status --short --branch
    git -C /Users/elesesy/StudioProjects/mvp-app status --short --branch

Create the migration and regenerate the client:

    npx prisma format
    npx prisma validate
    npx prisma migrate dev --name add_affiliate_organization_claiming
    npx prisma generate

Run the classification audit without writes before using `--write`:

    npm run affiliate:org-claims:audit
    npm run affiliate:org-claims:audit -- --write
    npm run affiliate:org-claims:audit

The expected final local transcript includes zero additional changes:

    Affiliate organizations: <count>
    Unclaimed: <count>
    Review required: 0
    Rows changed: 0

Run focused web tests in one process:

    npm test -- --runInBand \
      src/server/__tests__/organizationClaims.test.ts \
      src/server/__tests__/organizationClaimDomainPolicy.test.ts \
      src/server/__tests__/organizationMatch.test.ts \
      src/server/__tests__/organizationTrust.test.ts \
      src/server/__tests__/organizationReviews.test.ts \
      src/app/api/organizations/[id]/claims/__tests__/route.test.ts \
      src/app/api/admin/organization-claims/[claimId]/__tests__/route.test.ts \
      src/app/api/organizations/matches/__tests__/route.test.ts \
      src/app/api/organizations/__tests__/organizationsRoute.test.ts \
      src/app/api/organizations/[id]/reviews/__tests__/route.test.ts \
      src/components/ui/__tests__/CreateOrganizationModal.test.tsx \
      src/server/affiliateImports/__tests__/service.test.ts

Quote bracketed Next.js paths if the shell expands them. Add focused component tests and run them with `--runInBand`; do not run multiple Jest processes against the same checkout because they share Next cache artifacts.

Run the repository checks:

    npx prisma validate
    npx tsc --noEmit
    git diff --check
    npm run build

For local browser validation, start one development server:

    npm run dev

Use a deterministic local affiliate fixture created by the audit/fixture script. Verify the organization profile, event detail, team detail, and rental detail at desktop and 390-pixel widths. Exercise one domain-email claim using a configured test SMTP inbox or a route-level captured mail transport, one DNS or HTML verification through a controlled public test domain, one manual administrator approval, MFA acceptance, an official review response, and a repeated affiliate scrape.

From `/Users/elesesy/StudioProjects/mvp-app`, run focused tests and platform compilation:

    ./gradlew :composeApp:testDebugUnitTest --tests '*OrganizationOwnership*' --tests '*OrganizationDetail*'
    ./gradlew :composeApp:compileDebugKotlinAndroid
    git diff --check

Run the configured iOS simulator build through XcodeBuildMCP when implementing the mobile milestone. Before the first simulator build, call `session_show_defaults`; if project, scheme, and simulator are configured, use `build_run_sim` directly. Capture one organization card, one affiliate event host section, and one organization detail claim callout.

Before live work, inspect migration state and obtain a backup. If DigitalOcean Postgres is unreachable, first verify this machine's IP is allowed by the managed database firewall while preserving existing rules. Apply the migration with the repository's established live database environment, run the audit without `--write`, inspect its JSON/CSV output, and only then run the scoped write.

At every stopping point, update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`. Preserve unrelated dirty files. Stage explicit paths only if the user later asks for a commit.

## Validation and Acceptance

Claimability is accepted when first-party organizations never expose a claim CTA; every affiliate-imported organization starts unclaimed and exposes the appropriate claim entry point; domain ambiguity routes the claimant to manual review instead of changing the public ownership state; and public payloads do not disclose the internal owner email or claim evidence.

Duplicate prevention is accepted when the creation wizard finds listed and unlisted profiles before the full form, an exact unclaimed affiliate match offers claiming, an exact claimed match offers ownership transfer or an ownership issue, a soft same-domain sibling can continue only after acknowledgement, and `POST /api/organizations` returns a structured 409 for an exact duplicate even when the caller bypasses the client. Creating or editing a profile must never attach a domain already verified to another organization without a reviewed administrator override.

Domain email is accepted when a verified work email on the approved registrable domain receives a one-time link, the link cannot be replayed or used by another account, a shared-platform or generic email domain cannot auto-approve, and the claimant's primary login email remains unchanged.

Website control is accepted when an exact DNS TXT or HTML meta token on the approved official domain advances the claim, and wrong tokens, expired tokens, redirects to unrelated domains, private network targets, oversized pages, unsafe ports, and DNS rebinding attempts fail closed.

Manual review is accepted when a claimant without domain email or site control can submit a bounded request, only Razumly administrators can inspect and decide it, every decision has an audit event and user-facing message, and a second claimant creates a dispute rather than an ownership transfer.

Already-claimed handling is accepted when the public profile does not offer staff access, the organization owner or an authorized manager can add a known user from the existing staff page with an explicit role and permissions, an ownership transfer requires MFA from both current and incoming owners, a competing ownership claim always enters administrator review, and merely filing a dispute does not remove the current claimed badge or owner.

Dispute handling is accepted when the requester must choose an issue reason and requested outcome, may link a denied or expired prior request, can provide domain or bounded public evidence without uploading sensitive documents, and certifies the report before submission. A complete non-abusive request gives the current owner a privacy-bounded 7-day response window with at most one administrator-approved extension. Filing alone leaves ownership, access, badge, and ranking unchanged. Only `MARK_DISPUTED` changes the public profile to “Ownership under review” and removes the trust boost. Final resolution must record one bounded outcome, notify both parties, and require incoming-owner MFA before any transfer.

Ownership transfer is accepted when the approved claimant must complete an `ORGANIZATION_CLAIM` MFA challenge, one transaction transfers `ownerId`, preserves global administrator access, closes competing claims, hides prior owner/staff self-reviews, and is safe under duplicate confirmation requests.

Affiliate persistence is accepted when a post-claim scrape updates current listing information and protected outbound URLs but cannot change the owner, claim state, primary official domain, claimant-maintained profile, Stripe state, tax state, or public branding.

Review behavior is accepted when reviews remain readable and writable according to existing eligibility before a claim, a claimed organization can write one official response per review, the organization cannot edit or remove the review, and owner/staff reviews are hidden after their role changes.

Ranking is accepted when relevance, distance, date, and availability remain primary; ownership trust breaks otherwise equal results; review confidence is stable against low-volume manipulation; and disputed or suspended claims receive no boost.

Presentation is accepted when organization, event, team, and rental surfaces use the same ownership language, detail views expose the claim action without displacing the affiliate action, payment verification remains visually and semantically separate, and mobile opens the canonical web wizard.

Operational acceptance requires migration-before-code deployment, a reviewed live backfill report accounting for every affiliate organization, a controlled production claim, a successful post-claim scrape, no raw affiliate destination regression, no sensitive claim data in public JSON or logs, and a successful reverification job.

## Idempotence and Recovery

The migration is additive. Prisma generation, tests, and domain audits are repeatable. The backfill script is dry-run by default and computes desired state before changing rows. A repeated `--write` must report zero changes. Never infer live write permission from `--live`; require `--write` separately.

Claim creation and acceptance use transactions and stable claim IDs. Repeated email confirmation, verification checks, administrator decisions, MFA confirmations, and ownership acceptance return the current state rather than creating duplicate rows or transfers. Secret-bearing email tokens are single-use. DNS and HTML challenges can be rechecked until expiry.

Organization matching is read-only until creation or an ownership request is submitted. Match tokens are signed, short-lived, bound to the user and normalized input, and safe to regenerate. The create route always recomputes exact matches, so replaying or omitting a token cannot create a known exact duplicate. If matching is temporarily unavailable, fail the create request with a retryable service error rather than bypassing duplicate protection.

If the application deploy fails after the migration, the old application can continue because new columns have safe defaults and old columns are untouched. If the backfill classifies an organization incorrectly, use the administrator claim action or a scoped script to restore its prior `originType`, `ownershipStatus`, and owner from the dated report; do not delete the claim history. If importer protection fails, disable scheduled affiliate scrapes before correcting the field-ownership boundary.

Revocation never deletes organizations, events, teams, rentals, reviews, source rows, or candidate history. It changes ownership status and permissions through an audited transaction. A failed website reverification removes the website-control badge only after its grace period and never automatically removes the owner.

Do not use destructive Git commands or broad staging. Both repositories may contain unrelated work. Validate with explicit paths and preserve CocoaPods changes in `mvp-app` unless the mobile implementation intentionally regenerates and validates them.

## Artifacts and Notes

Keep dated classification outputs under `output/affiliate-organization-claims/` out of commits unless the user explicitly asks to retain a sanitized sample. Reports must redact full claimant emails in summary output and must never contain tokens, password hashes, cookies, or MFA secrets.

The local migration and backfill evidence from 2026-07-29 is:

    Database schema is up to date.
    FIRST_PARTY / CLAIMED: 87
    AFFILIATE_IMPORTED / UNCLAIMED: 178
    AFFILIATE_IMPORTED / REVIEW_REQUIRED: 0
    OrganizationDomains: 164
    OrganizationClaims: 0
    Second local --write affectedOrganizationIds: []
    Stable digest: 0a305f6889670c49dc288526d51524ffee1831b189a52dd792643080b572c975
    Fresh temporary database: all 165 migrations applied; schema up to date
    Focused Jest: 84 passed
    TypeScript: npx tsc --noEmit exited 0

The local claim-service and route evidence from 2026-07-29 is:

    Focused Jest: 11 suites, 127 tests passed
    Focused ESLint: exited 0
    TypeScript: npx tsc --noEmit exited 0
    Prisma schema/client check: exited 0
    Production build: 126 static pages generated; new claim and admin routes present
    Git whitespace check: git diff --check exited 0
    Default claim/dispute admin recipient: samuel.r@razumly.com
    Full test:ci: unrelated existing FieldsTabContent and weekly-occurrence billing mock failures

The reviewable interaction reference is `docs/mockups/affiliate-organization-claiming/index.html`; its companion `README.md` contains the Mermaid flow inventory and render audit. The artifact contains 39 individually addressable screen IDs across public event, organization creation, initial claim, claimed-profile ownership/transfer, owner-initiated staffing, and dispute flows. On 2026-07-29, Chromium rendered every ID at desktop and 390-pixel mobile widths with no horizontal overflow and no `undefined` or `[object Object]` state content. The artifact is static and does not call production APIs.

The public ownership presentation has this conceptual shape:

    {
      "originType": "AFFILIATE_IMPORTED",
      "ownershipStatus": "UNCLAIMED",
      "claimVerificationLevel": "NONE",
      "claimable": true,
      "claimUrl": "https://bracket-iq.com/organizations/org_123/claim",
      "ownershipAction": "CLAIM"
    }

An approved site-control claim presents:

    {
      "originType": "AFFILIATE_IMPORTED",
      "ownershipStatus": "CLAIMED",
      "claimVerificationLevel": "SITE_CONTROL",
      "claimable": false,
      "claimUrl": "https://bracket-iq.com/organizations/org_123/claim",
      "ownershipAction": "REPORT_OWNERSHIP_ISSUE"
    }

The public UI translates the first payload into “Unclaimed profile” and the second into “Claimed profile” plus “Website verified.” It does not expose “Razumly-owned,” “admin-owned,” the claimant's email, or a legal/business-verification claim.

For a claimed profile, the ownership presentation uses:

    {
      "originType": "AFFILIATE_IMPORTED",
      "ownershipStatus": "CLAIMED",
      "claimVerificationLevel": "AFFILIATION",
      "claimable": false,
      "claimUrl": "https://bracket-iq.com/organizations/org_123/claim",
      "ownershipAction": "REPORT_OWNERSHIP_ISSUE"
    }

The URL remains available because it now presents ownership transfer and ownership-issue choices. It must not present the organization as unclaimed or accept public staff-access requests.

The claim wizard should explain:

    Domain email: Verify an email address that uses this organization's official website domain.
    DNS verification: Add a temporary TXT record to the organization's domain.
    Website verification: Add a temporary verification tag to the official website.
    Manual review: Tell us how you represent the organization so our team can review public evidence.

## Interfaces and Dependencies

Use existing dependencies: Prisma and PostgreSQL for persistence, Zod for route input, `tldts` for registrable domains, `node:dns/promises` for TXT records, the safe affiliate intake fetcher for HTML verification, `src/server/email.ts` for transactional mail, existing rate-limit helpers, `src/server/authTotpMfa.ts` for purpose-scoped MFA, and Mantine for web UI. Do not introduce an external domain-verification vendor in the first release.

In `src/server/organizationClaims/domainPolicy.ts`, export:

    export type OrganizationDomainPolicy = {
      canonicalUrl: string;
      host: string;
      registrableDomain: string;
      isSharedPlatform: boolean;
      automaticMethods: Array<'DOMAIN_EMAIL' | 'DNS_TXT' | 'HTML_META'>;
    };

    export function organizationDomainPolicyForUrl(value: string): OrganizationDomainPolicy;
    export function emailMatchesOrganizationDomain(email: string, policy: OrganizationDomainPolicy): boolean;

In `src/server/organizationMatch.ts`, export:

    export type OrganizationMatchConfidence = 'EXACT' | 'RELATED' | 'POSSIBLE';
    export type OrganizationMatchAction =
      | 'CLAIM_PROFILE'
      | 'REQUEST_OWNERSHIP_TRANSFER'
      | 'REPORT_OWNERSHIP_ISSUE'
      | 'OPEN_PROFILE'
      | 'CONTINUE_NEW_ORGANIZATION';

    export async function findOrganizationMatches(
      input: FindOrganizationMatchesInput,
      viewer: { userId: string; isAdmin?: boolean },
    ): Promise<OrganizationMatchResult>;

    export async function assertOrganizationCreationAllowed(
      input: CreateOrganizationMatchInput,
      viewer: { userId: string; isAdmin?: boolean },
    ): Promise<{ matchToken: string; acknowledgedMatchIds: string[] }>;

In `src/server/organizationClaims/service.ts`, export:

    export async function getOrganizationClaimPresentation(
      organizationId: string,
      viewer: { userId: string; isAdmin?: boolean } | null,
    ): Promise<OrganizationClaimPresentation>;

    export async function createOrganizationClaim(
      input: CreateOrganizationClaimInput,
      actor: { userId: string; isAdmin?: boolean },
    ): Promise<OrganizationClaimView>;

    export async function verifyOrganizationClaim(
      input: VerifyOrganizationClaimInput,
      actor: { userId: string; isAdmin?: boolean },
    ): Promise<OrganizationClaimView>;

    export async function decideOrganizationClaim(
      input: DecideOrganizationClaimInput,
      admin: { userId: string; adminEmail: string },
    ): Promise<OrganizationClaimView>;

    export async function acceptOrganizationClaim(
      input: AcceptOrganizationClaimInput,
      actor: { userId: string; isAdmin?: boolean },
    ): Promise<OrganizationClaimView>;

    export async function reconcileOrganizationReviewConflicts(
      organizationId: string,
    ): Promise<{ hiddenReviewIds: string[] }>;

In `src/server/organizationTrust.ts`, export a batch function:

    export async function getOrganizationTrustById(
      organizationIds: string[],
    ): Promise<Map<string, OrganizationTrustView>>;

`OrganizationTrustView` contains public badge booleans and the internal comparison fields. Keep the comparison fields server-only unless a specific client sort requires a bounded public tier.

The mobile ownership enums must use the exact server strings and default to `FIRST_PARTY`, `CLAIMED`, and `NONE` when absent so old API payloads and cached data remain readable.

Plan update note: Created the initial self-contained ExecPlan on 2026-07-29 after inspecting the current web and mobile ownership, affiliate import, review, search, domain-safety, email, MFA, and administrator surfaces. The plan intentionally separates organization claiming from Stripe verification, keeps reviews platform-controlled, preserves affiliate outbound actions, and makes the web wizard the single verification implementation for the first release. Updated later on 2026-07-29 after reviewing the current creation modal and API to add match-first organization creation, server-enforced duplicate prevention, unlisted affiliate-profile suggestions, MFA ownership transfer, and administrator-reviewed ownership disputes. Updated again after building and rendering the full HTML flow reference to define structured dispute reasons and requested outcomes, a privacy-bounded current-owner response period, an administrator credibility threshold, and bounded corrective resolutions beyond ownership transfer. Updated after visual review to place ownership badges in a full-width card footer and remove public staff-access requests; staff are now added only by owners or authorized managers from organization management. Updated during implementation on 2026-07-29 after locally deploying the additive schema, building the deterministic audit/backfill and domain policy, separating claim-only shared hosts from discovery intermediaries, protecting non-unclaimed profiles from affiliate upserts, and recording local validation evidence and remaining milestones. Updated again on 2026-07-29 after implementing the verification and claim state machine, public/claimant/current-owner/administrator APIs, purpose-scoped MFA transfer, cross-domain redirect guard, and default claim/dispute administrator notification, then recording the focused test and production-build evidence. Updated again on 2026-07-29 after completing the web claim wizard and public organization ownership presentation, adding safe email-link authentication handoff, finding and fixing an event-detail ownership hydration gap through a real browser smoke test, and separating the remaining review-response and ranking work into later milestones. Updated again on 2026-07-29 after adding the administrator Claims workspace, bounded resolution controls, protected claimant/current-owner context, and post-commit decision notifications with failure auditing. Updated after the full manual claim and approval run to record and fix the profile-security MFA dead end, claimant-facing decision visibility, request-specific copy, and the canonical public event ownership card. Updated after the final repair pass to record the browser-verified MFA return flow, request-specific manual-review copy, canonical event ownership presentation, responsive checks, and fixture cleanup. Updated after the ownership-default decision changed so all affiliate-imported organizations initialize as unclaimed locally and in the future live backfill, while first-party organizations remain claimed. Updated after the verification-instruction audit to replace developer-centric HTML fragments with a complete copyable tag, add provider-shaped DNS copy controls, and add delegation-ready manager messages for both methods. Updated after organization-profile review to move the claim action into the header management position and remove the redundant full-width callout from that page. Updated after event-card review to temporarily hide unclaimed ownership footers while preserving organization links and positive trust signals.
