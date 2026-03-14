[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'apps\desktop\openclaw-backend'
$venvDir = Join-Path $backendDir '.venv'
$pythonExe = Join-Path $venvDir 'Scripts\python.exe'

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' 명령을 찾을 수 없습니다. 먼저 $InstallHint 설치한 뒤 다시 시도하세요."
  }
}

Require-Command -Name "py" -InstallHint "Python 3"
Set-Location $backendDir

if (-not (Test-Path $pythonExe)) {
  Write-Host "[1/4] Python 가상환경 생성 중..."
  py -m venv .venv
  if ($LASTEXITCODE -ne 0) {
    throw "Python 가상환경 생성에 실패했습니다."
  }
} else {
  Write-Host "[1/4] 기존 Python 가상환경 사용"
}

Write-Host "[2/4] pip 업그레이드 중..."
& $pythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "pip 업그레이드에 실패했습니다."
}

Write-Host "[3/4] backend 의존성 설치 중..."
& $pythonExe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
  throw "backend 의존성 설치에 실패했습니다."
}

Write-Host "[4/4] Playwright Chromium 설치 중..."
& $pythonExe -m playwright install chromium
if ($LASTEXITCODE -ne 0) {
  throw "Playwright Chromium 설치에 실패했습니다."
}

Write-Host "완료: apps/desktop/openclaw-backend/.venv 가 준비되었습니다."
