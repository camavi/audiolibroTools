#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COQUI_TTS_DIR="${COQUI_TTS_DIR:-$ROOT_DIR/../serverTTS}"
COQUI_TTS_URL="${COQUI_TTS_URL:-http://127.0.0.1:8020}"

if [ ! -x "$COQUI_TTS_DIR/scripts/run-dev.sh" ]; then
    echo "Coqui TTS launcher not found: $COQUI_TTS_DIR/scripts/run-dev.sh" >&2
    echo "Set COQUI_TTS_DIR to the serverTTS directory or restore the service." >&2
    exit 1
fi

# Avvia il backend Laravel
cd "$ROOT_DIR"
php artisan serve &
LARAVEL_PID=$!

# Avvia il frontend Vite
npm run dev &
FRONT_PID=$!

# Avvia Coqui XTTS (http://127.0.0.1:8020)
"$COQUI_TTS_DIR/scripts/run-dev.sh" &
COQUI_TTS_PID=$!

cleanup() {
    kill "$LARAVEL_PID" "$FRONT_PID" "$COQUI_TTS_PID" 2>/dev/null || true
}

# Ferma tutti i servizi su Ctrl+C o alla chiusura dello script.
trap cleanup EXIT INT TERM

TTS_READY=false
for _ in {1..30}; do
    if curl -fsS "$COQUI_TTS_URL/v1/health" >/dev/null; then
        TTS_READY=true
        break
    fi
    sleep 1
done

if [ "$TTS_READY" != true ]; then
    echo "Coqui TTS did not become ready at $COQUI_TTS_URL within 30 seconds." >&2
    exit 1
fi

echo "Coqui TTS ready: $COQUI_TTS_URL"

wait
