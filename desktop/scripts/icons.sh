#!/bin/sh
# Regenerate the app icons from the ISBE brand mark (build/isbe-logo.svg).
# macOS only: needs rsvg-convert and ImageMagick (brew install librsvg imagemagick).
set -eu
cd "$(dirname "$0")/.."
paths=$(sed -E 's/^<svg[^>]*>//; s#</svg>[[:space:]]*$##' build/isbe-logo.svg)

# App icon: macOS grid (824px tile on a 1024 canvas), brand colours on white.
tmp=$(mktemp -d)
cat > "$tmp/icon.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eee8fb"/></linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#1b1035" flood-opacity="0.28"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#tile)" filter="url(#shadow)"/>
  <g transform="translate(237 254) scale(11)" fill="none">$paths</g>
</svg>
SVG
rsvg-convert -w 1024 -h 1024 "$tmp/icon.svg" -o build/icon.png
set_dir="$tmp/icon.iconset"; mkdir "$set_dir"
for s in 16 32 128 256 512; do
  rsvg-convert -w $s -h $s "$tmp/icon.svg" -o "$set_dir/icon_${s}x${s}.png"
  rsvg-convert -w $((s * 2)) -h $((s * 2)) "$tmp/icon.svg" -o "$set_dir/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$set_dir" -o build/icon.icns
magick "$set_dir/icon_16x16.png" "$set_dir/icon_32x32.png" "$set_dir/icon_32x32@2x.png" \
  "$set_dir/icon_128x128.png" "$set_dir/icon_256x256.png" build/icon.ico
rm -rf "$tmp"
echo "Icons written to build/"
