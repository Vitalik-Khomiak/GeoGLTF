@echo off
rem =====================================================================
rem  GeoGLTF - launcher. ASCII only on purpose: cmd.exe reads .bat files
rem  in the OEM codepage (437 here), so Cyrillic inside this file would
rem  corrupt the parser. All Ukrainian output lives in tools\serve.ps1.
rem =====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
if errorlevel 1 pause
