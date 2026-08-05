# Affiliate coverage completion contract

## Campaign proposal

Write a proposal JSON and pass it unchanged to the campaign-create command. Use this shape:

    {
      "schemaVersion": 1,
      "jobId": "claimed coverage job id",
      "agentId": "stable agent id",
      "name": "San Francisco Volleyball Tournament Operators",
      "region": "San Francisco Bay Area, California",
      "location": "San Francisco, California",
      "sportIds": ["canonical sport id"],
      "sourceTypeHints": ["TOURNAMENT"],
      "coverageArchetypes": ["COMPETITION_OPERATOR", "GOVERNING_ASSOCIATION"],
      "rationale": "Existing results contain tournament events but no focused operator campaign.",
      "searchIntervalMinutes": 10080,
      "maxQueriesPerRun": 10,
      "maxResultsPerQuery": 10
    }

Allowed archetypes are `CLUB_OR_ACADEMY`, `COMPETITION_OPERATOR`, `FACILITY`, `GOVERNING_ASSOCIATION`, `RECREATION_DEPARTMENT`, and `TRAINING_PROVIDER`.

The command activates and queues the campaign but does not call the provider. An identical fingerprint returns the existing campaign and does not duplicate its active run.

## Manual browser evidence

Write a manual-evidence JSON and pass it unchanged to the manual-evidence command. Use this shape:

    {
      "schemaVersion": 1,
      "jobId": "claimed failed-capture job id",
      "agentId": "stable agent id",
      "pageId": "failed intake page id",
      "sourceUrl": "https://official.example/programs",
      "finalUrl": "https://official.example/programs",
      "htmlPath": "output/affiliate-coverage-agent/manual/job/page.html",
      "screenshotPath": "output/affiliate-coverage-agent/manual/job/page.png",
      "screenshotMimeType": "image/png",
      "notes": "A single public browser navigation rendered the page without authentication."
    }

Omit the screenshot fields when no screenshot was captured. The HTML must be the final public DOM or response from the claimed page policy key. Do not submit a login page, CAPTCHA, browser error, or another domain's content.

## Completion result

Every result uses:

    {
      "schemaVersion": 1,
      "jobId": "claimed job id",
      "agentId": "stable agent id",
      "decision": "one allowed decision",
      "summary": "Concrete evidence-based outcome with at least ten characters.",
      "campaignIds": [],
      "manualRunId": null,
      "coverageEvidence": null,
      "reasonCodes": []
    }

Allowed decisions are:

- `CAMPAIGNS_CREATED`: Use only for a market job and include at least one campaign ID. Run each listed campaign first. Completion returns the market job to `QUEUED` for a fresh assessment.
- `COVERED`: Use only for a market job. Include two source families, completed profiles backed by successful run summaries, at least two recent yields, and `unresolvedLeadCount: 0`. This count includes only unlinked, automatically promotable direct results. Include all focused campaign IDs whose results support the decision.
- `WAITING_FOR_PIPELINE`: Use only for a market job with a current nonzero count of unlinked, automatically promotable direct results. Include that count in `coverageEvidence`. Reconciliation returns the job to `QUEUED` after the count reaches zero.
- `CAPTURE_RECOVERED`: Use only for a failed-capture job and include the successful manual run ID.
- `MAPPER_REPAIR_REQUIRED`: Use when an existing scraper package needs implementation repair.
- `RETRY_LATER`: Use only for a transient failed-capture condition. Reconciliation queues the job after a bounded delay. The server changes an exhausted retry to `SOURCE_EXCLUDED`.
- `SOURCE_EXCLUDED`: Use for a deterministic source exclusion that must not retry.
- `HUMAN_REVIEW_REQUIRED`: Use only for conflicting identity, contradictory evidence, or replacement-domain approval.

Use one of these reason codes with `RETRY_LATER`:

- `EVIDENCE_SIZE_LIMIT`
- `HTTP_429`
- `HTTP_5XX`
- `JAVASCRIPT_RENDER_REQUIRED`
- `NETWORK_ERROR`
- `ROBOTS_EVIDENCE_UNAVAILABLE`
- `STORED_HTML_AVAILABLE`
- `TLS_ERROR`
- `TRANSIENT_ACCESS_FAILURE`

Use one of these reason codes with `SOURCE_EXCLUDED`:

- `CAPTCHA_REQUIRED`
- `DUPLICATE_CAPTURE_TARGET`
- `EXPLICIT_PROHIBITION`
- `HELDOUT_SOURCE`
- `LOGIN_REQUIRED`
- `RETRY_EXHAUSTED`
- `SOURCE_NOT_FOUND`
- `UNRELATED_SOURCE`
- `UNSUPPORTED_SOURCE`

Use one of these reason codes with `HUMAN_REVIEW_REQUIRED`:

- `CONFLICTING_SOURCE_IDENTITY`
- `CONTRADICTORY_EVIDENCE`
- `REPLACEMENT_DOMAIN_APPROVAL_REQUIRED`

A covered result uses evidence such as:

    {
      "sourceFamilies": ["provider search", "governing association directory"],
      "completedQueryProfiles": ["clubs-programs", "league-operators", "tournament-operators"],
      "recentNewDomainYields": [1, 0, 0],
      "unresolvedLeadCount": 0,
      "notes": ["All failed capture jobs reached a terminal result."]
    }

## Retry and stopping rules

One claim permits one manual public-page pass. Reconciliation can schedule another claim only for a recognized transient reason and stops after three total claims. A same-policy-key `www` redirect is not a replacement source. A new policy key needs governed intake handling and cannot be inferred from a similar name.

The manual-evidence command can use public HTML already exported from the failed page. State this provenance in `notes`. Do not relabel login, CAPTCHA, browser-error, or unrelated content as public evidence.

Complete every claimed job. Use an exclusion for a deterministic non-transient source problem. Use human review only for the three human decision reason codes. An expired lease can be reclaimed; an active lease cannot.

The final queue report must show:

    claimableJobs = 0
    activeLeases = 0
    claimedWithoutLease = 0
