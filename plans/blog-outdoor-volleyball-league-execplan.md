# Outdoor Volleyball League Blog ExecPlan

## Objective

Publish a sport-specific blog article for running an outdoor volleyball league or series with BracketIQ.

## Scope

- Add a `/blog/outdoor-volleyball-league` article.
- Use an outdoor volleyball hero image with attribution.
- Reuse current BracketIQ league screenshots for registration, weekly timeslots, Agenda schedule review, standings, and communication.
- Keep the article focused on outdoor volleyball logistics while linking to BracketIQ league guides for click-by-click workflows.
- Register the post in the blog index, sitemap tests, and roadmap.

## Workflow Notes

1. Plan the outdoor league around beach or grass formats, daylight, weather, court setup, and score reporting.
2. Use existing BracketIQ screenshots that already show the relevant league workflow surfaces.
3. Write the end-user article around the screenshots and reference prerequisite guides.
4. Verify blog registry tests, sitemap coverage, TypeScript, production build, and rendered route behavior.

## Validation

- Focused Jest tests for blog registry, blog route static params, guide page, and sitemap.
- `npx tsc --noEmit`
- `npm run build`
- Local rendered route smoke test for `/blog/outdoor-volleyball-league`.
