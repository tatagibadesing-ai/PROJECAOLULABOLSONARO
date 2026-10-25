@echo off
setlocal
cd /d "%~dp0"
echo.
echo Observatorio Presidencial - inicializacao no seu computador
echo.
where node >nul 2>nul
if not errorlevel 1 (
  node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
  if not errorlevel 1 goto node_ready
)
if exist ".runtime\node\node.exe" goto portable_ready
echo Preparando Node.js portatil oficial. Nao altera a instalacao do sistema.
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $m=Get-Content -LiteralPath 'scripts/node-runtime.json' -Raw | ConvertFrom-Json; $a=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'win32-arm64'}else{'win32-x64'}; $item=$m.artifacts.$a; if(-not $item){throw 'Arquitetura Windows nao suportada'}; $dir=Join-Path (Get-Location) '.runtime'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $zip=Join-Path $dir $item.filename; Invoke-WebRequest -UseBasicParsing -Uri $item.url -OutFile $zip; $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant(); if($actual -ne $item.sha256){Remove-Item -LiteralPath $zip; throw 'SHA-256 diferente do manifesto oficial. Instalacao cancelada.'}; $unpack=Join-Path $dir ([Guid]::NewGuid().ToString()); Expand-Archive -LiteralPath $zip -DestinationPath $unpack; $folder=Get-ChildItem -LiteralPath $unpack -Directory | Select-Object -First 1; if(-not $folder){throw 'Arquivo Node.js sem diretorio esperado'}; Move-Item -LiteralPath $folder.FullName -Destination (Join-Path $dir 'node'); Remove-Item -LiteralPath $unpack -Recurse; Remove-Item -LiteralPath $zip; Write-Host 'Node.js oficial instalado e checksum conferido.'"
if errorlevel 1 goto failed
:portable_ready
set "PATH=%CD%\.runtime\node;%PATH%"
:node_ready
node scripts\start-local.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo A inicializacao falhou. Copie a mensagem acima para diagnostico.
echo.
pause
exit /b 1
