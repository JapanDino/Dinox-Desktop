"""Collect notices for redistributed helper dependencies and Python runtime."""
from importlib.metadata import distributions
from pathlib import Path
import shutil
import sys

dest = Path(sys.argv[1]) / "licenses"
dest.mkdir(exist_ok=True)
for dist in distributions():
    for file in dist.files or []:
        if any(part.lower().startswith(("license", "copying", "notice")) for part in file.parts):
            source = Path(dist.locate_file(file))
            if source.is_file():
                target = dest / dist.metadata["Name"] / str(file)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
python_license = Path(sys.base_prefix) / "LICENSE.txt"
if not python_license.is_file():
    raise RuntimeError("Python runtime license missing")
shutil.copy2(python_license, dest / "Python-LICENSE.txt")
