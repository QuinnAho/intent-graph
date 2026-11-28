@echo off
rem opens this repo in a separate VS Code window with the graph in a panel, for editing. the work is in tools\play-vscode.mjs. close that window to stop it.
cd /d "%~dp0"
node tools\play-vscode.mjs --write
if errorlevel 1 pause
