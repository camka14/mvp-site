# QuickBooks Data Retention And Disconnect Procedure

Last updated: June 11, 2026

This procedure applies to BracketIQ's QuickBooks Online integration.

## Current Data Scope

BracketIQ currently stores QuickBooks connection metadata and staff pay-run sync metadata for an organization:

- Provider name, connection status, environment, scopes, token expiry timestamps, and audit fields.
- Encrypted access token.
- Encrypted refresh token.
- Encrypted QuickBooks realm/company ID.
- Payroll expense account id/name and payroll liability or clearing account id/name configured by the organization finance manager.
- Finance category-to-account mappings for line-item JournalEntry sync. These mappings contain BracketIQ category names, entry type, QuickBooks account id/name, notes, and audit fields.
- Staff pay-run and finance JournalEntry sync records containing source type, staff pay-run id or finance source key, sync status, QuickBooks transaction id/type/doc number, `intuit_tid`, sanitized error code/message, request summary, response summary, sync timestamp, and audit fields.

BracketIQ currently writes approved or paid staff pay runs and reviewed organization finance line-item date ranges to QuickBooks as JournalEntry records. BracketIQ does not currently sync or store QuickBooks customers, vendors, invoices, bills, account lists, employees, payroll records, reports, or broad transaction history.

## Storage Rules

- QuickBooks OAuth tokens must be encrypted before database persistence.
- The QuickBooks realm/company ID must be encrypted before database persistence.
- Client-facing finance API responses must not include QuickBooks tokens or the QuickBooks realm/company ID.
- Production logs must not include Intuit tokens, OAuth authorization codes, refresh tokens, access tokens, realm IDs, raw QuickBooks records, staff pay-run or finance JournalEntry payload bodies, or user financial data.
- `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, and `INTEGRATION_TOKEN_ENCRYPTION_KEY` must stay server-side environment variables. They must not use `NEXT_PUBLIC_*` names.

## Disconnect Procedure

When an organization finance manager clicks Disconnect:

1. BracketIQ verifies the user can manage organization finance.
2. BracketIQ decrypts the stored QuickBooks refresh token server-side.
3. BracketIQ calls the Intuit OAuth revoke endpoint.
4. If Intuit confirms revocation, BracketIQ clears local QuickBooks tokens, encrypted realm/company ID, company name, and token expiry timestamps.
5. BracketIQ records `DISCONNECTED`, `disconnectedAt`, `disconnectedByUserId`, and `updatedBy`.

If Intuit token revocation fails:

- BracketIQ does not clear local credentials.
- BracketIQ records `lastError` on the connection.
- The API returns a controlled error stating that disconnect failed because revocation could not be confirmed.
- The finance manager should retry after Intuit connectivity/configuration is restored.

## QuickBooks Sync Rules

For the current staff pay-run JournalEntry sync:

- Only approved or paid staff pay runs may be synced.
- Organization finance managers must explicitly configure the QuickBooks payroll expense account and payroll liability or clearing account before sync.
- BracketIQ sends the pay-run title, period, scheduled pay date, amount, and configured QuickBooks account refs to create a balanced JournalEntry.
- BracketIQ stores sync metadata and sanitized error data, not raw QuickBooks payload bodies.
- Disconnect prevents future token refresh and future sync attempts until the organization reconnects.
- Client APIs expose sync status only to users who can manage finance for the original BracketIQ organization.
- Financial category mappings are configuration only until a separate event/team/org line-item sync workflow is implemented, tested, and documented.

Before adding broader QuickBooks sync, document the additional object fields, retention period, deletion process, disconnected-state tests, and authorization tests for that new data scope.
