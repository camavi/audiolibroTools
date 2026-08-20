<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" dir="{{ config('audiobook.locales.' . app()->getLocale() . '.direction', 'ltr') }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title>{{ __('home.meta_title') }}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0,0" rel="stylesheet">
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body>
        <div class="site-shell">
            <header class="site-header">
                <a class="brand" href="{{ url('/' . app()->getLocale()) }}" aria-label="{{ __('home.brand') }}">
                    <span class="brand-wave" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span>
                    </span>
                    <span>{{ __('home.brand') }}</span>
                </a>

                <nav class="main-nav" aria-label="Main navigation">
                    @foreach (trans('home.nav') as $item)
                        <a href="#{{ $item['target'] }}">{{ $item['label'] }}</a>
                    @endforeach
                </nav>

                <div class="header-actions">
                    <label class="locale-switcher" aria-label="Language">
                        <span class="material-symbols-rounded" aria-hidden="true">language</span>
                        <select onchange="window.location.assign(this.value)">
                            @foreach (config('audiobook.locales') as $locale => $localeConfig)
                                <option value="{{ url('/' . $locale) }}" @selected(app()->getLocale() === $locale)>{{ strtoupper($locale) }} · {{ $localeConfig['name'] }}</option>
                            @endforeach
                        </select>
                    </label>
                    <button class="login-link home-auth-trigger" type="button" data-auth-mode="login">{{ __('home.login') }}</button>
                    <button class="button button-primary home-auth-trigger" type="button" data-auth-mode="register">{{ __('home.primary_cta') }}</button>
                </div>
            </header>

            <main>
                <section class="hero" id="features">
                    <div class="hero-grid">
                        <div class="hero-copy-block">
                            <span class="eyebrow">{{ __('home.eyebrow') }}</span>
                            <h1>{!! __('home.headline_html') !!}</h1>
                            <p class="hero-copy">{{ __('home.copy') }}</p>

                            <div class="hero-actions">
                                <button class="button button-primary button-large home-auth-trigger" type="button" data-auth-mode="register">
                                    {{ __('home.primary_cta') }}
                                    <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                                </button>
                                <a class="button button-ghost button-large" href="#demo">
                                    {{ __('home.demo_cta') }}
                                    <span class="material-symbols-rounded" aria-hidden="true">play_circle</span>
                                </a>
                            </div>

                            <div class="social-proof">
                                <p>{{ __('home.social_proof') }}</p>
                                <div class="proof-row">
                                    <div class="avatar-stack" aria-hidden="true">
                                        @foreach (['#ffb86b', '#7dd3fc', '#fda4af', '#c4b5fd', '#86efac', '#fde68a'] as $color)
                                            <span style="--avatar-bg: {{ $color }}"></span>
                                        @endforeach
                                    </div>
                                    <span class="proof-badge">2.1K+</span>
                                    <strong>{{ __('home.active_users') }}</strong>
                                </div>
                            </div>
                        </div>

                        <div class="hero-visual" aria-label="Audiobook editor preview">
                            @if (file_exists(public_path('assets/images/hero-audiobook-tool.png')))
                                <img
                                    src="{{ asset('assets/images/hero-audiobook-tool.png') }}"
                                    alt="{{ __('home.hero_image_alt') }}"
                                >
                            @else
                                <div class="hero-image-missing">
                                    <span class="material-symbols-rounded" aria-hidden="true">image</span>
                                    <p>{{ __('home.hero_image_missing') }}</p>
                                    <code>public/assets/images/hero-audiobook-tool.png</code>
                                </div>
                            @endif
                        </div>
                    </div>
                </section>

                <section class="feature-band">
                    <h2>{{ __('home.features_title_prefix') }} <span>{{ __('home.features_title_highlight') }}</span></h2>
                    <div class="feature-grid">
                        @foreach (trans('home.features') as $feature)
                            <article class="feature-card">
                                <span class="feature-icon {{ $feature['tone'] }}">
                                    <span class="material-symbols-rounded" aria-hidden="true">{{ $feature['icon'] }}</span>
                                </span>
                                <div>
                                    <h3>{{ $feature['title'] }}</h3>
                                    <p>{{ $feature['copy'] }}</p>
                                </div>
                            </article>
                        @endforeach
                    </div>
                </section>

                <section class="metrics-band">
                    <div class="metric-list">
                        @foreach (trans('home.metrics') as $metric)
                            <div class="metric-item">
                                <span class="material-symbols-rounded {{ $metric['tone'] }}" aria-hidden="true">{{ $metric['icon'] }}</span>
                                <div>
                                    <strong>{{ $metric['value'] }}</strong>
                                    <p>{{ $metric['label'] }}</p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                    <blockquote>
                        <div class="stars" aria-hidden="true">★★★★★</div>
                        <p>{{ __('home.testimonial') }}</p>
                        <cite>{{ __('home.testimonial_author') }}</cite>
                    </blockquote>
                </section>

                <section class="final-cta" id="signup">
                    <h2>{{ __('home.final_cta_title') }}</h2>
                    <p>{{ __('home.final_cta_copy') }}</p>
                    <button class="button button-primary button-large home-auth-trigger" type="button" data-auth-mode="register">
                        {{ __('home.primary_cta') }}
                        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                    </button>
                </section>
            </main>
        </div>
        <div class="home-auth-modal" id="home-auth-modal" hidden>
            <div class="home-auth-backdrop" data-auth-close></div>
            <section class="home-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="home-auth-title">
                <button class="home-auth-close" type="button" data-auth-close aria-label="Close">×</button>
                <span class="home-auth-eyebrow">Audiobook Tools</span>
                <h2 id="home-auth-title">Welcome back</h2>
                <p id="home-auth-copy">Sign in to continue to your workspace.</p>
                <form id="home-auth-form" novalidate>
                    <div class="home-auth-field home-auth-name" hidden><label for="home-auth-name">Name</label><input id="home-auth-name" name="name" autocomplete="name"></div>
                    <div class="home-auth-field"><label for="home-auth-email">Email</label><input id="home-auth-email" name="email" type="email" autocomplete="email" required></div>
                    <div class="home-auth-field"><label for="home-auth-password">Password</label><input id="home-auth-password" name="password" type="password" autocomplete="current-password" required></div>
                    <div class="home-auth-field home-auth-confirm" hidden><label for="home-auth-confirm">Confirm password</label><input id="home-auth-confirm" name="password_confirmation" type="password" autocomplete="new-password"></div>
                    <label class="home-auth-remember"><input id="home-auth-remember" type="checkbox"> Keep me signed in</label>
                    <p class="home-auth-error" id="home-auth-error" role="alert" hidden></p>
                    <button class="button button-primary home-auth-submit" type="submit">Sign in</button>
                </form>
                <p class="home-auth-switch"><span id="home-auth-switch-copy">New to Audiobook Tools?</span> <button type="button" id="home-auth-switch">Create an account</button></p>
            </section>
        </div>
    </body>
</html>
