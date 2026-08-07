#!/usr/bin/env bash
# Install the built AppImage as a real desktop application for the current user:
# a launcher entry in the applications menu, a themed icon, and a stable install
# path so the entry keeps working after the repo is rebuilt or moved.
#
# Nothing here needs root — everything lands under ~/.local.
#
# Run via: npm run install:desktop   (after npm run dist)
set -euo pipefail

APP_ID="redline-writer"
APP_NAME="Redline Writer"

ELECTRON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_APPIMAGE="$ELECTRON_DIR/dist/RedlineWriter-0.1.0-x86_64.AppImage"

INSTALL_DIR="$HOME/.local/bin"
INSTALLED_APPIMAGE="$INSTALL_DIR/$APP_ID.AppImage"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_ROOT="$HOME/.local/share/icons/hicolor"

if [ ! -f "$SOURCE_APPIMAGE" ]; then
  echo "No AppImage at $SOURCE_APPIMAGE" >&2
  echo "Build it first:  npm run dist" >&2
  exit 1
fi

echo "==> Installing AppImage to $INSTALLED_APPIMAGE"
mkdir -p "$INSTALL_DIR"
# Copy to a stable path: the menu entry must not break when dist/ is rebuilt.
cp -f "$SOURCE_APPIMAGE" "$INSTALLED_APPIMAGE"
chmod +x "$INSTALLED_APPIMAGE"

echo "==> Installing icons"
# Downscale from the 1024px master, never from the SVG: ImageMagick's built-in
# renderer ignores the icon's clipPath and produces an inverted white blob.
# build/icon.png is rendered from build/icon.svg by scripts/render-icon.sh.
for size in 128 256 512 1024; do
  dir="$ICON_ROOT/${size}x${size}/apps"
  mkdir -p "$dir"
  convert "$ELECTRON_DIR/build/icon.png" \
    -resize "${size}x${size}" -depth 8 -define png:color-type=6 \
    "$dir/$APP_ID.png"
done
# GTK renders SVGs with librsvg, which handles the clipPath correctly, so the
# scalable entry can be the source file as-is.
mkdir -p "$ICON_ROOT/scalable/apps"
cp -f "$ELECTRON_DIR/build/icon.svg" "$ICON_ROOT/scalable/apps/$APP_ID.svg"

echo "==> Writing desktop entry"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/$APP_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
GenericName=Writing App
Comment=Timed writing sessions that delete your work if you stop typing
Exec=$INSTALLED_APPIMAGE %U
Icon=$APP_ID
Terminal=false
Categories=Office;WordProcessor;
Keywords=writing;write;focus;timer;draft;
StartupNotify=true
# Must match the window's real WM_CLASS, which Electron takes from package.json
# "name" (not productName). Verify with: xprop WM_CLASS
# If this is wrong the running window shows a generic icon and will not group
# with, or pin to, this launcher.
StartupWMClass=redline-writer-desktop
EOF

echo "==> Refreshing desktop & icon caches"
command -v update-desktop-database >/dev/null && \
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && \
  gtk-update-icon-cache -f -t "$ICON_ROOT" 2>/dev/null || true

if command -v desktop-file-validate >/dev/null; then
  desktop-file-validate "$DESKTOP_DIR/$APP_ID.desktop" && \
    echo "==> Desktop entry is valid"
fi

echo
echo "Installed. '$APP_NAME' is now in your applications menu."
echo "  binary:  $INSTALLED_APPIMAGE"
echo "  entry:   $DESKTOP_DIR/$APP_ID.desktop"
