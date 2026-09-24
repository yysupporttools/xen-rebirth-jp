"""Build the downloadable add-on; never include runtime, user data or bytecode."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'dist/downloads/XenMapCompanion-beta.zip'
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted((root / 'companion').rglob('*')):
        if path.is_file() and path.suffix in {'.py', '.md', '.bat', '.ps1'}:
            archive.write(path, 'XenMapCompanion/' + str(path.relative_to(root / 'companion')).replace('\\', '/'))
print(output)
