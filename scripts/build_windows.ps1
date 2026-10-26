$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($env:OS -ne 'Windows_NT') { throw 'EXE собирается на Windows, а не перекрёстной сборкой на Linux.' }
python -m PyInstaller --noconfirm --clean --onefile --windowed --name Moshnosti `
  --add-data 'static;static' --add-data 'templates;templates' --add-data 'calendars;calendars' `
  --hidden-import app --hidden-import uvicorn.logging --hidden-import uvicorn.loops.asyncio `
  --hidden-import uvicorn.protocols.http.h11_impl --hidden-import uvicorn.lifespan.on desktop.py
if ($LASTEXITCODE -ne 0) { throw 'Ошибка сборки EXE' }
$exe = Join-Path (Get-Location) 'dist/Moshnosti.exe'
$report = Join-Path (Get-Location) 'dist/smoke-test.json'
$p = Start-Process -FilePath $exe -ArgumentList @('--smoke-test', ('"{0}"' -f $report)) -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "EXE smoke test failed: $($p.ExitCode)" }
if (!(Test-Path $report)) { throw 'EXE did not create a readiness report' }
if ((Get-Content $report -Raw | ConvertFrom-Json).status -ne 'passed') { throw 'EXE readiness checks failed' }
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
"$hash  Moshnosti.exe" | Set-Content 'dist/SHA256SUMS.txt' -Encoding ascii
