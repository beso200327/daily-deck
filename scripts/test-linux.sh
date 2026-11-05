#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Official image pinned to its verified registry digest. Preserve managed Docker credentials/proxy defaults.
exec env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock run --rm --network none \
  --user "$(id -u):$(id -g)" \
  -e XDG_CACHE_HOME=/tmp/dailydeck-cache \
  -e CLANG_MODULE_CACHE_PATH=/tmp/clang-cache \
  -e SWIFTPM_MODULECACHE_OVERRIDE=/tmp/swift-cache \
  --mount "type=bind,src=$(pwd),dst=/app" --workdir /app \
  swift@sha256:95f6ef898992dc840b35517e780f6f6db9661432775ab0b33cc0a531ea749bdb \
  swift test --scratch-path /tmp/dailydeck-build --jobs 4
