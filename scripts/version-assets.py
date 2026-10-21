"""Version local JS/CSS URLs by content to prevent mixed cached deployments.

Run after changing frontend assets, before committing: python scripts/version-assets.py
Use --check in verification to detect stale references without changing files.
"""
import hashlib
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
entry = root / 'index.html'
original = entry.read_text(encoding='utf-8')

def version(match):
    path = match.group('path')
    asset = (root / path).resolve()
    if not asset.is_relative_to(root) or not asset.is_file():
        raise ValueError('Missing or invalid local asset: ' + path)
    digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    quote = match.group('quote')
    return match.group('prefix') + quote + path + '?v=' + digest + quote

pattern = r'(?P<prefix>(?:src|href)=)(?P<quote>["\x27])(?P<path>(?!https?:|//)[a-zA-Z0-9_./-]+\.(?:js|css))(?:\?[^"\x27]*)?(?P=quote)'
updated = re.sub(pattern, version, original)
if '--check' in sys.argv:
    if updated != original:
        raise SystemExit('Stale asset versions; run python scripts/version-assets.py')
    print('All local JS/CSS references match their content hashes.')
else:
    entry.write_text(updated, encoding='utf-8')
    print('Updated local JS/CSS URLs with content hashes.')
