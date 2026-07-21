# Protect Affiliate Destinations Behind BracketIQ Outbound Links

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current as implementation proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Public BracketIQ pages and APIs currently return third-party affiliate registration or booking URLs. A scraper can collect those destinations without using the BracketIQ detail page, even though BracketIQ's LLM instructions say that affiliate destinations must not be shared directly. After this work, public event, team, and affiliate-facility records expose only a signed `https://bracket-iq.com/out/...` URL. Opening that URL first loads a small BracketIQ interstitial. Only a browser that completes a same-origin, short-lived POST may receive the external redirect. Known crawlers and automation clients are denied, and Redis-backed limits cap requests by client and target.

The observable result is that Discover and public organization CTAs still open the organizer's destination for a normal browser, while raw affiliate URLs no longer appear in public JSON or public page markup. Directly inventing an outbound URL, replaying a stale challenge, using a known crawler user agent, or rapidly walking many outbound URLs fails without disclosing the destination.

## Progress

- [x] (2026-07-21) Audited current event, team, facility, organization-catalog, embed, Markdown, rate-limit, robots, Caddy, and mobile affiliate-link paths.
- [x] (2026-07-21) Confirmed Caddy is the public edge and overwrites untrusted incoming `X-Forwarded-*` values, so the existing request identity receives a trustworthy client IP in the current topology.
- [x] (2026-07-21) Chose a signed stateless BracketIQ path and same-origin interstitial instead of adding a token table or database migration.
- [x] (2026-07-21 09:25 PDT) Implemented signing, public-response projection, target resolution, crawler screening, browser proof, and layered rate limits.
- [x] (2026-07-21 09:40 PDT) Replaced public event, team, affiliate-facility, and public rental-selection destinations with protected BracketIQ URLs while preserving raw URLs for authorized management responses.
- [x] (2026-07-21 10:05 PDT) Added regression coverage; 16 focused suites and 144 tests pass, `npx tsc --noEmit` passes, and the production build succeeds.
- [ ] Render a live production smoke test proving that the interstitial contains no destination and a valid browser flow receives only the final HTTP redirect.
- [ ] Commit the scoped implementation, push `main`, verify the VPS deployment, and record the outcome.

## Surprises & Discoveries

- Observation: The LLM Markdown layer already removes external affiliate URLs and states the correct Terms of Service rule, but the underlying public JSON still contains `affiliateUrl` and, for events, `sourceUrl`.
  Evidence: `src/lib/llms.ts` and `src/server/llmsPage.ts` are affiliate-safe, while the event search and public organization catalog serialize raw Prisma rows.

- Observation: Affiliate destinations exist on three independently rendered public products: events, canonical teams, and facilities used as affiliate rentals.
  Evidence: Direct `window.open` or anchor usage exists in event detail, Discover teams, Discover rentals, organization pages, and embeds.

- Observation: The mobile app already opens `affiliateUrl` in an in-app browser. Returning an absolute signed BracketIQ URL from the server therefore extends the same protection to mobile without a mobile schema change.
  Evidence: `DefaultEventDetailComponent.kt` and `EventSearchScreen.kt` call their platform URL handlers with `affiliateUrl`.

- Observation: The current VPS Caddy deployment is the first public proxy. Caddy's documented default is to ignore incoming `X-Forwarded-*` values and set them itself, which prevents a client from choosing the IP used by the application rate limiter in this topology.
  Evidence: `deploy/vm/Caddyfile` has a direct `reverse_proxy app:8080`, and Caddy's official reverse-proxy documentation describes this default.

- Observation: The local production build requires outbound network access because the existing root layout uses three Google-hosted `next/font` families.
  Evidence: A sandboxed build failed on `fonts.googleapis.com`; the same `npm run build` completed successfully when run with network access.

- Observation: The repository-wide Jest run exposed one stale hosted-by-link expectation from this feature and six unrelated pre-existing failing suites in event sanitization, template privacy, billing/refunds, and facility reservation UI behavior.
  Evidence: After correcting the hosted-by expectation, all 16 protection-focused suites pass with 144 tests. The unrelated failures are outside the files and behavior changed by this plan.

## Decision Log

- Decision: Generate signed URLs from target kind and database ID using HMAC with `AFFILIATE_REDIRECT_SECRET`, falling back to the existing required `AUTH_SECRET` with domain separation.
  Rationale: A signature makes URLs unforgeable, does not expose the destination, works for existing rows immediately, avoids a migration/backfill, and remains compatible with web and mobile clients. A dedicated secret can be rotated independently later without being required for this deployment.
  Date/Author: 2026-07-21 / Codex

- Decision: Use an HTML interstitial followed by a same-origin POST carrying a short-lived HMAC proof and matching HttpOnly cookie, then return an HTTP 303 to the external destination.
  Rationale: A plain public 302 would let a basic scraper collect every destination. The interstitial removes the destination from markup and JSON, requires browser behavior, allows replay and same-origin checks, and still gives JavaScript-disabled users an explicit Continue button.
  Date/Author: 2026-07-21 / Codex

- Decision: Apply crawler/user-agent screening, GET and POST rate limits, per-client/target limits, `noindex, nofollow`, `no-store`, and `no-referrer` together.
  Rationale: No single application-layer signal proves a human visitor. Layering signed paths, a browser proof, rate limits, crawler policy, and leak-minimizing headers raises scraping cost while keeping the human flow lightweight.
  Date/Author: 2026-07-21 / Codex

- Decision: Do not require Cloudflare Turnstile in this iteration.
  Rationale: Turnstile can run without Cloudflare proxy hosting and is a useful escalation layer, but it requires user-managed site and secret keys plus server-side Siteverify. The current first-party controls can ship without a new external dependency; suspicious-traffic challenges can be added later if observed abuse warrants the extra friction.
  Date/Author: 2026-07-21 / Codex

## Outcomes & Retrospective

The implementation is locally complete. Public API and catalog responses now contain signed BracketIQ `/out/{kind}/{id}/{signature}` URLs instead of raw affiliate destinations; event ingestion provenance is removed from public projections; and authorized management responses retain raw destinations for editing. The outbound endpoint serves a destination-free interstitial, requires a cookie-bound short-lived same-origin POST, applies Redis-backed client and target rate limits, blocks declared crawlers and common automation user agents, and returns the external URL only as the final 303 response. Public Markdown and `robots.txt` treat `/out/` as non-content, non-shareable space. Web and mobile clients continue to consume the existing `affiliateUrl` field, so no mobile schema change or database migration is required.

Validation completed locally: 16 focused suites with 144 tests pass, `npx tsc --noEmit` passes, and `npm run build` completes successfully. A repository-wide run reached 581 passing suites before one protection-related stale expectation was corrected; six unrelated suites remain failing in the existing checkout. Commit, push, deployment, and live smoke verification remain to be recorded.

## Context and Orientation

Affiliate source URLs remain authoritative server-side fields on `Events.affiliateUrl`, `CanonicalTeams.affiliateUrl`, and `Facilities.affiliateUrl` in `prisma/schema.prisma`. `Events.sourceUrl` is ingestion provenance and must also be removed from public event responses because it can reveal the same third-party page.

The public event lists are returned by `src/app/api/events/route.ts` and `src/app/api/events/search/route.ts`; individual event detail is returned by `src/app/api/events/[eventId]/route.ts`. Teams are returned by `src/app/api/teams/route.ts`, `src/app/api/teams/[id]/route.ts`, and `src/server/publicOrganizationCatalog.ts`. Affiliate rental facilities are included by `src/app/api/organizations/route.ts` and facility routes. Public organization pages and embeds consume the shared catalog.

The existing `src/server/rateLimit.ts` supports Redis in production and an in-process fallback in development/test. `deploy/vm/compose.production.yml` already runs Redis and passes `REDIS_URL` to the app. The new endpoint should use this existing service rather than adding infrastructure.

An “outbound target” means the server-side tuple of a kind (`event`, `team`, or `facility`) and its database ID. A “public projection” means a response object in which a raw affiliate destination has been replaced by a signed BracketIQ outbound URL and event ingestion provenance has been omitted. A “browser proof” means a short-lived signed value tied to the outbound target and an HttpOnly cookie created by the interstitial GET.

## Plan of Work

Create `src/server/affiliateOutbound.ts` as the single server-only boundary. It will validate target kinds and IDs, sign and verify stable outbound paths, project raw rows into safe public rows, classify clearly automated user agents, issue and validate browser proofs, and resolve a verified target to a currently active external destination. It must normalize all destinations through the existing external-HTTP URL validator.

Add `src/app/out/[kind]/[id]/[signature]/route.ts`. GET validates the signed path, blocks known automation, applies both client-wide and client-plus-target limits, and returns a minimal same-origin HTML interstitial without the destination. The response sets an HttpOnly, SameSite=Lax, short-lived cookie and security headers. A small static script auto-submits the POST after the page loads; the visible Continue button remains the non-JavaScript fallback. POST validates method context, cookie, proof age and signature, crawler status, and stricter rate limits before resolving the URL and returning a 303. Errors never include the destination.

Update public serializers so only authorized event/team/facility managers receive raw affiliate fields. Anonymous or non-manager responses receive the signed absolute BracketIQ URL and no event `sourceUrl`. Shared organization-catalog rows always use the protected URL because the catalog is public. Adjust client-side helpers to recognize BracketIQ outbound URLs as affiliate actions and stop using an affiliate destination as an organization “Hosted by” link.

Disallow `/out/` in `src/app/robots.ts`. Keep the LLM rule that only event or organization detail pages may be shared, and ensure the Markdown renderer never treats a now-first-party `/out/` URL as shareable content.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Add the outbound server module, route, static auto-submit script, policies, and focused tests.
2. Add public projection calls at event search/list/detail, team list/detail/catalog, organization affiliate-facility, and facility list/detail response boundaries.
3. Update the small set of web renderers that currently accept only absolute third-party URLs.
4. Run focused Jest suites one at a time, then `npx tsc --noEmit`, then a production build or the repository's production-oriented verification command.
5. Start the app against safe local/test data and verify the HTML and POST contract with HTTP requests. If a live affiliate event is available after deployment, verify only one normal browser traversal and avoid logging the external destination.
6. Inspect the final diff and staged diff, commit only the protection plan and implementation, push the HTTPS `main` remote, and verify the VPS deployment health endpoint and one non-destructive public response.

## Validation and Acceptance

Unit tests must prove that signatures cannot be forged, altered target IDs fail, browser proofs expire and are cookie-bound, crawler identification covers declared LLM/search clients, and public projections never retain raw affiliate or event source URLs.

Route tests must prove that GET HTML contains the BracketIQ action but not the external URL; missing/invalid signatures return 404; known crawler user agents return 403; missing, cross-site, expired, or mismatched POST proof returns 403; valid POST returns 303 with the correct external `Location`; inactive/missing targets return 404; and repeated requests return 429 under enabled test limits.

Public API/catalog tests must assert signed `https://bracket-iq.com/out/...` values instead of partner domains for anonymous output and raw values only for a verified manager where editing requires them. LLM tests must assert that `/out/` links are not emitted as user-shareable links.

The implementation is accepted when repository tests and type checking pass, no raw affiliate destination appears in sampled public JSON or interstitial HTML, normal web/mobile browser navigation can reach the external site through the BracketIQ flow, and production health remains ready after deployment.

## Idempotence and Recovery

The URL is stateless and deterministic for a given secret, target kind, and ID. Re-running deployment requires no data backfill. Rotating `AFFILIATE_REDIRECT_SECRET` intentionally invalidates old public outbound URLs; clients receive fresh URLs the next time they load BracketIQ data. If the dedicated secret is absent, the existing `AUTH_SECRET` keeps the route operational.

If the redirect route causes a production issue, the code can be rolled back without changing persisted affiliate data. Redis counters expire automatically. No command in this plan deletes or rewrites affiliate destinations.

## Artifacts and Notes

Current leak examples discovered during the audit:

    src/app/api/events/search/route.ts -> raw event Prisma rows are serialized
    src/app/discover/components/eventDetail/EventJoinCard.tsx -> raw affiliateActionUrl anchor
    src/app/api/organizations/route.ts -> raw affiliate Facilities rows
    src/server/publicOrganizationCatalog.ts -> raw canonical-team affiliateUrl and registrationUrl
    src/app/discover/page.tsx -> direct window.open for team and facility affiliate URLs

Official platform guidance used for the design:

- Caddy documents that its reverse proxy ignores incoming `X-Forwarded-*` values by default and sets them itself, protecting the current IP-rate-limit identity from direct client spoofing.
- Cloudflare documents that Turnstile may be used independently of Cloudflare proxy hosting, but tokens must be validated server-side, expire after five minutes, and are single-use. This remains a possible later risk-based challenge layer rather than a dependency of this release.

## Interfaces and Dependencies

`src/server/affiliateOutbound.ts` should expose stable interfaces equivalent to:

    type AffiliateOutboundKind = 'event' | 'team' | 'facility';

    buildAffiliateOutboundUrl(kind: AffiliateOutboundKind, id: string): string
    verifyAffiliateOutboundSignature(kind: AffiliateOutboundKind, id: string, signature: string): boolean
    protectAffiliateRow<T extends Record<string, unknown>>(row: T, kind: AffiliateOutboundKind): T
    createAffiliateBrowserProof(target, browserSessionId, issuedAtMs?): string
    verifyAffiliateBrowserProof(proof, target, browserSessionId, nowMs?): boolean
    isBlockedAffiliateUserAgent(userAgent: string | null): boolean
    resolveAffiliateDestination(kind: AffiliateOutboundKind, id: string): Promise<string | null>

The implementation depends only on Node `crypto`, the existing Prisma client, `src/lib/externalUrl.ts`, `src/lib/siteUrl.ts`, `src/server/rateLimit.ts`, and Next.js route primitives. It adds no package dependency and no database migration.

Revision note (2026-07-21): Created the dedicated ExecPlan after auditing the current public leak paths, VPS proxy topology, Redis rate limiter, LLM safety layer, and mobile URL-opening behavior.

Revision note (2026-07-21 10:08 PDT): Updated the plan after implementation and local validation, including the public rental-selection projection discovered during final leak-path review and the unrelated full-suite baseline failures.
