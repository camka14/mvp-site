param(
    [Parameter(Mandatory = $true)][ValidateSet("mvp-site", "mvp-app")][string]$Repository,
    [Parameter(Mandatory = $true)][ValidateSet("pending", "static-reviewed", "runtime-verified", "generated-verified", "needs-followup", "excluded")][string]$Status,
    [Parameter(Mandatory = $true)][string]$ReviewMethod,
    [string]$FindingIds = "",
    [string]$Notes = "",
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Path,
    [string]$LedgerPath = "docs\code-audit\file-coverage.tsv"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$absoluteLedger = Join-Path $repoRoot $LedgerPath
$rows = @(Import-Csv -LiteralPath $absoluteLedger -Delimiter "`t")
$requested = @($Path | ForEach-Object { $_.Replace("\", "/") })
$matched = @{}

foreach ($row in $rows) {
    if ($row.repository -eq $Repository -and $requested -contains $row.path) {
        $row.status = $Status
        $row.review_method = $ReviewMethod.Replace("`t", " ")
        $row.finding_ids = $FindingIds.Replace("`t", " ")
        $row.notes = $Notes.Replace("`t", " ")
        $matched[$row.path] = $true
    }
}

$missing = @($requested | Where-Object { -not $matched.ContainsKey($_) })
if ($missing.Count -gt 0) {
    throw "Paths not found for $Repository in ledger: $($missing -join ', ')"
}

$header = "repository`tcommit`tblob`tpath`tkind`tstatus`treview_method`tfinding_ids`tnotes"
$lines = [Collections.Generic.List[string]]::new()
$lines.Add($header)
foreach ($row in $rows) {
    $lines.Add((@(
        $row.repository,
        $row.commit,
        $row.blob,
        $row.path,
        $row.kind,
        $row.status,
        $row.review_method,
        $row.finding_ids,
        $row.notes
    ) -join "`t"))
}
[IO.File]::WriteAllLines($absoluteLedger, $lines, [Text.UTF8Encoding]::new($false))
Write-Output "Updated $($matched.Count) $Repository ledger rows to $Status."
