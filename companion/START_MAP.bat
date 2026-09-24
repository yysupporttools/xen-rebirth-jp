@echo off
setlocal DisableDelayedExpansion
set "XEN_PORTABLE_ROOT="
if not "%~1"=="" if exist "%~1\runtime\pythonw.exe" if exist "%~1\tesseract\tesseract.exe" set "XEN_PORTABLE_ROOT=%~1"
if defined XEN_PORTABLE_ROOT goto found
if exist "%~dp0runtime\pythonw.exe" if exist "%~dp0tesseract\tesseract.exe" set "XEN_PORTABLE_ROOT=%~dp0"
if defined XEN_PORTABLE_ROOT goto found
for /d %%D in ("%~dp0..\XenRebirthTranslator*") do if exist "%%~fD\runtime\pythonw.exe" if exist "%%~fD\tesseract\tesseract.exe" set "XEN_PORTABLE_ROOT=%%~fD"
if defined XEN_PORTABLE_ROOT goto found
echo XenRebirthTranslator portable folder was not found.
echo Place XenMapCompanion next to the original portable folder,
echo or drag the original portable folder onto this START_MAP.bat.
pause
exit /b 1
:found
if "%~2"=="--check" goto check
start "Xen Map Companion" "%XEN_PORTABLE_ROOT%\runtime\pythonw.exe" "%~dp0start.py"
exit /b 0
:check
"%XEN_PORTABLE_ROOT%\runtime\python.exe" "%~dp0start.py" --check
exit /b %errorlevel%
