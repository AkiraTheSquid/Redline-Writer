#!/usr/bin/env bash
# Regenerate build/icon.png (1024px master) from build/icon.svg.
#
# Only needed when the SVG changes. Everything downstream — electron-builder and
# install-desktop.sh — consumes the PNG master, so the SVG is rendered exactly
# once, here, by something that renders it correctly.
#
# Why not ImageMagick: `convert` has no librsvg delegate installed on this
# machine and falls back to its internal MSVG renderer, which ignores the icon's
# clipPath and emits an inverted white square with the artwork missing. It fails
# silently — a valid PNG, wrong picture. cairosvg gets it right and needs no root.
#
# Run via: npm run render:icon
set -euo pipefail

cd "$(dirname "$0")/.."

SVG="build/icon.svg"
PNG="build/icon.png"
VENV="build/.iconvenv"

if [ ! -f "$SVG" ]; then
  echo "No $SVG to render." >&2
  exit 1
fi

if [ ! -x "$VENV/bin/python" ]; then
  echo "==> Creating icon-render virtualenv..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q cairosvg
fi

echo "==> Rendering $SVG -> $PNG (1024px)"
"$VENV/bin/python" - "$SVG" "$PNG" <<'PY'
import sys
import cairosvg

svg, png = sys.argv[1], sys.argv[2]
cairosvg.svg2png(url=svg, write_to=png, output_width=1024, output_height=1024)
PY

echo "==> Done. Verify it visually before packaging — a wrong render still exits 0."
