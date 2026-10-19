#!/bin/sh
set -eu

if [ "$#" -ne 1 ] || ! printf '%s' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'; then
  echo "Usage: scripts/set-version.sh X.Y.Z[-suffix]" >&2
  exit 2
fi

printf '%s\n' "$1" > VERSION
echo "Set LePatch version to $1. No release was created."
echo "To build locally: APP_VERSION=$1 docker compose build lepatch"
