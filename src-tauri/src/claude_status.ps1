# Official Claude Code statusLine stdin -> sanitized, local Dinox quota cache.
# Do not persist the input: it also contains project paths and session metadata.
$ErrorActionPreference = 'Stop'
$dinoxInput = [Console]::In.ReadToEnd()
try {
    if ($dinoxInput.Length -gt 1048576) { exit 0 }
    $dinoxPayload = $dinoxInput | ConvertFrom-Json
    $dinoxRates = [ordered]@{}
    foreach ($dinoxKey in @('five_hour', 'seven_day')) {
        $dinoxWindow = $dinoxPayload.rate_limits.$dinoxKey
        if ($null -ne $dinoxWindow.used_percentage) {
            $dinoxUsed = [double]$dinoxWindow.used_percentage
            if (-not [double]::IsNaN($dinoxUsed) -and $dinoxUsed -ge 0 -and $dinoxUsed -le 100) {
                $dinoxReset = if ($null -ne $dinoxWindow.resets_at) { [long]$dinoxWindow.resets_at } else { $null }
                $dinoxRates[$dinoxKey] = [ordered]@{ used_percentage = $dinoxUsed; resets_at = $dinoxReset }
            }
        }
    }
    $dinoxCache = Join-Path $PSScriptRoot 'claude-usage.json'
    # Timer/status-only reruns can carry the same old quota sample. Do not turn
    # them into apparently fresh network data. Retain only a digest, no session data.
    $dinoxSignatureInput = [ordered]@{ rates = $dinoxRates; api_ms = $dinoxPayload.cost.total_api_duration_ms; input_tokens = $dinoxPayload.context_window.total_input_tokens; output_tokens = $dinoxPayload.context_window.total_output_tokens } | ConvertTo-Json -Depth 5 -Compress
    $dinoxHasher = [Security.Cryptography.SHA256]::Create()
    try { $dinoxSignature = ([BitConverter]::ToString($dinoxHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($dinoxSignatureInput)))).Replace('-', '') }
    finally { $dinoxHasher.Dispose() }
    $dinoxChecked = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    try {
        $dinoxOld = Get-Content -LiteralPath $dinoxCache -Raw | ConvertFrom-Json
        if ($dinoxOld.fingerprint -eq $dinoxSignature) { $dinoxChecked = $dinoxOld.checked }
    } catch { }
    $dinoxReport = @{ checked = $dinoxChecked; rate_limits = $dinoxRates; fingerprint = $dinoxSignature } | ConvertTo-Json -Depth 5 -Compress
    $dinoxTemporary = Join-Path $PSScriptRoot ('claude-usage-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($dinoxTemporary, $dinoxReport, (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($dinoxCache)) {
        $dinoxPrevious = $dinoxTemporary + '.previous'
        try { [IO.File]::Replace($dinoxTemporary, $dinoxCache, $dinoxPrevious); Remove-Item -LiteralPath $dinoxPrevious -ErrorAction SilentlyContinue }
        catch { Remove-Item -LiteralPath $dinoxTemporary -ErrorAction SilentlyContinue }
    } else {
        try { [IO.File]::Move($dinoxTemporary, $dinoxCache) }
        catch { Remove-Item -LiteralPath $dinoxTemporary -ErrorAction SilentlyContinue }
    }
} catch { }
# Preserve existing status-line output by forwarding the original stdin unchanged.
try {
    $dinoxOriginal = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'claude-status-backup.json') -Raw | ConvertFrom-Json
    if ($dinoxOriginal.had -and $dinoxOriginal.value.type -eq 'command' -and $dinoxOriginal.value.command) {
        $dinoxInput | & powershell.exe -NoProfile -Command $dinoxOriginal.value.command
    } else {
        $dinoxParts = @()
        foreach ($dinoxKey in @('five_hour', 'seven_day')) {
            if ($dinoxRates.Contains($dinoxKey)) {
                $dinoxLabel = if ($dinoxKey -eq 'five_hour') { '5h' } else { '7d' }
                $dinoxParts += ($dinoxLabel + ': ' + [math]::Round($dinoxRates[$dinoxKey].used_percentage) + '% used')
            }
        }
        if ($dinoxParts.Count) { [Console]::WriteLine(($dinoxParts -join ' | ')) }
    }
} catch { }
