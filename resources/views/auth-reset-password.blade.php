<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Reset password · Audiobook Tools</title>
        @vite(['resources/css/app.css'])
    </head>
    <body>
        <main class="auth-reset-page">
            <a class="brand" href="{{ url('/en') }}" aria-label="Audiobook Tools">
                <span class="brand-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>
                <span>Audiobook Tools</span>
            </a>
            <section class="auth-reset-card" aria-labelledby="reset-password-title">
                <span class="home-auth-eyebrow">Account security</span>
                <h1 id="reset-password-title">Create a new password</h1>
                <p>Choose a strong password with at least eight characters.</p>
                <form method="post" action="{{ route('password.update') }}">
                    @csrf
                    <input type="hidden" name="token" value="{{ $token }}">
                    <label>Email<input name="email" type="email" value="{{ old('email', $email) }}" autocomplete="email" required autofocus></label>
                    <label>New password<input name="password" type="password" autocomplete="new-password" required></label>
                    <label>Confirm new password<input name="password_confirmation" type="password" autocomplete="new-password" required></label>
                    @if ($errors->any())<p class="auth-reset-error" role="alert">{{ $errors->first() }}</p>@endif
                    <button class="button button-primary" type="submit">Reset password</button>
                </form>
            </section>
        </main>
    </body>
</html>
