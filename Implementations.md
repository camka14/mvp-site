# Testing Implementation Plan

This document outlines the end-to-end plan for introducing comprehensive Jest test coverage across the MVP-site codebase. It breaks coverage into logical areas, identifies the test categories, highlights the required mocks, and lists the incremental steps to deliver reliable suites.

## 1. Foundational Setup

### 1.1 Jest Infrastructure

- [x] Add `jest.config.ts` using `ts-jest` preset and path aliases (`@/*`).
- [x] Create `test/setupTests.ts` to configure globals:
  - `@testing-library/jest-dom/extend-expect`
  - `jest.spyOn(console, 'error')` suppression helpers (reset in `afterEach`).
- [x] Update `package.json` scripts:
  - `"test": "jest"`
  - `"test:watch": "jest --watch"`
  - `"test:ci": "jest --runInBand --coverage"`
- [x] Ensure `tsconfig.json` includes `"types": ["jest"]` in `compilerOptions` for tests.

### 1.2 Shared Utilities & Mocks

- [x] Create `test/mocks/appwrite.ts` to mock Appwrite client interactions (TablesDB, Storage, Functions, Account). Provide helper factories to control return payloads.
- [x] Create `test/factories.ts` with builders such as `buildUser`, `buildTeam`, `buildEvent`, `buildTimeSlot`. Each returns typed data with sensible defaults and accepts overrides.
- [x] Add `test/utils/renderWithMantine.tsx` to wrap components in Mantine providers during render tests.

## 2. Service Layer Tests (unit)

### 2.1 `src/lib/eventService.ts`

- [x] Mock `databases.getRow`, `databases.listRows`, and verify:
  - `getEventWithRelations` normalizes `timeSlots` minutes + relationships.
  - `createEvent` transforms coordinates and handles arrays.
  - `updateEvent` merges payloads with computed coordinates.
  - `addToWaitlist` / `removeFreeAgent` mutate arrays immutably.
- Mocks: use `jest.mock('@/app/appwrite')` and supply behaviour via factories.

### 2.2 `src/lib/leagueService.ts`

- [x] Validate minutes normalization in `createWeeklySchedules` and `checkConflictsForSlot`.
- [x] Ensure `generateSchedule` handles function responses + error propagation.
- [ ] Confirm relationship creation payloads for nested `weeklySchedules`. *(Pending: add coverage for `createLeagueDraft` relationship payloads.)*
- Mocks: `databases` + `functions.createExecution`; plug conflict scenarios with fabricated slots.

### 2.3 `src/lib/teamService.ts`

- [x] Cover `getTeamWithRelations`, `createTeam`, and invitation flows, ensuring correct Appwrite mutations. *(Follow-up: addPlayer/removePlayer tests still outstanding.)*
- [ ] Exercise `listTeamsForUser` filters by `Query.contains`.
- Mocks: Appwrite TablesDB; use factories for teams/users.

### 2.4 Other services (`userService`, `paymentService`, `fieldService`, `chatService`, `auth`)

- [x] Add payment and field service coverage to assert Appwrite payloads. *(Pending services: userService, chatService, auth helpers.)*
- [ ] Add Stripe function mock to confirm `paymentService.createHostAccount` etc. handle function execution results.

## 3. UI Component Tests

### 3.1 Mantine Forms

- [ ] `EventCreationModal`
  - Use React Testing Library with `renderWithMantine`.
  - Mock service calls (`eventService`, `leagueService`, `paymentService`).
  - Validate timezone defaults, slot validation (minutes comparison), submission payload assembly.
- [x] `LeagueFields`
  - Already covered example: ensure `onUpdateSlot` receives minutes; add conflict badge rendering test.
- [ ] `EventCreationModal` league preview flow
  - Mock `leagueService.createLeagueDraft` + `generateSchedule` to ensure UI handles success + error states.

### 3.2 Teams Components

- [ ] `InvitePlayersModal`
  - Mock `teamService.listPlayers`, ensure search + invite actions trigger service calls.
- [ ] `TeamDetailModal`
  - Assert actions call appropriate service functions with selected players/invites.

### 3.3 Shared UI (`UserCard`, `TeamCard`, `RefundSection`)

- [x] Add `RefundSection` coverage for refund flows. *(Pending: additional shared UI like cards/badges.)*
- [ ] Ensure buttons trigger callbacks and empty states render correctly across remaining shared UI components.

## 4. Hooks & Context

- [x] `useLocation` hook — mock `navigator.geolocation` to return coordinates/failures.
- [ ] Chat contexts (`ChatContext`, `ChatUIContext`) — provide fake `Appwrite` real-time events and ensure state updates.

## 5. App Router Pages (integration-style)

- [ ] Use Next.js `app` router testing strategy with `@testing-library/react` on key pages:
  - [ ] `/events` list page: mock `eventService.getAllEvents` and assert filters/pagination.
  - [x] `/events/[id]/schedule`: ensure timeslots map to fields; mock `leagueService` for delete.
  - [ ] `/teams` page: simulate invites acceptance/decline with service mocks.
- Use `jest.mock('next/navigation')` for router interactions.

## 6. Data Validation & Utilities

- [ ] Cover utility functions in `src/types/index.ts` (e.g., `getUserFullName`, `getTeamWinRate`).
- [ ] Add tests for helper functions in `eventService` (time conversions) and `leagueService` (overlap detection + normalization).

## 7. Continuous Integration

- [ ] Configure GitHub Actions (or alternative CI) to run: lint → type check → Jest tests with coverage thresholds (e.g., `--coverage --coverageThreshold '{"global":{"branches":70,"functions":75,"lines":80,"statements":80}}'`).
- [ ] Cache `node_modules` and Next.js builds for faster pipelines.

## 8. Rollout Strategy

1. Scaffold foundational setup (Section 1) in a dedicated PR.
2. Add factories + Appwrite mocks (Section 1.2).
3. Incrementally deliver service layer tests (Section 2) module by module.
4. Follow with UI components and hooks (Sections 3 & 4).
5. Add page-level integration tests once service mocks are stable (Section 5).
6. Finalize utilities, CI integration, and coverage thresholds (Sections 6 & 7).
7. Track progress via checklist in this document, updating as suites are merged.

## Mocking Guidelines

- Always reset mocks with `afterEach(() => jest.clearAllMocks())`.
- Prefer `jest.spyOn` over overwriting implementations directly, to retain call history.
- For Appwrite, provide typed mock classes to avoid `any` leakage and ensure tests fail on unexpected method usage.
- Use `MockDate` or `jest.useFakeTimers()` when time-sensitive logic is under test.

## Deliverables

- Comprehensive Jest coverage across services, components, hooks, and utilities.
- Stable mock layer for Appwrite and external APIs (Stripe).
- CI pipeline enforcing type checks, linting, and Jest suites with coverage gates.
- Documentation updates (AGENTS.md) reflecting testing practices — already added.
