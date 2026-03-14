chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = "Stop"

$script:needsShellRestart = $false

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeVersionText {
  if (-not (Test-CommandExists -Name "node")) {
    return $null
  }

  try {
    return (node -v).Trim()
  } catch {
    return $null
  }
}

function Get-NodeMajorVersion {
  $versionText = Get-NodeVersionText
  if (-not $versionText) {
    return $null
  }

  try {
    return ([Version]($versionText.TrimStart('v'))).Major
  } catch {
    return $null
  }
}

function Get-PythonVersionText {
  if (Test-CommandExists -Name "py") {
    try {
      return ((py --version) 2>$null).Trim()
    } catch {
    }
  }

  if (Test-CommandExists -Name "python") {
    try {
      return ((python --version) 2>$null).Trim()
    } catch {
    }
  }

  return $null
}

function Install-Or-UpgradePackage {
  param(
    [string]$Id,
    [string]$DisplayName,
    [string[]]$Aliases = @()
  )

  $installed = $false
  foreach ($alias in $Aliases) {
    if (Get-Command $alias -ErrorAction SilentlyContinue) {
      $installed = $true
      break
    }
  }

  if ($installed) {
    Write-Host "  Found: $DisplayName. Trying upgrade to latest stable version..."
    winget upgrade --id $Id --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  Note: no upgrade was needed, or the current version will be kept."
    } else {
      $script:needsShellRestart = $true
    }
    return
  }

  Write-Host "  Installing: $DisplayName"
  winget install --id $Id --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity
  if ($LASTEXITCODE -ne 0) {
    throw "$DisplayName installation failed."
  }
  $script:needsShellRestart = $true
}

Write-Host "[1/5] Checking winget..."
if (-not (Test-CommandExists -Name "winget")) {
  throw "winget was not found. Install App Installer on Windows 10/11 and try again."
}
Write-Host "  OK: winget is available"

Write-Host "[2/5] Checking Git..."
if (Test-CommandExists -Name "git") {
  Write-Host "  Keep: $((git --version).Trim())"
} else {
  Install-Or-UpgradePackage -Id "Git.Git" -DisplayName "Git" -Aliases @("git")
}

Write-Host "[3/5] Checking Node.js..."
$nodeMajor = Get-NodeMajorVersion
$nodeVersionText = Get-NodeVersionText
if ($nodeMajor -and $nodeMajor -ge 20) {
  Write-Host "  Keep: Node.js $nodeVersionText"
} else {
  if ($nodeVersionText) {
    Write-Host "  Note: current Node.js version is $nodeVersionText. Switching to LTS."
  }
  Install-Or-UpgradePackage -Id "OpenJS.NodeJS.LTS" -DisplayName "Node.js LTS" -Aliases @("node", "npm")
}

Write-Host "[4/5] Checking Python..."
$pythonVersionText = Get-PythonVersionText
if ($pythonVersionText) {
  Write-Host "  Keep: $pythonVersionText"
} else {
  Install-Or-UpgradePackage -Id "Python.Python.3.12" -DisplayName "Python 3" -Aliases @("py", "python")
}

Write-Host "[5/5] Done"
Write-Host ""
Write-Host "Prerequisite setup finished."
if ($script:needsShellRestart) {
  Write-Host "Important: close PowerShell completely and open it again so PATH is refreshed."
}
Write-Host ""
Write-Host "Next steps"
Write-Host "  1. Move to the repo folder."
Write-Host "  2. Run npm run setup:web"
Write-Host "  3. Put your OpenClaw address into apps/web/.env.local"
Write-Host '  4. Run npm run dev'
Write-Host '  5. Open http://localhost:3000/meeting'
