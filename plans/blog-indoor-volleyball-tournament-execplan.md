# Indoor Volleyball Tournament Blog ExecPlan

## Objective

Publish a sport-specific blog article for running an indoor volleyball tournament with pool play in BracketIQ.

## Scope

- Add a `/blog/indoor-volleyball-tournament` article.
- Reuse the existing indoor volleyball image and current BracketIQ tournament screenshots.
- Keep the article focused on volleyball logistics while linking to the relevant BracketIQ guides for full setup workflows.
- Register the post in the blog index and sitemap coverage.
- Update the living roadmap entry.

## Workflow Notes

1. Plan the tournament flow around court time, pool play, work teams, standings, and bracket advancement.
2. Use existing BracketIQ screenshots that already show registration, pool play, Agenda score entry, standings, and bracket seeding.
3. Write the end-user article around those screenshots and keep links to prerequisite guides explicit.
4. Verify blog registry tests, sitemap coverage, TypeScript, production build, and rendered route behavior.

## Validation

- Focused Jest tests for blog registry, blog route static params, guide page, and sitemap.
- `npx tsc --noEmit`
- `npm run build`
- Local rendered route smoke test for `/blog/indoor-volleyball-tournament`.
