#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COQUI_TTS_DIR="${COQUI_TTS_DIR:-$ROOT_DIR/../serverTTS}"
COQUI_TTS_URL="${COQUI_TTS_URL:-http://127.0.0.1:8020}"
ALIGNMENT_URL="${ALIGNMENT_URL:-http://127.0.0.1:8021}"
ALIGNMENT_VENV="${ALIGNMENT_VENV:-$COQUI_TTS_DIR/ai/alignment/.venv}"

if [ ! -x "$COQUI_TTS_DIR/scripts/run-dev.sh" ]; then
    echo "Coqui TTS launcher not found: $COQUI_TTS_DIR/scripts/run-dev.sh" >&2
    echo "Set COQUI_TTS_DIR to the serverTTS directory or restore the service." >&2
    exit 1
fi

# Non avviare un secondo stack su una porta già occupata: altrimenti il
# browser continua a parlare con il vecchio PHP, spesso con limiti upload
# differenti, mentre questo script sembra comunque avviato.
if lsof -tiTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 8000 is already in use. Stop the existing development server before running ./dev.sh." >&2
    exit 1
fi

# Avvia il backend Laravel. I file media possono arrivare fino a 50 MB,
# quindi il server di sviluppo deve accettare multipart più grandi dei
# valori predefiniti PHP (2 MB upload / 8 MB POST).
cd "$ROOT_DIR"
(
    cd "$ROOT_DIR/public"
    exec php -d upload_max_filesize=64M -d post_max_size=64M -d memory_limit=256M \
        -S 127.0.0.1:8000 "$ROOT_DIR/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"
) &
LARAVEL_PID=$!

# Avvia il frontend Vite
npm run dev &
FRONT_PID=$!

# Avvia Coqui XTTS solo se non è già disponibile. Questo permette di
# rilanciare lo stack senza interrompere una sintesi già in corso.
COQUI_TTS_PID=""
ALIGNMENT_PID=""
if ! curl -fsS "$ALIGNMENT_URL/v1/health" >/dev/null; then
    "$ALIGNMENT_VENV/bin/python" "$COQUI_TTS_DIR/service/alignment_service.py" &
    ALIGNMENT_PID=$!
fi

if ! curl -fsS "$COQUI_TTS_URL/v1/health" >/dev/null; then
    "$COQUI_TTS_DIR/scripts/run-dev.sh" &
    COQUI_TTS_PID=$!
fi

cleanup() {
    kill "$LARAVEL_PID" "$FRONT_PID" 2>/dev/null || true

    if [ -n "$COQUI_TTS_PID" ]; then
        kill "$COQUI_TTS_PID" 2>/dev/null || true
    fi

    if [ -n "$ALIGNMENT_PID" ]; then
        kill "$ALIGNMENT_PID" 2>/dev/null || true
    fi
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

ALIGNMENT_READY=false
for _ in {1..15}; do
    if curl -fsS "$ALIGNMENT_URL/v1/health" >/dev/null; then
        ALIGNMENT_READY=true
        break
    fi
    sleep 1
done

if [ "$ALIGNMENT_READY" != true ]; then
    echo "WhisperX alignment did not become ready at $ALIGNMENT_URL within 15 seconds." >&2
    exit 1
fi

echo "Coqui TTS ready: $COQUI_TTS_URL"
echo "WhisperX alignment ready: $ALIGNMENT_URL"

wait
