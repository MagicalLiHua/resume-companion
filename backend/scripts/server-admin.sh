#!/usr/bin/env bash
set -euo pipefail
backend_root_dir="$(cd "$(dirname "$0")/.." && pwd)"
admin_command="${1:?Usage: server-admin.sh init|issue|revoke|list|allow-origin|enable-web|enable-personal-models [arguments]}"
shift
case "$admin_command" in init|issue|revoke|list|allow-origin|enable-web|enable-personal-models) ;; *) exit 2 ;; esac
if [ "$admin_command" = init ]; then
  mkdir -p "$backend_root_dir/.runtime"
  chmod 700 "$backend_root_dir/.runtime"
  admin_location=(--directory /run/resume)
else
  admin_location=(--config /run/resume/config.json)
fi
exec docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
  -v "$backend_root_dir/.runtime:/run/resume:rw" \
  resume-companion-api:0.4.0 python -m app.admin "$admin_command" \
  "${admin_location[@]}" "$@"
