# Blog Guide ExecPlan: Clubs, Players, Parents, Teams, and Events

## Goal

Publish the organization guide "How Clubs Can Manage Players, Parents, Teams, and Events" as a BracketIQ tutorial under the Organizations guide topic.

## Scope

- Create `src/content/blog/club-players-parents-teams.mdx`.
- Add screenshots under `public/blog/club-players-parents-teams/`.
- Register the guide in `src/lib/blog/index.ts`.
- Update roadmap and guide/blog/sitemap tests for the new published guide.

## Workflow Evidence

The guide uses BracketIQ-controlled organization screens already captured from the local app:

1. Teams tab for club team and roster review.
2. Customers tab for players, parents, guardians, and billing context.
3. Events tab for club-hosted programming.
4. Participants review screen for registration follow-up.
5. Staff tab for roles and permissions.
6. Public Page tab for family-facing access and widgets.

## Acceptance Criteria

- The guide renders at `/guides/club-players-parents-teams`.
- The guide appears under Organizations after `manage-sports-club`.
- The article metadata includes created, updated, and author values.
- The roadmap marks the article as published and links relevant dependencies and dependants.
- Focused blog/guide/sitemap tests pass.
