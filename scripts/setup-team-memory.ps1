# PowerShell setup script for team memory (Windows)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Write-Host "🔧 Setting up team memory with git hooks..." -ForegroundColor Cyan
Write-Host ""

# 1. Create .shared directory
$SharedDir = Join-Path $RepoRoot ".shared"
if (-not (Test-Path $SharedDir)) {
    New-Item -ItemType Directory -Path $SharedDir | Out-Null
    Write-Host "✅ Created .shared directory" -ForegroundColor Green
}

# 2. Initialize team memory if it doesn't exist
$TeamMemory = Join-Path $SharedDir "team-memory.json"
if (-not (Test-Path $TeamMemory)) {
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $initialContent = @"
{
  "version": "1.0.0",
  "last_updated": "$timestamp",
  "entities": {},
  "relations": [],
  "observations": []
}
"@
    $initialContent | Out-File -FilePath $TeamMemory -Encoding UTF8
    Write-Host "✅ Created team-memory.json" -ForegroundColor Green
} else {
    Write-Host "✅ team-memory.json already exists" -ForegroundColor Green
}

# 3. Install git hooks
$HooksDir = Join-Path $RepoRoot ".git\hooks"
if (-not (Test-Path $HooksDir)) {
    New-Item -ItemType Directory -Path $HooksDir | Out-Null
}

# Copy post-merge hook
$PostMergeSource = Join-Path $RepoRoot ".githooks\post-merge"
$PostMergeDest = Join-Path $HooksDir "post-merge"
if (Test-Path $PostMergeSource) {
    Copy-Item $PostMergeSource $PostMergeDest -Force
    Write-Host "✅ Installed post-merge hook" -ForegroundColor Green
}

# Copy pre-push hook
$PrePushSource = Join-Path $RepoRoot ".githooks\pre-push"
$PrePushDest = Join-Path $HooksDir "pre-push"
if (Test-Path $PrePushSource) {
    Copy-Item $PrePushSource $PrePushDest -Force
    Write-Host "✅ Installed pre-push hook" -ForegroundColor Green
}

# 4. Configure git to use hooks directory
Set-Location $RepoRoot
git config core.hooksPath ".githooks" 2>$null

Write-Host ""
Write-Host "🎉 Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Commit the team-memory.json file:"
Write-Host "   git add .shared/team-memory.json .githooks/"
Write-Host "   git commit -m 'feat: add team memory with git sync'"
Write-Host "   git push"
Write-Host ""
Write-Host "2. Update your ~/.claude/.mcp.json to point to:"
Write-Host "   MEMORY_FILE_PATH: `"$TeamMemory`""
Write-Host ""
Write-Host "3. Share docs/team-memory-git-sync.md with your team"
Write-Host ""
