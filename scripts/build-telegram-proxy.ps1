param([string]$Python='python')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$source=Join-Path $repo 'vendor/tg-ws-proxy'
$work=Join-Path $repo 'output/telegram-proxy-build'
$manifest=Get-Content (Join-Path $source 'upstream.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest.sha256.PSObject.Properties){
  if((Get-FileHash (Join-Path $source $entry.Name) -Algorithm SHA256).Hash.ToLower() -ne $entry.Value){throw "Upstream source changed: $($entry.Name)"}
}
New-Item -ItemType Directory -Force -Path $work | Out-Null
& $Python -m venv (Join-Path $work 'venv')
if($LASTEXITCODE -ne 0){throw 'Python venv failed'}
$pythonExe=Join-Path $work 'venv/Scripts/python.exe'
& $pythonExe -m pip install --disable-pip-version-check -r (Join-Path $source 'requirements-build.txt')
if($LASTEXITCODE -ne 0){throw 'Proxy dependencies failed'}
& $pythonExe -m unittest discover -s (Join-Path $source 'tests') -v
if($LASTEXITCODE -ne 0){throw 'Proxy tests failed'}
& $pythonExe -m PyInstaller --noconfirm --clean --onedir --noupx --console --name dinox-telegram-proxy --distpath (Join-Path $repo 'src-tauri/telegram-proxy') --workpath (Join-Path $work 'build') --specpath $work --paths $source (Join-Path $source 'dinox_helper.py')
if($LASTEXITCODE -ne 0){throw 'Proxy packaging failed'}
$bundle=Join-Path $repo 'src-tauri/telegram-proxy/dinox-telegram-proxy'
Copy-Item -LiteralPath (Join-Path $source 'LICENSE') -Destination (Join-Path $bundle 'Flowseal-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $source 'upstream.json') -Destination $bundle
& $pythonExe -m pip freeze | Set-Content (Join-Path $bundle 'build-dependencies.txt')
& $pythonExe (Join-Path $PSScriptRoot 'proxy-notices.py') $bundle
if($LASTEXITCODE -ne 0){throw 'Proxy license collection failed'}
$env:DINOX_HELPER_TEST_EXE=Join-Path $bundle 'dinox-telegram-proxy.exe'
try {
  & $pythonExe -m unittest discover -s (Join-Path $source 'tests') -v
  if($LASTEXITCODE -ne 0){throw 'Packaged helper tests failed'}
} finally { Remove-Item Env:DINOX_HELPER_TEST_EXE -ErrorAction SilentlyContinue }
Write-Output "Telegram helper built: $bundle"
