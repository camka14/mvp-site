param(
    [string]$SiteRepo = "C:\Users\samue\Documents\Code\mvp-site",
    [string]$AppRepo = "C:\Users\samue\StudioProjects\mvp-app",
    [string]$OutputPath = "docs\code-audit\file-coverage.tsv"
)

$ErrorActionPreference = "Stop"
$absoluteOutput = Join-Path $SiteRepo $OutputPath
$existingByKey = @{}
if (Test-Path -LiteralPath $absoluteOutput) {
    foreach ($row in (Import-Csv -LiteralPath $absoluteOutput -Delimiter "`t")) {
        $key = "$($row.repository)|$($row.commit)|$($row.blob)|$($row.path)"
        $existingByKey[$key] = $row
    }
}

$codeExtensions = @(
    ".c", ".cc", ".cjs", ".css", ".gradle", ".h", ".html", ".java", ".js",
    ".entitlements", ".gql", ".graphql", ".jsx", ".kt", ".kts", ".m", ".mjs",
    ".mm", ".plist", ".podspec", ".prisma", ".pro", ".properties", ".ps1", ".rb",
    ".scss", ".sh", ".sql", ".storyboard", ".strings", ".swift", ".toml", ".ts",
    ".tsx", ".xcconfig", ".xml", ".yaml", ".yml"
)

$codeFileNames = @(
    "Dockerfile", "Podfile", "gradlew", "gradlew.bat"
)

function Test-IsCodeFile {
    param(
        [string]$Repository,
        [string]$Path
    )

    $normalized = $Path.Replace("\", "/")
    if ($normalized -match "(^|/)(docs|plans|output|store-screenshots|node_modules|build|\.next)(/|$)") {
        return $false
    }
    if ($Repository -eq "mvp-site" -and $normalized.StartsWith("public/")) {
        return $false
    }
    if ($Repository -eq "mvp-site" -and $normalized.StartsWith("e2e/.auth/")) {
        return $false
    }
    if ($Repository -eq "mvp-app" -and (
        $normalized.StartsWith(".fleet/") -or
        $normalized.StartsWith(".idea/") -or
        $normalized.StartsWith(".vscode/") -or
        $normalized.StartsWith("iosApp/Pods/") -or
        $normalized.StartsWith("iosApp/BIQ.icon/") -or
        $normalized.StartsWith(".kotlin/") -or
        $normalized.StartsWith("tmp/") -or
        $normalized.Contains(".xcassets/")
    )) {
        return $false
    }

    $name = [IO.Path]::GetFileName($normalized)
    if ($codeFileNames -contains $name) {
        return $true
    }

    $extension = [IO.Path]::GetExtension($normalized).ToLowerInvariant()
    if ($codeExtensions -contains $extension) {
        return $true
    }

    if ($extension -eq ".json") {
        return $name -notin @("package-lock.json", "Podfile.lock")
    }
    if ($name -in @("project.pbxproj", "proguard-rules.pro")) {
        return $true
    }
    return $false
}

function Get-CodeKind {
    param(
        [string]$Repository,
        [string]$Path
    )

    $normalized = $Path.Replace("\", "/")
    if ($normalized -match "(^|/)(__tests__|[^/]*(test|tests|spec))(/|\.|$)" -or $normalized -match "(Test|Tests)\.(kt|swift)$") {
        return "test"
    }
    if ($normalized -match "(^|/)migrations?/") {
        return "migration"
    }
    if ($normalized -match "(^|/)(generated|build/generated)/") {
        return "generated"
    }
    if ($Repository -eq "mvp-site" -and $normalized -match "^src/app/.*/route\.ts$") {
        return "api-route"
    }
    if ($Repository -eq "mvp-site" -and $normalized -match "^src/app/.*/(page|layout|loading|error|not-found)\.tsx$") {
        return "web-route"
    }
    if ($normalized -match "(^|/)scripts?/") {
        return "script"
    }
    if ([IO.Path]::GetExtension($normalized) -in @(".css", ".scss")) {
        return "style"
    }
    if ($normalized -match "(^|/)(build\.gradle\.kts|settings\.gradle\.kts|Dockerfile|Podfile|project\.pbxproj)$" -or
        [IO.Path]::GetExtension($normalized) -in @(
            ".entitlements", ".json", ".plist", ".podspec", ".pro", ".properties",
            ".toml", ".xcconfig", ".xml", ".yaml", ".yml"
        )) {
        return "config"
    }
    return "source"
}

$rows = [Collections.Generic.List[string]]::new()
$rows.Add("repository`tcommit`tblob`tpath`tkind`tstatus`treview_method`tfinding_ids`tnotes")

foreach ($repo in @(
    @{ Name = "mvp-site"; Path = $SiteRepo },
    @{ Name = "mvp-app"; Path = $AppRepo }
)) {
    $commit = (git -C $repo.Path rev-parse HEAD).Trim()
    foreach ($entry in (git -C $repo.Path ls-files -s)) {
        if ($entry -notmatch "^\d+\s+([0-9a-f]+)\s+\d+`t(.+)$") {
            continue
        }
        $blob = $Matches[1]
        $path = $Matches[2]
        if (-not (Test-IsCodeFile -Repository $repo.Name -Path $path)) {
            continue
        }
        $kind = Get-CodeKind -Repository $repo.Name -Path $path
        $safePath = $path.Replace("`t", " ")
        $key = "$($repo.Name)|$commit|$blob|$safePath"
        $existing = $existingByKey[$key]
        $status = if ($existing) { $existing.status } else { "pending" }
        $reviewMethod = if ($existing) { $existing.review_method } else { "" }
        $findingIds = if ($existing) { $existing.finding_ids } else { "" }
        $notes = if ($existing) { $existing.notes } else { "" }
        $rows.Add("$($repo.Name)`t$commit`t$blob`t$safePath`t$kind`t$status`t$reviewMethod`t$findingIds`t$notes")
    }
}

$outputDirectory = Split-Path -Parent $absoluteOutput
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[IO.File]::WriteAllLines($absoluteOutput, $rows, [Text.UTF8Encoding]::new($false))

$rows | Select-Object -Skip 1 | ForEach-Object { ($_ -split "`t")[0] } | Group-Object | Sort-Object Name | ForEach-Object {
    Write-Output "$($_.Name): $($_.Count) code files"
}
Write-Output "Wrote $($rows.Count - 1) rows to $absoluteOutput"
