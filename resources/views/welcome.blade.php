<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" dir="{{ config('audiobook.locales.' . app()->getLocale() . '.direction', 'ltr') }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title>{{ __('home.meta_title') }}</title>
        <meta name="description" content="{{ __('home.meta_description') }}">
        <link rel="canonical" href="{{ url('/' . app()->getLocale()) }}">
        <link rel="icon" href="{{ asset('assets/images/favicon.svg') }}" type="image/svg+xml">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="{{ __('home.brand') }}">
        <meta property="og:title" content="{{ __('home.meta_title') }}">
        <meta property="og:description" content="{{ __('home.meta_description') }}">
        <meta property="og:url" content="{{ url('/' . app()->getLocale()) }}">
        <meta property="og:image" content="{{ asset('assets/images/hero-audiobook-tool.png') }}">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{{ __('home.meta_title') }}">
        <meta name="twitter:description" content="{{ __('home.meta_description') }}">
        <meta name="twitter:image" content="{{ asset('assets/images/hero-audiobook-tool.png') }}">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0,0" rel="stylesheet">
        <script>window.HomeAuthTranslations = @json(trans('home.auth'));</script>
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

                <button class="mobile-nav-trigger" type="button" aria-controls="mobile-nav-drawer" aria-expanded="false">
                    <span class="material-symbols-rounded" aria-hidden="true">menu</span>
                    <span>{{ __('home.mobile_menu') }}</span>
                </button>

                <div class="header-actions">
                    <label class="locale-switcher" aria-label="Language">
                        <span class="material-symbols-rounded" aria-hidden="true">language</span>
                        <select onchange="window.location.assign(this.value)">
                            @foreach (config('audiobook.locales') as $locale => $localeConfig)
                                <option value="{{ url('/' . $locale) }}" @selected(app()->getLocale() === $locale)>{{ strtoupper($locale) }} · {{ $localeConfig['name'] }}</option>
                            @endforeach
                        </select>
                    </label>
                    @auth
                        <details class="home-user-menu">
                            <summary aria-label="{{ __('home.user_menu') }}">
                                <span class="material-symbols-rounded" aria-hidden="true">account_circle</span>
                                <span class="home-user-menu-name">{{ auth()->user()->name }}</span>
                                <span class="material-symbols-rounded home-user-menu-chevron" aria-hidden="true">expand_more</span>
                            </summary>
                            <div class="home-user-menu-panel">
                                <p class="home-user-menu-email">{{ auth()->user()->email }}</p>
                                <a href="{{ url('/dashboard') }}">
                                    <span class="material-symbols-rounded" aria-hidden="true">dashboard</span>
                                    {{ __('home.dashboard') }}
                                </a>
                                <a href="{{ url('/dashboard/profile') }}">
                                    <span class="material-symbols-rounded" aria-hidden="true">person</span>
                                    {{ __('home.profile') }}
                                </a>
                                <form action="{{ route('auth.logout') }}" method="post">
                                    @csrf
                                    <button type="submit">
                                        <span class="material-symbols-rounded" aria-hidden="true">logout</span>
                                        {{ __('home.logout') }}
                                    </button>
                                </form>
                            </div>
                        </details>
                    @else
                        <button class="login-link home-auth-trigger" type="button" data-auth-mode="login">{{ __('home.login') }}</button>
                        <button class="button button-primary home-auth-trigger" type="button" data-auth-mode="register">{{ __('home.primary_cta') }}</button>
                    @endauth
                </div>
            </header>

            @if (session('auth_message'))
                <p class="home-auth-flash" role="status">{{ session('auth_message') }}</p>
            @endif

            <div class="mobile-nav-drawer" id="mobile-nav-drawer" hidden>
                <button class="mobile-nav-drawer-backdrop" type="button" tabindex="-1" data-mobile-nav-close aria-label="{{ __('home.close_mobile_menu') }}"></button>
                <aside class="mobile-nav-drawer-panel" role="dialog" aria-modal="true" aria-label="{{ __('home.mobile_menu') }}">
                    <div class="mobile-nav-drawer-heading">
                        <span>{{ __('home.mobile_menu') }}</span>
                        <button type="button" data-mobile-nav-close aria-label="{{ __('home.close_mobile_menu') }}"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
                    </div>
                    <nav aria-label="{{ __('home.mobile_menu') }}">
                        @foreach (trans('home.nav') as $item)
                            <a href="#{{ $item['target'] }}">{{ $item['label'] }}<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
                        @endforeach
                    </nav>
                </aside>
            </div>

            <main>
                <section class="hero" id="features">
                    <div class="hero-grid">
                        <div class="hero-copy-block">
                            <span class="eyebrow">{{ __('home.eyebrow') }}</span>
                            <h1>{!! __('home.headline_html') !!}</h1>
                            <p class="hero-copy">{{ __('home.copy') }}</p>

                            <div class="hero-actions">
                                @auth
                                    <a class="button button-primary button-large" href="{{ url('/dashboard') }}">
                                        {{ __('home.dashboard') }}
                                        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                                    </a>
                                @else
                                    <button class="button button-primary button-large home-auth-trigger" type="button" data-auth-mode="register">
                                        {{ __('home.primary_cta') }}
                                        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                                    </button>
                                @endauth
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

                <section class="home-section demo-section" id="demo">
                    <div class="home-section-heading">
                        <span class="eyebrow">{{ __('home.demo.eyebrow') }}</span>
                        <h2>{{ __('home.demo.title') }}</h2>
                        <p>{{ __('home.demo.copy') }}</p>
                    </div>
                    <div class="demo-grid">
                        <ol class="demo-steps">
                            @foreach (trans('home.demo.steps') as $index => $step)
                                <li>
                                    <span>{{ $index + 1 }}</span>
                                    <div><h3>{{ $step['title'] }}</h3><p>{{ $step['copy'] }}</p></div>
                                </li>
                            @endforeach
                        </ol>
                        <div class="demo-preview">
                            <img src="{{ asset('assets/images/hero-audiobook-tool.png') }}" alt="{{ __('home.hero_image_alt') }}">
                        </div>
                    </div>
                </section>

                <section class="home-section pricing-section" id="pricing">
                    <div class="home-section-heading home-section-heading-centered">
                        <span class="eyebrow">{{ __('home.pricing.eyebrow') }}</span>
                        <h2>{{ __('home.pricing.title') }}</h2>
                        <p>{{ __('home.pricing.copy') }}</p>
                    </div>
                    <div class="pricing-grid">
                        @foreach ($plans as $plan)
                            @php($features = data_get(trans('home.pricing.features'), $plan->plan_key, trans('home.pricing.default_features')))
                            <article class="pricing-card {{ $plan->plan_key === 'creator' ? 'pricing-card-featured' : '' }}">
                                @if ($plan->plan_key === 'creator')
                                    <span class="pricing-card-badge">{{ __('home.pricing.recommended') }}</span>
                                @endif
                                <h3>{{ $plan->name }}</h3>
                                <p class="pricing-card-description">{{ $plan->description }}</p>
                                <p class="pricing-card-price">
                                    <strong>{{ \Illuminate\Support\Number::currency($plan->monthly_price_cents / 100, in: $plan->currency, locale: app()->getLocale()) }}</strong>
                                    <span>{{ __('home.pricing.month') }}</span>
                                </p>
                                <p class="pricing-card-tokens"><span class="material-symbols-rounded" aria-hidden="true">token</span>{{ number_format($plan->monthly_credits) }} {{ __('home.pricing.tokens') }}</p>
                                <ul>
                                    @foreach ($features as $feature)
                                        <li><span class="material-symbols-rounded" aria-hidden="true">check_circle</span>{{ $feature }}</li>
                                    @endforeach
                                </ul>
                                @auth
                                    <a class="button {{ $plan->plan_key === 'creator' ? 'button-primary' : '' }}" href="{{ url('/dashboard/subscription') }}">{{ __('home.pricing.manage_cta') }}</a>
                                @else
                                    <button class="button {{ $plan->plan_key === 'creator' ? 'button-primary' : '' }} home-auth-trigger" type="button" data-auth-mode="register">{{ __('home.pricing.cta') }}</button>
                                @endauth
                            </article>
                        @endforeach
                    </div>
                    <p class="pricing-note">{{ __('home.pricing.note') }}</p>
                </section>

                <section class="home-section resource-section" id="resources">
                    <div class="home-section-heading">
                        <span class="eyebrow">{{ __('home.resources.eyebrow') }}</span>
                        <h2>{{ __('home.resources.title') }}</h2>
                        <p>{{ __('home.resources.copy') }}</p>
                    </div>
                    <div class="resource-grid">
                        @foreach (trans('home.resources.items') as $item)
                            <article class="resource-card">
                                <span class="material-symbols-rounded" aria-hidden="true">{{ $item['icon'] }}</span>
                                <h3>{{ $item['title'] }}</h3>
                                <p>{{ $item['copy'] }}</p>
                            </article>
                        @endforeach
                    </div>
                </section>

                <section class="home-section blog-section" id="blog">
                    <div class="home-section-heading home-section-heading-centered">
                        <span class="eyebrow">{{ __('home.blog.eyebrow') }}</span>
                        <h2>{{ __('home.blog.title') }}</h2>
                        <p>{{ __('home.blog.copy') }}</p>
                    </div>
                    <div class="blog-callout">
                        <span class="material-symbols-rounded" aria-hidden="true">edit_note</span>
                        <p>{{ __('home.blog.coming_soon') }}</p>
                    </div>
                </section>

                <section class="final-cta" id="signup">
                    <h2>{{ __('home.final_cta_title') }}</h2>
                    <p>{{ __('home.final_cta_copy') }}</p>
                    @auth
                        <a class="button button-primary button-large" href="{{ url('/dashboard') }}">
                            {{ __('home.dashboard') }}
                            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                        </a>
                    @else
                        <button class="button button-primary button-large home-auth-trigger" type="button" data-auth-mode="register">
                            {{ __('home.primary_cta') }}
                            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                        </button>
                    @endauth
                </section>
            </main>

            <footer class="site-footer">
                <a class="brand" href="{{ url('/' . app()->getLocale()) }}" aria-label="{{ __('home.brand') }}">
                    <span class="brand-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>
                    <span>{{ __('home.brand') }}</span>
                </a>
                <p>{{ __('home.footer.tagline') }}</p>
                <nav aria-label="{{ __('home.footer.navigation_label') }}">
                    @foreach (trans('home.footer.links') as $link)
                        <a href="#{{ $link['target'] }}">{{ $link['label'] }}</a>
                    @endforeach
                </nav>
                <small>© {{ now()->year }} {{ __('home.brand') }}. {{ __('home.footer.rights') }}</small>
            </footer>
        </div>
        <div class="home-auth-modal" id="home-auth-modal" hidden>
            <div class="home-auth-backdrop" data-auth-close></div>
            <section class="home-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="home-auth-title">
                <button class="home-auth-close" type="button" data-auth-close aria-label="{{ __('home.auth.close') }}">×</button>
                <span class="home-auth-eyebrow">Audiobook Tools</span>
                <h2 id="home-auth-title">{{ __('home.auth.login_title') }}</h2>
                <p id="home-auth-copy">{{ __('home.auth.login_copy') }}</p>
                <form id="home-auth-form" novalidate>
                    <div class="home-auth-field home-auth-name" hidden><label for="home-auth-name">{{ __('home.auth.name') }}</label><input id="home-auth-name" name="name" autocomplete="name"></div>
                    <div class="home-auth-field"><label for="home-auth-email">{{ __('home.auth.email') }}</label><input id="home-auth-email" name="email" type="email" autocomplete="email" required></div>
                    <div class="home-auth-field home-auth-password"><label for="home-auth-password">{{ __('home.auth.password') }}</label><input id="home-auth-password" name="password" type="password" autocomplete="current-password" required></div>
                    <div class="home-auth-field home-auth-confirm" hidden><label for="home-auth-confirm">{{ __('home.auth.password_confirmation') }}</label><input id="home-auth-confirm" name="password_confirmation" type="password" autocomplete="new-password"></div>
                    <label class="home-auth-remember"><input id="home-auth-remember" type="checkbox"> {{ __('home.auth.remember') }}</label>
                    <button class="home-auth-forgot" type="button" id="home-auth-forgot">{{ __('home.auth.forgot_password') }}</button>
                    <p class="home-auth-error" id="home-auth-error" role="alert" hidden></p>
                    <button class="button button-primary home-auth-submit" type="submit">{{ __('home.auth.login_submit') }}</button>
                </form>
                <p class="home-auth-switch"><span id="home-auth-switch-copy">{{ __('home.auth.login_switch_copy') }}</span> <button type="button" id="home-auth-switch">{{ __('home.auth.register_submit') }}</button></p>
            </section>
        </div>
    </body>
</html>
