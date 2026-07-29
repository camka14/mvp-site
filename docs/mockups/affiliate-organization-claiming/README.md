# Affiliate organization ownership mockups

Open `index.html` in a browser. The artifact contains a clickable flow chart, a searchable screen index, desktop and mobile preview controls, the proposed dispute decision, and the post-build edge-case audit.

The prototype is local and read-only. It does not call BracketIQ APIs or change database state.

## Flow inventory

```mermaid
flowchart TD
    EV01["EV-01 Public unclaimed event"] --> CL00["CL-00 Account gate"]
    EV02["EV-02 or EV-03 Claimed public event"] --> AC01["AC-01 Ownership options"]

    CR01["CR-01 Find or create"] --> MATCH{"Existing match?"}
    MATCH -->|"Exact unclaimed"| CR02["CR-02 Claim existing profile"]
    MATCH -->|"Exact claimed"| CR03["CR-03 Profile, transfer, or dispute"]
    MATCH -->|"Related or possible"| CR04["CR-04 Acknowledge distinct organization"]
    MATCH -->|"Verified domain conflict"| CR05["CR-05 Duplicate-profile review"]
    MATCH -->|"No match"| CR06["CR-06 Organization details"]
    CR04 --> CR06
    CR06 --> CR07["CR-07 Final review and server recheck"]
    CR07 --> CR09["CR-09 Created"]
    CR07 -->|"New exact match or stale token"| CR08["CR-08 Structured conflict"]

    CL00 --> CL01["CL-01 Choose proof"]
    CL01 --> CL02["CL-02 Work email"]
    CL01 --> CL04["CL-04 DNS"]
    CL01 --> CL05["CL-05 HTML tag"]
    CL01 --> CL06["CL-06 Manual review"]
    CL02 --> CL03["CL-03 Email sent"]
    CL03 --> CL08["CL-08 MFA acceptance"]
    CL04 --> CL08
    CL05 --> CL08
    CL06 --> CL07["CL-07 Administrator review"]
    CL07 --> CL08
    CL08 --> CL09["CL-09 Claimed"]
    CL02 -->|"Expired or rejected"| CL10["CL-10 Retry or change method"]

    AC01 --> TR01["TR-01 Transfer request"]
    TR01 --> TR02["TR-02 Current-owner MFA"]
    TR02 --> TR03["TR-03 Incoming-owner MFA"]
    TR03 --> TR04["TR-04 Transferred"]
    AC01 --> DS01["DS-01 Create dispute"]
    TR01 -->|"Denied or expired"| DS01
    OW01["OW-01 Owner staff list"] --> OW02["OW-02 Add staff member"]

    DS01 --> DS02["DS-02 Proof and evidence"]
    DS02 --> DS03["DS-03 Review and certify"]
    DS03 --> DS04["DS-04 Current-owner response"]
    DS04 --> DS05["DS-05 Administrator review"]
    DS05 -->|"Credible"| DS06["DS-06 Ownership under review"]
    DS05 --> DS07["DS-07 Audited resolution"]
    DS06 --> DS07
```

## Screen counts

| Flow | IDs | Screens |
| --- | --- | ---: |
| Public event | `EV-01`–`EV-05` | 5 |
| Organization creation | `CR-01`–`CR-09` | 9 |
| Initial claim | `CL-00`–`CL-10` | 11 |
| Claimed-profile ownership, owner staffing, and transfer | `AC-01`, `OW-01`–`OW-02`, `TR-01`–`TR-04` | 7 |
| Ownership dispute | `DS-01`–`DS-07` | 7 |
| Total |  | 39 |

## Dispute decision

A user does not “re-claim” a claimed organization. They create a structured ownership issue from one of three contexts:

1. “Report an ownership issue” on a claimed profile.
2. An exact claimed-profile result in the organization-creation wizard.
3. A denied or expired ownership-transfer request.

The requester selects an issue reason and requested ownership outcome, verifies their connection, supplies bounded public evidence, reviews the linked history, and certifies that the report is accurate. A complete, non-abusive request notifies the current owner and gives them a bounded response period. Filing alone does not alter ownership, access, public badges, or ranking. An administrator must first mark the dispute credible before the public profile changes to “Ownership under review.”

Resolution is not limited to transferring ownership. The administrator may uphold the current owner, initiate an MFA-protected transfer, revoke the claim to unclaimed, suspend access for credible fraud, or merge/correct duplicate profiles. Every resolution is audited and sent to both parties.

Staff access is deliberately outside the public claim and dispute system. Organization owners and authorized managers add known users from the Staff page, choose a role, review its permissions, and send the invitation. Public visitors cannot send unsolicited staff-access requests.

## Render audit

Validated on 2026-07-29 with a real Chromium browser:

- All 39 screen IDs render.
- All internal screen transitions resolve to an existing state.
- No screen contains `undefined` or `[object Object]`.
- No screen has horizontal overflow at the desktop preview width.
- No screen has horizontal overflow at the 390px mobile preview width.
- The public event keeps the organizer-site action visually primary.
- Filing a dispute does not immediately display the disputed public state; `DS-06` is reserved for an administrator credibility decision.

The prototype tracks 29 named edge cases in the “Post-build audit” section of `index.html`.
