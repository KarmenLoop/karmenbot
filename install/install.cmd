@echo off
rem karmenbot installer for Windows CMD (Windows 10 / 11).
rem   curl -fsSL __BASE_URL__/install.cmd -o %TEMP%\karmenbot-install.cmd && %TEMP%\karmenbot-install.cmd
rem Runs install.ps1 through PowerShell for this one session; the system
rem execution policy is not changed.
setlocal
for /f "tokens=2 delims=:." %%a in ('chcp') do set "KB_OLDCP=%%a"
chcp 65001 >nul
ver | findstr /r /c:"Version 1[0-9]\." >nul
if errorlevel 1 (
  echo karmenbot 需要 Windows 10 或 11。Windows 7 / 8 / XP 无法运行 Node.js 22。
  echo 可以把 karmenbot 装在一台较新的电脑上，再通过飞书或微信在这台电脑上使唤它。
  echo karmenbot needs Windows 10 or 11.
  chcp %KB_OLDCP% >nul
  exit /b 1
)
where powershell >nul 2>nul
if errorlevel 1 (
  echo 找不到 PowerShell。请在开始菜单里打开 PowerShell，运行：irm __BASE_URL__/install.ps1 ^| iex
  chcp %KB_OLDCP% >nul
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '__BASE_URL__/install.ps1' | iex"
set "KB_CODE=%ERRORLEVEL%"
chcp %KB_OLDCP% >nul
exit /b %KB_CODE%
