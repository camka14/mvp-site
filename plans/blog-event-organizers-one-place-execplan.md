# Blog Guide ExecPlan: Event Organizers in One Place

## Goal

Publish "How Event Organizers Can Run Leagues and Tournaments in One Place" as a BracketIQ organization guide.

## Scope

- Create `src/content/blog/event-organizers-one-place.mdx`.
- Add screenshots under `public/blog/event-organizers-one-place/`.
- Register the guide in `src/lib/blog/index.ts`.
- Update the roadmap and focused blog/guide/sitemap tests.

## Workflow Evidence

The guide uses existing BracketIQ-controlled screens:

1. Organization dashboard as the shared event organizer workspace.
2. Organization event list for leagues, tournaments, and programs.
3. Participant/registration review.
4. Agenda schedule review.
5. Payment readiness.
6. Public organization page preview.

## Acceptance Criteria

- The guide renders at `/guides/event-organizers-one-place`.
- The guide appears under Organizations in a top-down reading order.
- Metadata includes created, updated, and author fields.
- The roadmap marks the article as published.
- Focused tests and TypeScript pass.
