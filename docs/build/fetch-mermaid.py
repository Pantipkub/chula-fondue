#!/usr/bin/env python3
"""Fetch the pinned offline rendering bundle without changing npm dependencies."""
import hashlib
import io
from pathlib import Path
import sys
import tarfile
from urllib.request import urlopen

target = Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/chula-proposal/mermaid.min.js')
target.parent.mkdir(parents=True, exist_ok=True)
with urlopen('https://registry.npmjs.org/mermaid/-/mermaid-11.12.0.tgz', timeout=60) as response:
    payload = response.read()
with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
    bundle = archive.extractfile('package/dist/mermaid.min.js').read()
target.write_bytes(bundle)
print(f'Mermaid 11.12.0: {target}; SHA-256 {hashlib.sha256(bundle).hexdigest()}')
