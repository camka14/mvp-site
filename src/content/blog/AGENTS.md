# Blog and Guide Content Instructions

This folder can contain MDX used by both the Blog and Guides surfaces. The registry in `src/lib/blog/index.ts` decides whether a piece is a `blog` or a `guide`, which topic it belongs to, and what canonical route it uses.

## Content Types

- `guide`: product tutorial content for using BracketIQ. Guides should have canonical paths under `/guides/...`, set `contentType: 'guide'`, and set `guideTopic` to one of `events`, `tournaments`, `leagues`, or `organizations`.
- `blog`: general informational or sport-specific content for hosting recreational sports events. Blog posts should have canonical paths under `/blog/...` and set `contentType: 'blog'`. They can explain how BracketIQ solves the problem, but they should not become click-by-click product tutorials.

BracketIQ guides are a subset of the broader content library and are surfaced from `/guides`. The guide home page groups guide links by Events, Tournaments, Leagues, and Organizations in the left guide navigation. For example, tournament creation and tournament management guides belong under the Tournaments topic.

Use the Blog for sport logistics and hosting advice such as indoor volleyball, outdoor volleyball, pickleball, indoor soccer, outdoor soccer, basketball, tennis, hockey, baseball/softball, and football articles. Sport-specific blog posts should depend on relevant generic guide content where useful, then focus on the sport's real-world logistics instead of repeating BracketIQ setup steps.

The living blog and article roadmap belongs in `docs/blog-article-roadmap.md`. Keep roadmap updates there instead of adding editorial planning notes to this folder-level file.

All published blog and guide pages should use the shared metadata/rendering path so the bottom author footer shows Samuel Razumovskiy, the profile photo from `public/blog/authors/samuel-razumovskiy.jpg`, and the created/updated dates. Do not hand-code a different author block inside individual MDX files.

## Guide Creation Process

For BracketIQ guides, plan one workflow step at a time, perform the step in the app, capture screenshots, then write the final article text as end-user instructions before proceeding to the next step. The finished article should not mention browser automation, local URLs, fixture cleanup, or failed attempts.

## Blog Playwright Lessons

This section is only for lessons learned while using Playwright to create or update article fixture events for screenshot-based guide posts. Do not store article outlines, per-event plans, fixture event ids, or user assignments here. Those belong in dedicated ExecPlans under `plans/`.

## Lessons Learned

- Host login can redirect to the host's organization home even when the article is documenting a non-organization event. After login, navigate directly to the individual event create/edit URL.
- Uploaded images in the image picker may all expose the same alt text. For screenshot setup, select the intended image by its upload id or `src` fragment instead of relying on the accessible name alone.
- Mantine text inputs in the Browser Playwright runtime were more reliable with `getByRole('textbox', { name: ... })` than `getByLabel(...)` for some event form fields.
- A single-division event still needs an explicit division row. Setting `singleDivision` and event-level price/capacity is not enough; create fails until a division such as `CoEd Open 18+` is added.
- Event creation saved the individual pickup event as `Draft`/`UNPUBLISHED`. Normal participant accounts could not load the event until the host changed the lifecycle status to `Published` and saved.
- The existing `localhost:3000` server may be `npm start`, which serves a stale built bundle. For current-source screenshots after code changes, start a dev server on a free port and use that port for browser capture.
- The dev server exposed local DB drift where `UserData.accountVisibility` was missing. Applying the specific local migration SQL unblocked auth without applying unrelated pending migrations.
- Paid individual joins must open checkout before an active self-registration exists. A bad capture produced an `ACTIVE` fixture registration with no bill; deleting only that fixture registration restored a clean checkout screenshot path.
- Payment-form screenshots create a temporary `STARTED` event registration reservation. Clear only that fixture reservation after capture if the living event should remain immediately reusable.
- Chat and realtime websocket warnings can appear while capturing authenticated event pages. Do not treat those as article-flow failures unless they block the visible step being documented.
- Final article text must read like simple user instructions, not a capture log. Do not mention browser runs, local development URLs, fixture events, screenshot process, or failed attempts unless the point is rewritten as an instruction the reader should follow.
- Use plain words in article text. Prefer words such as description, players, payment, spots, signups, and rules unless a BracketIQ screen uses a different label.

## Mistakes To Record Here

After each Playwright run, add short notes for mistakes that would affect future article captures, such as:

- A selector or label that was easy to confuse.
- A modal, accordion, or loading state that had to be handled before the next step.
- A user/account prerequisite that blocked the flow.
- A local database state issue that made screenshots inaccurate.
- A product behavior that differed from the intended article text.

Keep entries specific to the actual browser run. If the note is an article plan, event fixture definition, or editorial outline, put it in the relevant ExecPlan instead.
