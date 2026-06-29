# Add PostHog Analytics Across Web and Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file. The plan lives in `mvp-site` because `mvp-site` is the web and backend source of truth, but it intentionally covers both `/Users/elesesy/StudioProjects/mvp-site` and `/Users/elesesy/StudioProjects/mvp-app`.

## Purpose / Big Picture

After this change, BracketIQ can measure how people move across the public website, authenticated web app, Android app, and iOS app in one PostHog project. Product questions such as "where do users abandon registration?", "how often do hosts create events?", and "which platform starts checkout?" can be answered from real usage data instead of guesses.

The user-visible proof is that a developer can configure a PostHog project token, run the web app or mobile app, sign in, perform a small tracked action, and see a matching event in PostHog Live Events with the same BracketIQ user id across platforms. Analytics must be disabled automatically when no PostHog token is configured, so local development and CI remain safe.

## Progress

- [x] (2026-06-29 17:43Z) Read `PLANS.md` and created this cross-repo implementation ExecPlan.
- [x] (2026-06-29 17:43Z) Inspected current web root wiring in `src/app/layout.tsx`, `src/app/providers.tsx`, and `package.json`.
- [x] (2026-06-29 17:43Z) Inspected current mobile startup and auth wiring in `composeApp/src/androidMain/kotlin/com/razumly/mvp/MvpApp.kt`, `iosApp/iosApp/iOSApp.swift`, `composeApp/build.gradle.kts`, `gradle/libs.versions.toml`, `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt`.
- [x] (2026-06-29 17:43Z) Checked current PostHog setup guidance for Next.js, Android, and iOS and embedded the necessary implementation details here.
- [x] (2026-06-29 22:41Z) Added web `posthog-js` dependency, guarded `instrumentation-client.ts`, analytics helper, identity bridge, layout wiring, and focused web tests.
- [x] (2026-06-30 00:03Z) Reconciled overlapping mobile edits from another agent without reverting unrelated work; kept the shared analytics facade in `core/repository-impl` to respect module boundaries.
- [x] (2026-06-30 00:03Z) Added Android PostHog dependency, configuration keys, guarded initialization, platform analytics wrapper, identity synchronization, and repository-level event captures.
- [x] (2026-06-30 00:03Z) Added iOS PostHog CocoaPod, `Secrets.plist` keys, guarded Swift initialization, notification-based Kotlin-to-Swift platform bridge, identity synchronization, and repository-level event captures.
- [x] (2026-06-30 00:03Z) Added focused web tests for no-token no-op behavior, identify/reset behavior, and event helper behavior.
- [x] (2026-06-30 00:03Z) Ran Android and iOS Kotlin compile checks plus a native iOS simulator build.
- [x] (2026-06-30 00:08Z) Final web focused analytics tests and TypeScript check passed.
- [ ] Manually verify at least one web event and one mobile event in PostHog Live Events.

Every implementation checkpoint must keep this section current. After each code update, run the smallest relevant test or compile command and record the result here before moving to the next update. Do not leave a known failing test suite as "to fix later" without documenting the failure and the next corrective step.

## Surprises & Discoveries

- Observation: `mvp-site` already loads Google Analytics directly from `src/app/layout.tsx`, while app-wide authenticated state is owned by `src/app/providers.tsx`.
  Evidence: `src/app/layout.tsx` defines `GOOGLE_ANALYTICS_ID` and injects two `next/script` blocks; `src/app/providers.tsx` calls `authService.fetchSession()` and stores `authUser`, `user`, and guest state.

- Observation: `mvp-app` already initializes analytics-adjacent platform services on both native platforms.
  Evidence: Android calls `initializeFirebase()` from `MvpApp.onCreate()`, and iOS calls `FirebaseApp.configure()` from `AppDelegate.application(_:didFinishLaunchingWithOptions:)`.

- Observation: Mobile auth identity is already centralized in `UserRepository.currentUser` and cleared through `clearLoginState()`.
  Evidence: `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` exposes `currentUser: StateFlow<Result<UserData>>`, sets it after login/signup/session bootstrap, and replaces it with a failure when logged out.

- Observation: Current PostHog docs use `posthog-js` for Next.js, `com.posthog:posthog-android:3.+` for Android, and the `PostHog` CocoaPod or Swift package for iOS.
  Evidence: Official docs retrieved on 2026-06-29 show `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `instrumentation-client.ts`, `PostHogAndroidConfig`, and `PostHogConfig(projectToken:host:)`.

- Observation: Focused web analytics tests pass after the initial web implementation.
  Evidence: `npm test -- --runTestsByPath src/lib/analytics/__tests__/posthogClient.test.ts src/components/analytics/__tests__/PostHogIdentity.test.tsx --runInBand` passed 2 suites and 7 tests on 2026-06-29.

- Observation: The mobile analytics facade belongs in `core/repository-impl`, not `composeApp`, because repository success boundaries need to emit analytics events and cannot depend on app-level source sets.
  Evidence: The Android compile failed when repository code referenced analytics files under `composeApp`; moving the facade to `core/repository-impl/src/.../core/analytics` allowed `./gradlew :composeApp:compileDebugKotlinAndroid :composeApp:compileKotlinIosSimulatorArm64` to pass.

- Observation: `local.defaults.properties` must not quote the blank Android PostHog token.
  Evidence: The defaults file briefly had `POSTHOG_PROJECT_TOKEN=""`, which would compile to a non-blank string. The implementation now uses `POSTHOG_PROJECT_TOKEN=` and Android startup also strips accidental surrounding quotes.

- Observation: Native iOS PostHog integration builds through CocoaPods and embeds `PostHog.framework`.
  Evidence: `xcodebuild -workspace iosApp.xcworkspace -scheme iosApp -destination 'platform=iOS Simulator,id=06E496D5-D6CB-4911-A913-AEFBF7133938' build` completed with `** BUILD SUCCEEDED **` on 2026-06-29.

## Decision Log

- Decision: Use one PostHog project for web, Android, and iOS.
  Rationale: BracketIQ needs cross-platform journey analysis. Using separate projects would split the same user across tools and make registration, organization, and checkout funnels harder to understand.
  Date/Author: 2026-06-29 / Codex

- Decision: Treat analytics as configuration-enabled and no-op by default when a token is absent.
  Rationale: Local development, CI, and app builds should not fail or send accidental events. This also lets the code ship before production credentials are available.
  Date/Author: 2026-06-29 / Codex

- Decision: Identify users with the BracketIQ user id and avoid sending personal profile fields in the first implementation.
  Rationale: The user id is enough to connect web and mobile events. Avoiding email, name, date of birth, child details, document data, and payment details keeps the first rollout privacy-conservative.
  Date/Author: 2026-06-29 / Codex

- Decision: Do not enable PostHog session replay in this first implementation.
  Rationale: BracketIQ screens can contain minors, payments, signatures, chat content, and registration details. Replay needs a separate privacy review, masking strategy, policy update, and acceptance pass.
  Date/Author: 2026-06-29 / Codex

- Decision: Use native PostHog SDKs on mobile behind a small shared analytics wrapper.
  Rationale: The Kotlin Multiplatform app needs common screens to capture events without importing Android-only or Swift-only APIs. Native SDKs handle platform queues, offline behavior, and app lifecycle events better than a custom HTTP client.
  Date/Author: 2026-06-29 / Codex

- Decision: Keep the first event taxonomy small and product-led.
  Rationale: A compact list is easier to validate and keeps PostHog useful. Broad autocapture and scattered ad hoc event names would create noisy data before the core funnels are trustworthy.
  Date/Author: 2026-06-29 / Codex

- Decision: Do not run `npx @posthog/wizard` for this implementation.
  Rationale: The repo already has custom Next.js root providers, existing Google Analytics, and a coordinated Kotlin Multiplatform mobile app. Manual setup keeps the generated PostHog pieces scoped and avoids a wizard changing adjacent configuration that must remain under review.
  Date/Author: 2026-06-29 / Codex

- Decision: Use a Swift `NotificationCenter` bridge for iOS capture, identify, and reset calls.
  Rationale: The app already initializes native services in Swift, and the PostHog CocoaPod is easiest to use from `iOSApp.swift`. A tiny notification bridge lets common Kotlin code emit events without binding the shared module directly to Swift-only APIs.
  Date/Author: 2026-06-29 / Codex

## Outcomes & Retrospective

Implementation has landed for the initial cross-platform foundation. Web initializes PostHog through `instrumentation-client.ts`, identifies authenticated users through `PostHogIdentity`, and has focused helper/component tests. Mobile initializes the native SDKs only when token configuration is present, shares a common `AnalyticsTracker` in `core/repository-impl`, identifies/reset users from the app root, and captures a conservative first set of auth, event/team creation, registration, and checkout-start events.

Manual PostHog Live Events verification remains outstanding because no real project token was configured in this checkout during implementation.

Validation completed:

- `npm test -- --runTestsByPath src/lib/analytics/__tests__/posthogClient.test.ts src/components/analytics/__tests__/PostHogIdentity.test.tsx --runInBand` passed 2 suites and 7 tests.
- `npx tsc --noEmit` passed.
- `./gradlew :composeApp:compileDebugKotlinAndroid :composeApp:compileKotlinIosSimulatorArm64` passed.
- `xcodebuild -workspace iosApp.xcworkspace -scheme iosApp -destination 'platform=iOS Simulator,id=06E496D5-D6CB-4911-A913-AEFBF7133938' build` passed.

## Context and Orientation

`mvp-site` is a Next.js App Router web app at `/Users/elesesy/StudioProjects/mvp-site`. The root layout is `src/app/layout.tsx`. The client provider that owns authenticated browser state is `src/app/providers.tsx`. The package manifest is `package.json`. In Next.js App Router, an `instrumentation-client.ts` file at the application root is loaded by the browser before normal client code and is the right place to initialize a browser-only SDK such as PostHog.

`mvp-app` is a Kotlin Multiplatform mobile app at `/Users/elesesy/StudioProjects/mvp-app`. Android startup begins in `composeApp/src/androidMain/kotlin/com/razumly/mvp/MvpApp.kt`. iOS startup begins in `iosApp/iosApp/iOSApp.swift`. Shared Compose UI begins in `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt`. Authenticated user state is exposed by `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`. Dependencies are declared in `gradle/libs.versions.toml`, `composeApp/build.gradle.kts`, and `iosApp/Podfile`.

PostHog is the analytics service. A "project token" is a public identifier used by client SDKs to send events to the correct PostHog project. It is not a server secret, but it should still be configured through environment or app secret files rather than hard-coded. A "distinct id" is PostHog's user identity key. In this plan, the distinct id is the BracketIQ user id, for example the same id stored on `authUser.$id` in web and `UserData.id` in mobile. A "no-op" analytics implementation means functions such as `capture`, `identify`, and `reset` return without doing anything when PostHog is not configured.

The first implementation must not track raw form answers, dates of birth, child names, uploaded document data, chat message text, signatures, full payment details, Stripe account data, or email/name profile fields. Event properties should use ids, booleans, coarse categories, platform names, and counts. For example, `event_type: "LEAGUE"` is acceptable; `guardian_email: "..."` is not.

## Plan of Work

Begin with `mvp-site`. Add `posthog-js` to `package.json` and `package-lock.json` by running `npm install --save posthog-js` from `/Users/elesesy/StudioProjects/mvp-site`. Add `.env.local` keys for local development and configure equivalent production values in the production host:

    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_replace_with_project_token
    NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

Use `https://eu.i.posthog.com` instead if the PostHog project is created in the EU region. The host value must match the PostHog project region.

Create `instrumentation-client.ts` at `/Users/elesesy/StudioProjects/mvp-site/instrumentation-client.ts`. It should import `posthog` from `posthog-js`, read `process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, and only call `posthog.init()` if the token is non-empty. Use `api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'` and `defaults: '2026-05-30'`, matching current PostHog Next.js guidance. Set `capture_pageview` deliberately. If default pageview capture is retained, document that in the decision log after implementation; if manual pageview capture is needed, add a route-change tracker and tests.

Create a web analytics helper at `src/lib/analytics/posthogClient.ts`. This file should be a client-only module that exports `isPostHogEnabled()`, `capture(eventName, properties)`, `identifyUser(userId, properties)`, and `resetAnalytics()`. The helper must guard against missing tokens and browser-less execution. `capture` should only accept event names from a small constant list or helper functions so event names do not drift. Use the object-verb format, for example `user signed up`, `user logged in`, `organization created`, `event created`, `event registration started`, `event registration completed`, `team created`, `checkout started`, and `payment completed`.

Create a web identity bridge at `src/components/analytics/PostHogIdentity.tsx`. It should be a client component that calls `useApp()` from `src/app/providers.tsx`. When `loading` is false and `authUser?.$id` is present, it should call `identifyUser(authUser.$id, { platform: 'web', is_admin: authUser.isAdmin === true, email_verified: authUser.emailVerified === true || Boolean(authUser.emailVerifiedAt) })`. Do not send email or display name in the first implementation. When the session changes to guest or unauthenticated, call `resetAnalytics()` once for that transition. Add this component inside the existing `<Providers>` subtree in `src/app/layout.tsx`, near `ProfileCompletionGate`, so it can read provider state without changing page components.

Wire the first web custom events from existing success boundaries. Use focused, low-risk insertion points rather than broad autocapture. Good first web locations are the auth service methods in `src/lib/auth.ts` after successful login/register responses, organization creation completion in `src/app/organizations/[id]/page.tsx` or the service it uses if there is a cleaner success boundary, event creation completion in `src/app/events/[id]/schedule/schedulePage/useCreateEventFlow.ts`, team creation completion in the team creation modal/service, and checkout success boundaries where payment state is already resolved. If a success boundary is hard to identify without broad edits, skip that event for the first milestone and record it in `Outcomes & Retrospective`.

Add web tests. Unit test the helper no-op behavior by mocking `posthog-js` and temporarily clearing `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. Component-test `PostHogIdentity` by mocking `useApp()` state or rendering under a minimal provider if easier. The key assertions are that identify is called once for a stable user id, not called when analytics is disabled, and reset is called when the state transitions from authenticated to unauthenticated. Existing provider tests live in `src/app/__tests__/providers.test.tsx` and can guide local mocking style.

Next implement Android. In `/Users/elesesy/StudioProjects/mvp-app/gradle/libs.versions.toml`, add a version entry for PostHog Android and a library alias. Prefer pinning a concrete version instead of using `3.+`; use the newest stable v3 shown by dependency resolution at implementation time. If starting from the docs snapshot in this plan, `3.46.0` was observed as current. The resulting entries should look like:

    [versions]
    posthogAndroid = "3.46.0"

    [libraries]
    posthog-android = { module = "com.posthog:posthog-android", version.ref = "posthogAndroid" }

In `composeApp/build.gradle.kts`, add `implementation(libs.posthog.android)` to the `androidMain` dependencies. Add configuration keys to `/Users/elesesy/StudioProjects/mvp-app/local.defaults.properties`:

    POSTHOG_PROJECT_TOKEN=
    POSTHOG_HOST=https://us.i.posthog.com

Add the real `POSTHOG_PROJECT_TOKEN` to `secrets.properties` locally or to the release build secret source. Do not commit the real token if this repo treats `secrets.properties` as local-only.

Update `composeApp/src/androidMain/kotlin/com/razumly/mvp/MvpApp.kt` to initialize PostHog after `configurePlatform(...)` and before Koin initialization. Read `BuildConfig.POSTHOG_PROJECT_TOKEN` and `BuildConfig.POSTHOG_HOST`, trim them, and return without setup if the token is blank. When configured, create `PostHogAndroidConfig(apiKey = token, host = host.ifBlank { 'https://us.i.posthog.com' })` and call `PostHogAndroid.setup(this, config)`. Keep the initialization tolerant: log a Napier warning if setup fails, but do not crash app startup.

Then add a common mobile analytics facade in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/analytics/AnalyticsTracker.kt`. Define small functions such as `capture(event: AnalyticsEvent, properties: Map<String, Any?> = emptyMap())`, `identify(userId: String, properties: Map<String, Any?> = emptyMap())`, and `reset()`. Keep event names in one sealed class or enum-like object. If `Any?` causes serialization or platform bridge friction, use `Map<String, String>` for the first implementation and convert booleans/counts to strings. The facade should be common code, while the actual SDK calls should live in platform-specific files under `composeApp/src/androidMain/...` and `composeApp/src/iosMain/...`.

Implement the Android actual wrapper in `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/analytics/PlatformAnalytics.android.kt`. It should call `PostHog.capture(...)`, `PostHog.identify(...)`, and `PostHog.reset()` or the equivalent v3 API names. Guard all calls with `runCatching` and log failures through Napier. Analytics failures must not break user flows.

For iOS, add the PostHog CocoaPod to `/Users/elesesy/StudioProjects/mvp-app/iosApp/Podfile` because this app already uses CocoaPods:

    pod "PostHog", "~> 3.59.3"

Run `pod install` from `/Users/elesesy/StudioProjects/mvp-app/iosApp` after editing the Podfile. Add `posthogProjectToken` and `posthogHost` keys to `iosApp/iosApp/Secrets.plist`. For local templates or sample secrets, use an empty token and `https://us.i.posthog.com`. Do not add a real token to a committed file if this repo treats `Secrets.plist` as sensitive; if the file is already committed for local development, record the decision before adding any real value.

Update `core/network/src/iosMain/kotlin/com/razumly/mvp/core/util/AppSecrets.kt` to expose `posthogProjectToken` and `posthogHost` using the existing `getStringResource(...)` helper. Update `iosApp/iosApp/iOSApp.swift` to import `PostHog`, read the same `Secrets.plist` values in the AppDelegate, and call `PostHogSDK.shared.setup(PostHogConfig(projectToken: token, host: host))` only when the token is non-empty. As on Android, setup failure should not crash the app.

Implement the iOS actual wrapper in `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/analytics/PlatformAnalytics.ios.kt`. If the Kotlin/Native interop generated by CocoaPods exposes the PostHog API cleanly to Kotlin, call it there. If the Swift API is not ergonomic from Kotlin, create a tiny Swift bridge class in `iosApp/iosApp`, expose simple `capture`, `identify`, and `reset` methods to the shared framework if feasible, and record the exact bridge choice in the decision log. The goal is that common Compose screens call one common analytics facade and do not care which native SDK is underneath.

Synchronize mobile identity from app root state. Prefer adding an `AnalyticsIdentityEffect` near the top of `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt`, because `App` already observes root application state and is present for both Android and iOS. If `RootComponent` does not expose `currentUser`, add a read-only `currentUser: StateFlow<Result<UserData>>` property to `RootComponent`, backed by `userRepository.currentUser`. The effect should identify when a non-blank `UserData.id` appears and reset once when it disappears. Use properties such as `platform`, `app_version`, and `build_type` if available from `Platform`; do not send profile names, email, date of birth, or child data.

Add mobile custom events at success boundaries after identity works. Good first locations are successful login/signup methods in `UserRepository`, event creation completion in `DefaultCreateEventComponent`, team creation completion in `DefaultTeamManagementComponent`, event registration completion in the event detail registration coordinator, and checkout success in billing/payment result handling. Keep the first pass conservative and do not add events inside every button handler.

## Concrete Steps

Before implementation, check both working trees and preserve unrelated user work:

    cd /Users/elesesy/StudioProjects/mvp-site
    git status --short

    cd /Users/elesesy/StudioProjects/mvp-app
    git status --short

For web dependency and implementation:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm install --save posthog-js
    npm test -- --runTestsByPath src/app/__tests__/providers.test.tsx --runInBand
    npx tsc --noEmit

Expected outcome: package files update with `posthog-js`, focused tests pass, and TypeScript exits with code 0. If unrelated existing TypeScript failures appear, record the exact failures in `Surprises & Discoveries` and run narrower checks for the files changed by this plan.

For Android dependency and implementation:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:testDebugUnitTest --tests '*UserRepositoryAuthTest*'

Expected outcome: Android Kotlin compilation succeeds. The focused auth test suite should pass after analytics no-op behavior is covered. If the exact test filter does not match on this machine, run the closest existing `UserRepositoryAuthTest` or the new analytics test class directly and record the command used.

For iOS dependency and implementation:

    cd /Users/elesesy/StudioProjects/mvp-app/iosApp
    pod install

Then build the iOS app from Xcode or with the repo's existing iOS build command if one is available. On macOS, prefer an Xcode or xcodebuild simulator build that compiles the `iosApp` target. Record the exact command and result in `Progress`.

For local runtime verification on web:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm run dev:plain

Open `http://localhost:3000`, sign in with a non-production test account, perform a tracked action, and check PostHog Live Events. If using a local project token, the event should show `distinct_id` equal to the BracketIQ user id and include `platform: web`.

For mobile runtime verification, run Android debug from Android Studio or Gradle install, then run iOS from Xcode. Sign in with the same test account on each platform and perform one tracked action. In PostHog Live Events, verify that Android and iOS events use the same BracketIQ user id as web and include the correct platform property.

## Validation and Acceptance

The implementation is accepted only when all of the following are true.

Web analytics initializes only when `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is set. With the token missing, the app renders without console errors and analytics helper calls do nothing. With the token set, PostHog receives at least one browser event in Live Events.

Web identity uses `authUser.$id` as the PostHog distinct id. Signing in identifies the user once for a stable session, and signing out or entering guest state resets analytics state. Email, full name, date of birth, child details, chat text, document data, and payment details are not sent.

Android analytics initializes only when `POSTHOG_PROJECT_TOKEN` is set. With an empty token in `local.defaults.properties`, debug builds compile and run without trying to send events. With a real token in the local secret source, Android sends at least one event with `platform: android` and the same BracketIQ user id used by web.

iOS analytics initializes only when `posthogProjectToken` is set. With an empty token, simulator builds and launches without analytics errors. With a real token, iOS sends at least one event with `platform: ios` and the same BracketIQ user id used by web.

The first event taxonomy is centralized and documented in code. Events should use stable names such as `user signed up`, `user logged in`, `organization created`, `event created`, `event registration started`, `event registration completed`, `team created`, `checkout started`, and `payment completed`. If any event is deferred because the success boundary is not clear, record that in `Outcomes & Retrospective`.

Run and record these checks before marking the plan complete:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand
    npx tsc --noEmit

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:testDebugUnitTest

    cd /Users/elesesy/StudioProjects/mvp-app/iosApp
    pod install

If full suites are too slow or fail for unrelated checked-in reasons, do not ignore that fact. Record the full-suite failure, then run focused tests for every changed area and explain why the remaining failure is unrelated.

## Idempotence and Recovery

All code changes are additive and safe to retry. Running `npm install --save posthog-js` repeatedly should leave the same package state. Running `pod install` repeatedly should update CocoaPods deterministically. Analytics setup must tolerate blank tokens and missing optional configuration.

If PostHog causes a runtime issue, disable it by removing or blanking the token: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` for web, `POSTHOG_PROJECT_TOKEN` for Android, and `posthogProjectToken` for iOS. The app should continue to work with analytics disabled.

If a dependency upgrade fails, revert only the dependency and analytics files introduced by this plan. Do not revert unrelated dirty files in either repo. Before staging or committing, inspect `git status --short` and stage only the paths changed for PostHog.

## Artifacts and Notes

Official setup details embedded in this plan were checked on 2026-06-29:

- Next.js uses `npm install --save posthog-js`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, and `instrumentation-client.ts`.
- Android uses `com.posthog:posthog-android:3.+` in docs, with `PostHogAndroidConfig(apiKey, host)` and initialization in the `Application` subclass.
- iOS uses `pod "PostHog", "~> 3.59.3"` or Swift Package Manager, with `PostHogConfig(projectToken:host:)` and `PostHogSDK.shared.setup(config)`.

Record implementation evidence here as work proceeds. Useful evidence includes short test transcripts, PostHog Live Events screenshots or event ids, and the exact Android/iOS build commands that passed.

## Interfaces and Dependencies

At completion, `mvp-site` should expose these web analytics interfaces:

    src/lib/analytics/posthogClient.ts
      isPostHogEnabled(): boolean
      capture(eventName: AnalyticsEventName, properties?: AnalyticsProperties): void
      identifyUser(userId: string, properties?: AnalyticsProperties): void
      resetAnalytics(): void

    src/components/analytics/PostHogIdentity.tsx
      default export PostHogIdentity(): JSX.Element | null

`AnalyticsEventName` should be a union type or constant-derived type, not arbitrary free-form strings spread across the app.

At completion, `mvp-app` should expose these common analytics interfaces:

    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/analytics/AnalyticsTracker.kt
      object AnalyticsTracker
      fun capture(event: AnalyticsEvent, properties: Map<String, Any?> = emptyMap())
      fun identify(userId: String, properties: Map<String, Any?> = emptyMap())
      fun reset()

    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/analytics/AnalyticsEvent.kt
      sealed class or enum-like event definitions for the first taxonomy

    composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt
      an identity effect that observes the current authenticated user and calls the tracker

Platform implementations should live under:

    composeApp/src/androidMain/kotlin/com/razumly/mvp/core/analytics/
    composeApp/src/iosMain/kotlin/com/razumly/mvp/core/analytics/

The Android implementation depends on `com.posthog:posthog-android`. The iOS implementation depends on the `PostHog` CocoaPod because the app already uses CocoaPods for iOS dependencies.

Revision note (2026-06-29): Created the initial implementation plan after inspecting current web and mobile startup/auth wiring and current PostHog setup guidance. The plan intentionally starts with conservative analytics, no session replay, one project across platforms, and test-after-each-update discipline.
