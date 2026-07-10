@echo off
cd /d "%~dp0"
if exist historic-portfolio-ai.pid (
  set /p APP_PID=<historic-portfolio-ai.pid
  taskkill /PID %APP_PID% /F > nul 2>&1
  del historic-portfolio-ai.pid
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='historic-portfolio-ai.exe'\" | Where-Object { $_.CommandLine -like '*127.0.0.1:5087*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo historic-portfolio-ai stopped.
pause
