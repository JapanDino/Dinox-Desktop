# Dot-source before building: . ./scripts/load-google-oauth.ps1
# Publisher configuration only; credentials never belong in the repository.
[CmdletBinding()]
param(
    [string]$CredentialsPath = (Join-Path $env:LOCALAPPDATA 'Dinox\publisher\google-oauth.json'),
    [ValidateSet('testing','unverified','verified')]
    [string]$AccessMode = 'unverified'
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
if (-not $config.installed -or
    [string]::IsNullOrWhiteSpace($config.installed.client_id) -or
    [string]::IsNullOrWhiteSpace($config.installed.client_secret) -or
    -not $config.installed.client_id.EndsWith('.apps.googleusercontent.com')) {
    throw 'Expected Google OAuth credentials for a Desktop app.'
}
$env:DINOX_GOOGLE_CLIENT_ID = $config.installed.client_id
$env:DINOX_GOOGLE_CLIENT_SECRET = $config.installed.client_secret
$env:DINOX_GOOGLE_ACCESS_MODE = $AccessMode
Remove-Variable config
Write-Host 'Google OAuth publisher configuration loaded for this process. Values are hidden.'
