$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$profileDir = Join-Path $repoRoot ".browser-profiles\shipxanh"
$targetUrl = "https://app.shipxanh.com/dashboard/stock/products"
$debugPort = 9333

$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Chrome.exe not found. Please install Google Chrome first."
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$args = @(
  "--user-data-dir=$profileDir",
  "--profile-directory=Default",
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$debugPort",
  "--no-first-run",
  "--disable-default-apps",
  $targetUrl
)

Write-Host "Opening ShipXanh Chrome profile..."
Write-Host "Profile: $profileDir"
Write-Host "URL: $targetUrl"
Write-Host "Debug: http://127.0.0.1:$debugPort"

Start-Process -FilePath $chrome -ArgumentList $args
