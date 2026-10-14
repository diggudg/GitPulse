#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The macOS DMG installer can only be built on macOS." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install the project package manager and retry." >&2
  exit 1
fi

cd "$ROOT_DIR"
pnpm tauri build --bundles dmg --no-sign

DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
shopt -s nullglob
DMG_FILES=("$DMG_DIR"/*.dmg)

if (( ${#DMG_FILES[@]} == 0 )); then
  echo "Tauri completed without producing a DMG in $DMG_DIR." >&2
  exit 1
fi

printf 'Created macOS installer(s) in the project root:\n'
for dmg in "${DMG_FILES[@]}"; do
  cp "$dmg" "$ROOT_DIR/"
  printf '  %s\n' "$ROOT_DIR/$(basename "$dmg")"
done
