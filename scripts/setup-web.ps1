[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' 명령을 찾을 수 없습니다. 먼저 $InstallHint 설치한 뒤 다시 시도하세요."
  }
}

Write-Host "[1/4] Node.js 와 npm 확인 중..."
Require-Command -Name "node" -InstallHint "Node.js"
Require-Command -Name "npm" -InstallHint "Node.js"

$nodeVersionText = (node -v).Trim()
$nodeVersion = [Version]($nodeVersionText.TrimStart('v'))
if ($nodeVersion.Major -lt 20) {
  throw "Node.js 20 이상이 필요합니다. 현재 버전: $nodeVersionText"
}

Write-Host "[2/4] npm 의존성 설치 중..."
npm install
if ($LASTEXITCODE -ne 0) {
  throw "npm install 실행에 실패했습니다."
}

$exampleEnv = Join-Path $repoRoot '.env.local.example'
$webEnv = Join-Path $repoRoot 'apps\web\.env.local'
$rootEnv = Join-Path $repoRoot '.env.local'

Write-Host "[3/4] 환경 변수 파일 확인 중..."
if (-not (Test-Path $webEnv)) {
  Copy-Item $exampleEnv $webEnv
  Write-Host "  생성: apps/web/.env.local"
} else {
  Write-Host "  유지: apps/web/.env.local"
}

if (-not (Test-Path $rootEnv)) {
  Copy-Item $exampleEnv $rootEnv
  Write-Host "  생성: .env.local"
} else {
  Write-Host "  유지: .env.local"
}

Write-Host "[4/4] 완료"
Write-Host "다음 순서로 진행하세요."
Write-Host "  1. apps/web/.env.local 파일을 엽니다."
Write-Host "  2. 필요하면 OPENCLAW_BASE_URL 과 OPENCLAW_API_KEY 를 입력합니다."
Write-Host "  3. npm run dev 를 실행합니다."
Write-Host "  4. http://localhost:3000/meeting 를 엽니다."
