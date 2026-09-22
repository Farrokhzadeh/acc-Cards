set -euo pipefail

info()  { printf '\033[0;32m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[0;33m[warn]\033[0m %s\n' "$1"; }
error() { printf '\033[0;31m[error]\033[0m %s\n' "$1" >&2; }
die()   { error "$1"; exit "${2:-1}"; }

if [ "$(id -u)" -ne 0 ]; then
  die "Please run as root:  sudo bash $0"
fi

if ! command -v nginx >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[error] nginx is NOT installed.

This script does not install nginx for you. Please install it FIRST,
then re-run this script.

  Debian / Ubuntu:
      sudo apt update && sudo apt install -y nginx

  RHEL / CentOS / Rocky / AlmaLinux:
      sudo dnf install -y nginx        (or: sudo yum install -y nginx)

  Fedora:
      sudo dnf install -y nginx

After installing, start it and re-run this script:
      sudo systemctl enable --now nginx
      sudo bash nginx-add-domain.sh
MSG
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[error] certbot is NOT installed (it is required to request the SSL certificate).

This script does not install it for you. Please install it FIRST,
then re-run this script.

  Debian / Ubuntu:
      sudo apt update && sudo apt install -y certbot python3-certbot-nginx

  RHEL / CentOS / Rocky / AlmaLinux / Fedora:
      sudo dnf install -y certbot python3-certbot-nginx

  Anywhere (snap):
      sudo snap install --classic certbot

Then re-run:  sudo bash nginx-add-domain.sh
MSG
  exit 1
fi

info "Found nginx and certbot."

if command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet nginx; then
  info "nginx is installed but not running - starting it..."
  systemctl enable --now nginx || warn "Could not start nginx via systemctl; continuing."
fi

read -rp "Domain to add (e.g. panel.example.com): " DOMAIN
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if ! printf '%s' "$DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'; then
  die "Invalid domain: '$DOMAIN'."
fi

read -rp "Email for Let's Encrypt notices: " EMAIL
if ! printf '%s' "$EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
  die "Invalid email: '$EMAIL'."
fi

read -rp "Backend to proxy to [http://127.0.0.1:3000]: " BACKEND
BACKEND="${BACKEND:-http://127.0.0.1:3000}"

if [ -d /etc/nginx/sites-available ]; then
  USE_SITES=1
  CONF_PATH="/etc/nginx/sites-available/$DOMAIN"
  ENABLE_PATH="/etc/nginx/sites-enabled/$DOMAIN"
else
  USE_SITES=0
  CONF_PATH="/etc/nginx/conf.d/$DOMAIN.conf"
fi

if [ -e "$CONF_PATH" ]; then
  die "A config for '$DOMAIN' already exists at $CONF_PATH. Rename/remove it first, or it's already set up."
fi

if command -v getent >/dev/null 2>&1 && ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
  warn "'$DOMAIN' does not resolve yet. SSL issuance requires its DNS A/AAAA record to point at THIS server."
  read -rp "Continue anyway? [y/N]: " cont
  [[ "$cont" =~ ^[Yy]$ ]] || die "Aborted (no changes made)."
fi

info "Writing nginx config: $CONF_PATH"
cat > "$CONF_PATH" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass $BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
    }
}
EOF

if [ "$USE_SITES" -eq 1 ]; then
  ln -sf "$CONF_PATH" "$ENABLE_PATH"
fi

info "Testing nginx configuration (nginx -t)..."
if ! nginx -t; then
  rm -f "$CONF_PATH"
  [ "$USE_SITES" -eq 1 ] && rm -f "$ENABLE_PATH"
  die "nginx config test failed - removed the new config. See errors above."
fi

info "Reloading nginx..."
systemctl reload nginx 2>/dev/null || nginx -s reload

info "Requesting Let's Encrypt certificate for $DOMAIN and enabling HTTPS..."
if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  die "certbot could not issue the certificate. Common causes: DNS for '$DOMAIN' not pointing at this server, port 80 unreachable, or the nginx plugin is missing (install python3-certbot-nginx). The HTTP config is still in place at $CONF_PATH."
fi

info "Done!"
echo
echo "  • Site config : $CONF_PATH"
echo "  • HTTPS       : enabled, with automatic HTTP -> HTTPS redirect"
echo "  • Proxying to : $BACKEND"
echo "  • Auto-renew  : certbot timer/cron (test with: sudo certbot renew --dry-run)"
echo
echo "Verify:  curl -I https://$DOMAIN"
