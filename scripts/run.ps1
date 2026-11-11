param(
  [ValidateSet('dev', 'build', 'test', 'typecheck', 'start')]
  [string]$Action = 'dev',
  [string]$NodePath
)
$ErrorActionPreference = 'Stop'
if (-not $NodePath) {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { $NodePath = $command.Source }
}
if (-not $NodePath) {
  $NodePath = Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -match 'OpenAI\.CodexPrimaryRuntime|codex-primary-runtime' } |
    Select-Object -First 1 -ExpandProperty Path
}
if (-not $NodePath) {
  $cachedRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $cachedRuntime) { $NodePath = $cachedRuntime }
}
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) {
  throw 'Node.js not found. Install Node.js or pass -NodePath with its absolute executable path.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousPath = $env:PATH
Push-Location $projectRoot
try {
  $env:PATH = (Split-Path -Parent $NodePath) + ';' + $env:PATH
  switch ($Action) {
    'dev' { & $NodePath node_modules/next/dist/bin/next dev --hostname 127.0.0.1 }
    'start' { & $NodePath node_modules/next/dist/bin/next start --hostname 127.0.0.1 }
    'build' { & $NodePath node_modules/next/dist/bin/next build }
    'typecheck' { & $NodePath node_modules/typescript/bin/tsc --noEmit }
    'test' { & $NodePath node_modules/@playwright/test/cli.js test }
  }
  $runExitCode = $LASTEXITCODE
} finally {
  $env:PATH = $previousPath
  Pop-Location
}
exit $runExitCode
