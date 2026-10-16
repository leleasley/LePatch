#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build lepatch
docker compose up -d
docker image prune -f
