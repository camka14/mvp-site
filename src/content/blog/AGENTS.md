# Blog Playwright Lessons

This file is only for lessons learned while using Playwright to create or update article fixture events for screenshot-based blog posts. Do not store article outlines, per-event plans, fixture event ids, or user assignments here. Those belong in dedicated ExecPlans under `plans/`.

The living blog and article roadmap belongs in `docs/blog-article-roadmap.md`. Keep roadmap updates there instead of adding editorial planning notes to this folder-level file.

All published article pages should use the shared blog metadata/rendering path so the bottom author footer shows Samuel Razumovskiy, the profile photo from `public/blog/authors/samuel-razumovskiy.jpg`, and the article created/updated dates. Do not hand-code a different author block inside individual MDX files.

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
