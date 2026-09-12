#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Il fork operativo contiene il runtime MLX, i modelli locali e il servizio
# Audiobook Tools. QWEN_TTS_DIR resta disponibile per un percorso alternativo.
QWEN_TTS_DIR="${QWEN_TTS_DIR:-$ROOT_DIR/../qwen3-TTS-AT}"
QWEN_TTS_URL="${QWEN_TTS_URL:-http://127.0.0.1:8020}"

qwen_service_ready() {
    curl -fsS "$QWEN_TTS_URL/v1/health" | grep -q '"api_version": 6'
}

if [ ! -x "$QWEN_TTS_DIR/scripts/run-dev.sh" ]; then
    echo "Qwen3-TTS launcher not found: $QWEN_TTS_DIR/scripts/run-dev.sh" >&2
    echo "Set QWEN_TTS_DIR to the qwen3-TTS-AT directory or restore the service." >&2
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

# La sintesi audio e il render delle release vengono accodati fuori dalla
# richiesta HTTP, così la dashboard resta utilizzabile. Il render di un libro
# completo può richiedere più di 30 minuti.
# In sviluppo `queue:listen` ricarica Laravel fra un job e l'altro, quindi
# modifiche ai servizi TTS diventano effettive senza dover riavviare lo stack.
php artisan queue:listen database --queue=tts,audio-release --timeout=7200 --tries=1 &
TTS_WORKER_PID=$!

# Le correzioni e le traduzioni batch restano in coda anche se il browser
# viene ricaricato. Il worker separato evita di bloccare la coda audio.
php artisan queue:listen database --queue=default --timeout=360 --tries=1 &
AI_WORKER_PID=$!

# Il guardiano recupera i batch Correct senza aggiornamenti: per esempio dopo
# un crash del worker o un riavvio mentre LM Studio stava elaborando un blocco.
php artisan schedule:work &
SCHEDULER_PID=$!

# Avvia Qwen3-TTS solo se non è già disponibile. Questo permette di
# rilanciare lo stack senza interrompere una sintesi già in corso.
QWEN_TTS_PID=""
if curl -fsS "$QWEN_TTS_URL/v1/health" >/dev/null && ! qwen_service_ready; then
    echo "An older Qwen3-TTS service is running at $QWEN_TTS_URL. Stop it and restart ./dev.sh to load the current API." >&2
    exit 1
fi

if ! qwen_service_ready; then
    "$QWEN_TTS_DIR/scripts/run-dev.sh" &
    QWEN_TTS_PID=$!
fi

cleanup() {
    kill "$LARAVEL_PID" "$FRONT_PID" "$TTS_WORKER_PID" "$AI_WORKER_PID" "$SCHEDULER_PID" 2>/dev/null || true

    if [ -n "$QWEN_TTS_PID" ]; then
        kill "$QWEN_TTS_PID" 2>/dev/null || true
    fi
}

# Ferma tutti i servizi su Ctrl+C o alla chiusura dello script.
trap cleanup EXIT INT TERM

TTS_READY=false
for _ in {1..30}; do
    if qwen_service_ready; then
        TTS_READY=true
        break
    fi
    sleep 1
done

if [ "$TTS_READY" != true ]; then
    echo "Qwen3-TTS did not become ready at $QWEN_TTS_URL within 30 seconds." >&2
    exit 1
fi

echo "Qwen3-TTS ready: $QWEN_TTS_URL"

wait
