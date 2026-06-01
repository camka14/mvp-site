# Blog Article ExecPlan: Indoor Volleyball League

## Goal

Publish "How to Run an Indoor Volleyball League With BracketIQ" as a sport-specific blog article.

## Scope

- Create `src/content/blog/indoor-volleyball-league.mdx`.
- Add assets under `public/blog/indoor-volleyball-league/`.
- Register the article in `src/lib/blog/index.ts` as `contentType: 'blog'`.
- Update roadmap and focused blog/sitemap tests.

## Workflow Evidence

The article uses:

1. A volleyball-related Pexels image for the sport-specific lead visual.
2. BracketIQ league setup details.
3. Weekly schedule setup.
4. Agenda schedule review.
5. Standings review.
6. Notification composer.

## Acceptance Criteria

- The article renders at `/blog/indoor-volleyball-league`.
- The article appears on the main blog list, not the Guides nav.
- Metadata includes created, updated, and author fields.
- The roadmap marks the article as published.
- Focused tests and TypeScript pass.
