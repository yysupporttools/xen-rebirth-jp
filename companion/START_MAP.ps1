$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$folder = New-Object System.Windows.Forms.FolderBrowserDialog
$folder.Description = 'Select XenRebirthTranslator portable folder (contains runtime and tesseract)'
if ($folder.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
$portableRoot = $folder.SelectedPath
$pythonPath = Join-Path $portableRoot 'runtime/pythonw.exe'
$ocrPath = Join-Path $portableRoot 'tesseract/tesseract.exe'
if (!(Test-Path -LiteralPath $pythonPath) -or !(Test-Path -LiteralPath $ocrPath)) {
    [System.Windows.Forms.MessageBox]::Show('runtime/pythonw.exe or tesseract/tesseract.exe was not found.')
    exit 1
}
$env:XEN_PORTABLE_ROOT = $portableRoot
$entryPoint = Join-Path $PSScriptRoot 'start.py'
Start-Process -FilePath $pythonPath -ArgumentList ('"' + $entryPoint + '"') -WindowStyle Hidden
