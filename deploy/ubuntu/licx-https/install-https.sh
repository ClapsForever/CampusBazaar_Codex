#!/usr/bin/env bash
set -euo pipefail

# Run once as root after reviewing the prepared files. No service on port 80
# is changed; the existing licx API, Agent and Nginx remain user services.
cb_https_stage=/home/licx/campusbazaar/ops/licx-https
cb_https_unit=campusbazaar-licx-https.service

if [[ $EUID -ne 0 ]]; then
    echo 'Run this prepared installer with sudo.' >&2
    exit 1
fi

test -f "$cb_https_stage/caddy"
test -f "$cb_https_stage/caddy.sha256"
test -f "$cb_https_stage/Caddyfile"
test -f "$cb_https_stage/$cb_https_unit"
(cd "$cb_https_stage" && sha256sum --check caddy.sha256)

if ! systemctl is-active --quiet "$cb_https_unit"; then
    if [[ -n $(ss -H -ltn 'sport = :443') ]]; then
        echo 'Port 443 is already used by another service; no changes made.' >&2
        exit 1
    fi
fi

if [[ -e "/etc/systemd/system/$cb_https_unit" ]] &&
   ! cmp -s "$cb_https_stage/$cb_https_unit" "/etc/systemd/system/$cb_https_unit"; then
    echo 'A different HTTPS service unit exists; review it before proceeding.' >&2
    exit 1
fi

install -d -m 0755 /opt/campusbazaar-licx-https /etc/campusbazaar-licx-https
install -d -m 0700 -o licx -g licx /home/licx/campusbazaar/https
install -d -m 0700 -o licx -g licx /home/licx/campusbazaar/https/data /home/licx/campusbazaar/https/config
install -m 0755 "$cb_https_stage/caddy" /opt/campusbazaar-licx-https/caddy
install -m 0644 "$cb_https_stage/Caddyfile" /etc/campusbazaar-licx-https/Caddyfile
runuser -u licx -- /opt/campusbazaar-licx-https/caddy validate --config /etc/campusbazaar-licx-https/Caddyfile --adapter caddyfile
install -m 0644 "$cb_https_stage/$cb_https_unit" "/etc/systemd/system/$cb_https_unit"
systemd-analyze verify "/etc/systemd/system/$cb_https_unit"

# Cloud-side inbound TCP 443 must be allowed separately for TLS-ALPN issuance.
# Nginx retains the existing application IP allowlist.
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
    ufw allow 443/tcp
fi
systemctl daemon-reload
systemctl enable --now "$cb_https_unit"
systemctl --no-pager --full status "$cb_https_unit"
echo 'HTTPS listener installed. A publicly reachable TCP 443 is required to issue its certificate.'
