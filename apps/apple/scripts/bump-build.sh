#!/bin/bash
set -euo pipefail
VERSION_FILE="$(cd "$(dirname "$0")/.." && pwd)/Config/Version.xcconfig"
python3 - "$VERSION_FILE" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
pattern = r'(?m)^CURRENT_PROJECT_VERSION[ \t]*=[ \t]*([0-9]+)[ \t]*$'
matches = list(re.finditer(pattern,text))
if len(matches) != 1:
    sys.exit('CURRENT_PROJECT_VERSION doit être un entier unique')
version = int(matches[0].group(1))+1
path.write_text(re.sub(pattern,f'CURRENT_PROJECT_VERSION = {version}',text))
print(f'Build {version}')
PY
