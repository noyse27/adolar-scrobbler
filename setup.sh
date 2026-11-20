#!/bin/sh
# Usage: ./setup.sh
#
# Creates .env from .env.example if it doesn't exist yet (JWT_SECRET,
# COOKIE_SECRET and POSTGRES_PASSWORD generated with openssl rand -hex 32),
# then brings up the Docker Compose stack. Safe to re-run: an existing .env,
# or an already-set secret in it, is never overwritten.
set -eu
cd "$(dirname "$0")"

env_file=".env"
example_file=".env.example"

if [ ! -f "$env_file" ]; then
  cp "$example_file" "$env_file"
  echo "$env_file aus $example_file erstellt."
fi

set_secret() {
  key="$1"
  current="$(grep "^${key}=" "$env_file" 2>/dev/null | tail -1 | cut -d= -f2-)"
  if [ -z "$current" ] || [ "$current" = "change-me" ] || [ "$current" = "change-me-to-a-long-random-string" ] || [ "$current" = "change-me-to-another-long-random-string" ]; then
    secret="$(openssl rand -hex 32)"
    if grep -q "^${key}=" "$env_file"; then
      sed "s#^${key}=.*#${key}=${secret}#" "$env_file" > "$env_file.tmp" && mv "$env_file.tmp" "$env_file"
    else
      printf '%s=%s\n' "$key" "$secret" >> "$env_file"
    fi
    echo "$env_file: $key zufällig erzeugt."
  fi
}

set_secret JWT_SECRET
set_secret COOKIE_SECRET
set_secret POSTGRES_PASSWORD
set_secret SETUP_TOKEN

docker compose --env-file "$env_file" -p adolar-scrobbler up --build -d

port="$(grep '^HOST_PORT=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2-)"
port="${port:-4000}"
setup_token="$(grep '^SETUP_TOKEN=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2-)"
echo "Adolar Scrobbler: http://localhost:$port"
echo ""
echo "Noch kein Account auf dieser Instanz? Gehe zu http://localhost:$port/register"
echo "und gib dieses Setup-Token ein, um den ersten (Admin-)Account anzulegen:"
echo "  $setup_token"
echo "Das Token wird nur für diesen allerersten Account gebraucht."
echo ""
echo "Vergiss nicht, PUBLIC_URL in $env_file auf deine echte Domain zu setzen, sobald ein Reverse Proxy davor steht."
