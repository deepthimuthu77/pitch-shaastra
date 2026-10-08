param([Parameter(ValueFromRemainingArguments=$true)][string[]]$LauncherArgs)
$ErrorActionPreference = 'Stop'
$TaskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $TaskRoot
if (Get-Command py -ErrorAction SilentlyContinue) {
    $TaskPython = $null
    foreach ($Version in @('3.13', '3.12', '3.11')) {
        & py "-$Version" -c "import sys; sys.exit(0)" 2>$null
        if ($LASTEXITCODE -eq 0) { $TaskPython = $Version; break }
    }
    if (-not $TaskPython) { throw 'Install standard Python 3.11, 3.12 or 3.13.' }
    & py "-$TaskPython" scripts/run.py @LauncherArgs
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python scripts/run.py @LauncherArgs
} else {
    throw 'Install Python 3.11 or later, then reopen your terminal.'
}
exit $LASTEXITCODE
