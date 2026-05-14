$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonRoot = if ($env:SHOPHUYVAN_PYTHON_AUTOMATION_DIR) { $env:SHOPHUYVAN_PYTHON_AUTOMATION_DIR } else { "E:\shophuyvan-python-automation" }
$runtimeRoot = if ($env:SHOPHUYVAN_RUNTIME_DIR) { $env:SHOPHUYVAN_RUNTIME_DIR } else { "E:\shophuyvan-runtime" }
$botScript = Join-Path $pythonRoot "oms_python\features\telegram_control\bot.py"
$configPath = Join-Path $pythonRoot "data\config\telegram_control.local.json"
$logDir = Join-Path $runtimeRoot "logs"
$outLog = Join-Path $logDir "telegram-control-out.log"
$errLog = Join-Path $logDir "telegram-control-err.log"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configPath) | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path $configPath)) {
  $defaultConfig = @'
{
  "bot_token": "DAN_TOKEN_TU_BOTFATHER_VAO_DAY",
  "allowed_chat_ids": ["DAN_CHAT_ID_CUA_BAN_VAO_DAY"],
  "worker_api": "https://huyvan-worker-api.nghiemchihuy.workers.dev",
  "local_helper": "http://127.0.0.1:8765"
}
'@
  Set-Content -Path $configPath -Value $defaultConfig -Encoding UTF8
  Write-Host "Created local config: $configPath"
  Write-Host "Fill bot_token and allowed_chat_ids, then run this script again."
  exit 2
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

python $botScript --config $configPath --check-config
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -like "python*" -and
    $_.CommandLine -and
    $_.CommandLine -like "*telegram_control*bot.py*"
  }

if ($existing) {
  Write-Host "Telegram control bot is already running. PID: $($existing[0].ProcessId)"
  exit 0
}

Start-Process -FilePath "python" `
  -ArgumentList @("`"$botScript`"", "--config", "`"$configPath`"") `
  -WorkingDirectory $pythonRoot `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden

Start-Sleep -Seconds 2
$running = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -like "python*" -and
    $_.CommandLine -and
    $_.CommandLine -like "*telegram_control*bot.py*"
  } |
  Select-Object -First 1

if ($running) {
  Write-Host "Started Telegram control bot. PID: $($running.ProcessId)"
  Write-Host "Log: $outLog"
} else {
  Write-Host "Could not start Telegram control bot. Check error log: $errLog"
  exit 1
}
