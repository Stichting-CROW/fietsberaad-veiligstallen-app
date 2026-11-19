#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
JAVA=$(readlink -f "$ROOT/buurtstallingen-broncode")
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE"
# The Java tree is a local symlink and is not part of this app's image.
tar -C "$JAVA" --exclude target --exclude reference --exclude .git -cf - . | tar -C "$STAGE" -xf -
mkdir -p "$STAGE/profiles/parity"
cp "$ROOT/e2e/engine-parity/config.properties" "$STAGE/profiles/parity/config.properties"
# The production whitelist blocks the Compose network. This image is only for the local suite.
sed -i 's#<param-value>127.0.0.1,85.17.202.131.*</param-value>#<param-value>0.0.0.0/0</param-value>#' "$STAGE/src/main/webapp/WEB-INF/web.xml"
# The default Maven profile bakes devlocal (H2). Point that profile at the parity properties.
sed -i 's#<build.profile.id>devlocal</build.profile.id>#<build.profile.id>parity</build.profile.id>#' "$STAGE/pom.xml"
docker build -f "$ROOT/e2e/engine-parity/Dockerfile" -t buurtstallingen-war "$STAGE"
