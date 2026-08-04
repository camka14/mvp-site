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
- `COVERED`: Use only for a market job. Include two source families, completed profiles backed by successful run summaries, at least two recent yields, and `unresolvedLeadCount: 0`. Include all focused campaign IDs whose results support the decision.
- `CAPTURE_RECOVERED`: Use only for a failed-capture job and include the successful manual run ID.
- `MAPPER_REPAIR_REQUIRED`: Use when an existing scraper package needs implementation repair.
- `HUMAN_REVIEW_REQUIRED`: Use when safe automated work cannot resolve the evidence.

A covered result uses evidence such as:

    {
      "sourceFamilies": ["provider search", "governing association directory"],
      "completedQueryProfiles": ["clubs-programs", "league-operators", "tournament-operators"],
      "recentNewDomainYields": [1, 0, 0],
      "unresolvedLeadCount": 0,
      "notes": ["All failed capture jobs reached a terminal result."]
    }

## Retry and stopping rules

One failed-capture job permits one manual public-page pass. Do not loop. A new official URL needs governed intake handling and cannot be inferred from a similar name.

Complete every claimed job. Use human review rather than releasing a non-transient evidence problem. An expired lease can be reclaimed; an active lease cannot.

The final queue report must show:

    claimableJobs = 0
    activeLeases = 0
    claimedWithoutLease = 0
