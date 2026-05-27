# Manage League Guide ExecPlan

## Purpose

Publish the next League guide, "How to Manage a League in BracketIQ", as a product-led guide under `/guides/manage-league-in-bracketiq`.

## Workflow Standard

For each guide step:

1. Plan the end-user workflow step.
2. Perform the step in the local BracketIQ app.
3. Capture a screenshot of the actual UI.
4. Write the end-user instructions from the observed UI before moving on.

Schedule screenshots should use Agenda view so readers can see match order, times, teams, and fields clearly.

## Fixture

Use a local indoor soccer league fixture with:

- Published league status.
- Registered teams in one CoEd Open 18+ division.
- North Field and South Field schedule assignments.
- At least one completed score and several upcoming scheduled matches.
- Standings that reflect scored matches.

Keep fixture ids scoped to `article_manage_league_soccer` so setup can be rerun without touching unrelated data.

## Screenshots

Capture and store:

- `public/blog/manage-league/01-league-dashboard.png`
- `public/blog/manage-league/02-registered-teams.png`
- `public/blog/manage-league/03-agenda-schedule.png`
- `public/blog/manage-league/04-match-score-entry.png`
- `public/blog/manage-league/05-standings-review.png`
- `public/blog/manage-league/06-public-league-page.png`

## Implementation

- Add `src/content/blog/manage-league-in-bracketiq.mdx`.
- Register the guide in `src/lib/blog/index.ts`.
- Keep League guide navigation in reading order: create first, manage second.
- Update `docs/blog-article-roadmap.md`.
- Update focused blog, guide, and sitemap tests.

## Verification

- Focused Jest tests passed for the blog registry, guide page, blog redirects, and sitemap.
- `npx tsc --noEmit` passed.
- Desktop and mobile browser smoke checks passed for `/guides/manage-league-in-bracketiq`.
- The legacy `/blog/manage-league-in-bracketiq` URL redirects to `/guides/manage-league-in-bracketiq`.
- All six guide screenshots load in the rendered article.
