#!/usr/bin/env bash
# Rebuild the Netlify Drop zip from the canonical build in app/.
# Produces salty-schooner-app.zip at the repo root, with index.html at the
# archive root (NOT nested in app/), which is what Netlify Drop requires.
#
# Usage: ./build-drop-zip.sh
# Then download salty-schooner-app.zip and drag it onto https://app.netlify.com/drop
set -euo pipefail
cd "$(dirname "$0")/app"
rm -f ../salty-schooner-app.zip
zip -r -q ../salty-schooner-app.zip index.html assets
cd ..
echo "Built salty-schooner-app.zip:"
ls -lh salty-schooner-app.zip
echo "Top of archive (index.html must be at root):"
unzip -l salty-schooner-app.zip | sed -n '1,6p'
