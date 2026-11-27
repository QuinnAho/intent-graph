@echo off
rem opens the live graph of this repo for editing. the work is in tools\play.mjs. close this window to stop it.
cd /d "%~dp0"
node tools\play.mjs --write
if errorlevel 1 pause
