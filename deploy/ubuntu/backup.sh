#!/usr/bin/env bash
# Run as root in a maintenance window. This pauses the API, not the Agent.
set -euo pipefail
umask 077

if [[ "$(id -u)" != 0 ]]; then
  printf '%s\n' 'Run with sudo bash backup.sh' >&2
  exit 1
fi
if ! systemctl is-active --quiet campusbazaar-api.service; then
  printf '%s\n' 'API must be active before this maintenance backup.' >&2
  exit 1
fi
install -d -m 0700 /var/backups/campusbazaar
cb_archive="/var/backups/campusbazaar/$(date -u +%Y%m%dT%H%M%S)-$$.tar.gz"
trap 'systemctl start campusbazaar-api.service' EXIT
systemctl stop campusbazaar-api.service
tar -czf "$cb_archive" -C / var/lib/campusbazaar etc/campusbazaar
printf 'Backup created: %s\n' "$cb_archive"
