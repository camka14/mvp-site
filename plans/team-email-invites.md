# Team email invites from TeamDetailModal

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must follow the rules in mvp-site/PLANS.md.

## Purpose / Big Picture

Enable team captains to invite people by email directly from the team detail modal. The search field must clearly search name or email, and captains can add multiple invite rows (first/last/email) using the same react-hook-form stack already used in `src/app/events/[id]/schedule/components/EventForm.tsx`. Submitting the form will call a new teams invite endpoint (to be implemented in the backend repo) and the UI will reload pending invites. Users who receive the email will land on the profile page; if not logged in, the app will redirect them through login then back to profile.

## Progress

- [x] (2025-12-11 21:46Z) Plan drafted; implementation planned.
- [x] (2025-12-11 22:10Z) UI implemented with invite form, dynamic rows, email submit wired to backend call; pending validation.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use react-hook-form plus zod validation for invite rows, matching EventForm’s form stack for consistent validation and error UI.
  Rationale: Aligns with existing project patterns and reduces custom validation code.
  Date/Author: 2025-12-11 / Codex

## Outcomes & Retrospective

- To be filled after implementation.

## Context and Orientation

Front-end lives in `mvp-site`. Team modal UI is in `src/components/ui/TeamDetailModal.tsx`. User search uses `src/lib/userService.ts::searchUsers`, currently searching first/last/userName with Appwrite queries. Event forms use react-hook-form + zod; see `src/app/events/[id]/schedule/components/EventForm.tsx` for patterns (Controller components, zodResolver). Bills/profile work already uses Mantine components (TextInput, Paper, SimpleGrid). New invite form should render inside the “Add players” section of the team modal. Pending invites are shown from `pendingPlayers` state in the modal. API calls to invite users will be added later; wire frontend to a forthcoming `teamService.inviteUsersByEmail` that accepts an array of {firstName,lastName,email}.

## Plan of Work

Describe and implement UI changes first, leaving API hook ready: update `TeamDetailModal.tsx` search placeholder to mention email. Introduce a react-hook-form instance scoped to the add-players panel with zod schema requiring email plus optional first/last names; include ability to add/remove invite rows dynamically (start with one row, add via “+” square button below the inputs). Each row contains First name, Last name, Email fields. Render validation errors inline. Add a submit button aligned bottom-right of the invite list; on submit, call a new `teamService.inviteUsersByEmail` (to implement) and refresh pending invites or show notifications. Keep existing search/invite-by-user intact. Update `userService.searchUsers` to include email in Appwrite Query.contains search. Ensure the new form uses the same form library stack from EventForm (react-hook-form + zodResolver).

## Concrete Steps

1) In `src/lib/userService.ts`, extend `searchUsers` query to include `email` in the OR filter.
2) In `src/components/ui/TeamDetailModal.tsx`, adjust search placeholder text to “Search by name or email (min 2 characters)”.
3) Add react-hook-form + zod invite form inside the Add Players section: form state with dynamic invite rows, square “+ Invite” button below the email input to append a new row, per-row First/Last/Email inputs with validation, and a submit button aligned bottom-right. Use Mantine inputs consistent with EventForm styling.
4) Wire submit to call `teamService.inviteUsersByEmail(invites)` (to be created) and show success/error notifications, then refresh pending invites (reuse existing fetch/pending state).
5) Keep the form idempotent: clearing/adding rows should not affect existing search/invite flows.
6) Validate by running `npm run lint` in `mvp-site`, plus manual check: open team modal, add invite rows, ensure validation blocks bad emails, submit triggers service call (can stub if backend not yet wired).

## Validation and Acceptance

Run `npm run lint` from repo root. Manually open the profile/team page, expand Add Players, see updated placeholder, add multiple email rows via the plus button, submit, and observe success notification and pending list refresh (or mocked call). Errors should show for missing/invalid email. Search should return results by email fragment as well as name.

## Idempotence and Recovery

Form allows adding/removing rows without side effects. Submissions are retriable; failed requests show notifications and keep data for retry. Lint/tests can be rerun safely.

## Artifacts and Notes

None yet.

## Interfaces and Dependencies

Use `react-hook-form` with `zodResolver` (already in dependencies). Add `teamService.inviteUsersByEmail(invites: {firstName: string; lastName: string; email: string;}[]) => Promise<void>` in `src/lib/teamService.ts`, implemented later when backend endpoint exists.
