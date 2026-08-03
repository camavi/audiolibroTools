#!/bin/bash

# Avvia il backend Laravel
php artisan serve &
LARAVEL_PID=$!

# Avvia il frontend Quasar
cd front
npm run dev &
FRONT_PID=$!

# Ferma entrambi su Ctrl+C
trap "kill $LARAVEL_PID $FRONT_PID" EXIT

wait 