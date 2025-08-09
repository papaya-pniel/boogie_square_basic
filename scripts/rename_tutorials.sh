#!/bin/zsh
set -euo pipefail

# Rename: "pattern 1_01.mp4" -> "pattern-1_01.mp4" (and uppercase 'Pattern ')
# Searches under public/tutorial_*/

autoload -Uz is-at-least 2>/dev/null || true

# Use null-delimited find to handle spaces safely
find public -type f \( -ipath 'public/tutorial_*/*' -a -iname 'pattern [1-3]_*.mp4' -o -ipath 'public/tutorial_*/*' -a -iname 'Pattern [1-3]_*.mp4' \) -print0 |
while IFS= read -r -d '' f; do
  dir="${f:h}"
  base="${f:t}"
  new="$base"
  new="${new//pattern /pattern-}"
  new="${new//Pattern /Pattern-}"
  if [[ "$base" != "$new" ]]; then
    echo "Renaming: $base -> $new"
    mv -- "$f" "$dir/$new"
  fi
done
