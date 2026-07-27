<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" dir="{{ config('audiobook.locales.' . app()->getLocale() . '.direction', 'ltr') }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    <div class="locale-switcher" aria-label="Language">
                        @foreach (['en', 'it'] as $locale)
                            <a class="{{ app()->getLocale() === $locale ? 'active' : '' }}" href="{{ url('/' . $locale) }}">
                                {{ strtoupper($locale) }}
                            </a>
                        @endforeach
                    </div>
                    <a class="login-link" href="#dashboard">{{ __('home.login') }}</a>
                    <a class="button button-primary" href="#signup">{{ __('home.primary_cta') }}</a>
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
                                <a class="button button-primary button-large" href="#signup">
                                    {{ __('home.primary_cta') }}
                                    <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                                </a>
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
                    <a class="button button-primary button-large" href="#dashboard">
                        {{ __('home.primary_cta') }}
                        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                    </a>
                </section>
            </main>
        </div>
    </body>
</html>
