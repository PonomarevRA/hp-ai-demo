#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT/release"
LAUNCHER_CACHE="$(mktemp -d)"

cleanup() {
  rm -rf "$LAUNCHER_CACHE"
}
trap cleanup EXIT

build_runtime() {
  local runtime="$1"
  local folder="$2"
  local zip_name="$3"
  local out="$RELEASE_DIR/$folder"

  if [[ -d "$out" ]]; then
    mkdir -p "$LAUNCHER_CACHE/$folder"
    for file in start-mac.command stop-mac.command start-windows.bat stop-windows.bat; do
      if [[ -f "$out/$file" ]]; then
        cp "$out/$file" "$LAUNCHER_CACHE/$folder/$file"
      fi
    done
    find "$out" -mindepth 1 -maxdepth 1 ! -name "start-mac.command" ! -name "stop-mac.command" ! -name "start-windows.bat" ! -name "stop-windows.bat" -exec rm -rf {} +
  fi

  echo "Publishing $runtime -> release/$folder ..."
  dotnet publish "$ROOT/historic-portfolio-ai.csproj" \
    -c Release \
    -r "$runtime" \
    --self-contained true \
    -o "$out" \
    /p:PublishSingleFile=false

  if [[ -d "$LAUNCHER_CACHE/$folder" ]]; then
    cp "$LAUNCHER_CACHE/$folder/"* "$out/" 2>/dev/null || true
    chmod +x "$out/start-mac.command" "$out/stop-mac.command" 2>/dev/null || true
  fi

  local zip_path="$RELEASE_DIR/$zip_name"
  echo "Creating $zip_name ..."
  rm -f "$zip_path"
  (
    cd "$out"
    find . -name "*.pid" -delete
    zip -qr "$zip_path" . -x "*.pid"
  )

  echo "Built release/$folder and $zip_name"
}

build_runtime "osx-arm64" "mac-arm64" "historic-portfolio-ai-mac-arm64.zip"
build_runtime "osx-x64" "mac-x64" "historic-portfolio-ai-mac-x64.zip"
build_runtime "win-x64" "windows" "historic-portfolio-ai-windows.zip"

echo "Release builds are ready:"
ls -lh "$RELEASE_DIR"/*.zip
