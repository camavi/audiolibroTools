# Deployment and release checklist

## Production configuration

- Set `APP_ENV=production`, `APP_DEBUG=false` and a public `APP_URL`.
- Generate a unique `APP_KEY`; never copy the development key.
- Use persistent database, cache and queue backends. Run a supervised worker with `php artisan queue:work --tries=3 --timeout=1800`.
- Set `SESSION_SECURE_COOKIE=true`, `SESSION_ENCRYPT=true` and an explicit `SESSION_DOMAIN` when HTTPS is enabled.
- Configure `QWEN_TTS_URL`, an optional `QWEN_TTS_API_KEY`, and `QWEN_TTS_TIMEOUT=900`. The first Voice Design request can take several minutes while Qwen loads its model.

## Release commands

```bash
composer install --no-dev --optimize-autoloader
npm ci
npm run build
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan queue:restart
```

Run `php artisan test` before release. Do not cache configuration until every production environment variable is present.

## Security controls

- Dashboard pages and `/dashboard/api/*` require an authenticated session.
- Login and registration are limited to five attempts per minute per IP.
- Qwen Voice Design is limited to three requests per minute per account (or IP before login).
- Keep provider keys only in environment variables or encrypted application credentials; never put them in JavaScript, commits or browser storage.

## Manual QA before release

Status: approved on 2026-08-23.

Check the public site and signed-in dashboard at 320 px, 768 px and 1440 px widths.

- Navigate the login dialog, dashboard drawer, forms, dialogs and editor using only the keyboard.
- Confirm visible focus, labelled icon-only buttons, meaningful image alternatives and error messages announced with `role="alert"`.
- Create a voice with the `deep` tone and wait for a cold Qwen start; it may run for up to 15 minutes without a PHP timeout.
- Verify ePub/PDF downloads, audio streaming, upload limits and a logout/login cycle.

## Operational monitoring

Monitor failed jobs, queue depth, disk usage under `storage/app/public`, application logs and Qwen process health. Investigate repeated 429, 422, 502 or failed-job events before they affect a release.
