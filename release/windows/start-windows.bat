@echo off
cd /d "%~dp0"
if exist historic-portfolio-ai.pid del historic-portfolio-ai.pid
start "historic-portfolio-ai" "%~dp0historic-portfolio-ai.exe" --urls "http://127.0.0.1:5087"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds 300; $p = Get-CimInstance Win32_Process -Filter \"name='historic-portfolio-ai.exe'\" | Where-Object { $_.CommandLine -like '*127.0.0.1:5087*' } | Sort-Object CreationDate -Descending | Select-Object -First 1; if ($p) { $p.ProcessId }"') do echo %%P>historic-portfolio-ai.pid
timeout /t 2 > nul
start "" "http://127.0.0.1:5087"
