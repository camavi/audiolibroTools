const modal = document.querySelector('#home-auth-modal');
const form = document.querySelector('#home-auth-form');
const mobileNavTrigger = document.querySelector('.mobile-nav-trigger');
const mobileNavDrawer = document.querySelector('#mobile-nav-drawer');

if (mobileNavTrigger && mobileNavDrawer) {
    let mobileNavLastFocus = null;

    const closeMobileNav = () => {
        if (mobileNavDrawer.hidden) return;
        mobileNavDrawer.hidden = true;
        mobileNavTrigger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('home-mobile-nav-open');
        mobileNavLastFocus?.focus();
    };

    const openMobileNav = () => {
        mobileNavLastFocus = document.activeElement;
        mobileNavDrawer.hidden = false;
        mobileNavTrigger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('home-mobile-nav-open');
        mobileNavDrawer.querySelector('.mobile-nav-drawer-heading [data-mobile-nav-close]')?.focus();
    };

    mobileNavTrigger.addEventListener('click', openMobileNav);
    mobileNavDrawer.querySelectorAll('[data-mobile-nav-close], a').forEach((element) => element.addEventListener('click', closeMobileNav));
    document.addEventListener('keydown', (event) => {
        if (mobileNavDrawer.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closeMobileNav(); return; }
        if (event.key !== 'Tab') return;

        const focusable = [...mobileNavDrawer.querySelectorAll('button:not([tabindex="-1"]), a[href]')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
}

if (modal && form) {
    const translations = window.HomeAuthTranslations || {};
    const title = document.querySelector('#home-auth-title');
    const copy = document.querySelector('#home-auth-copy');
    const nameField = document.querySelector('.home-auth-name');
    const confirmField = document.querySelector('.home-auth-confirm');
    const password = document.querySelector('#home-auth-password');
    const remember = document.querySelector('.home-auth-remember');
    const submit = document.querySelector('.home-auth-submit');
    const error = document.querySelector('#home-auth-error');
    const switchCopy = document.querySelector('#home-auth-switch-copy');
    const switchButton = document.querySelector('#home-auth-switch');
    let mode = 'login';

    const setMode = (nextMode) => {
        mode = nextMode;
        const registration = mode === 'register';
        title.textContent = registration ? translations.register_title : translations.login_title;
        copy.textContent = registration ? translations.register_copy : translations.login_copy;
        nameField.hidden = !registration;
        confirmField.hidden = !registration;
        remember.hidden = registration;
        password.autocomplete = registration ? 'new-password' : 'current-password';
        submit.textContent = registration ? translations.register_submit : translations.login_submit;
        switchCopy.textContent = registration ? translations.register_switch_copy : translations.login_switch_copy;
        switchButton.textContent = registration ? translations.login_submit : translations.register_submit;
        error.hidden = true;
    };
    const open = (nextMode) => { setMode(nextMode); modal.hidden = false; document.body.classList.add('home-auth-open'); document.querySelector(nextMode === 'register' ? '#home-auth-name' : '#home-auth-email')?.focus(); };
    const close = () => { modal.hidden = true; document.body.classList.remove('home-auth-open'); form.reset(); error.hidden = true; };

    document.querySelectorAll('.home-auth-trigger').forEach((button) => button.addEventListener('click', () => open(button.dataset.authMode || 'register')));
    modal.querySelectorAll('[data-auth-close]').forEach((button) => button.addEventListener('click', close));
    switchButton.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
    form.addEventListener('submit', async (event) => {
        event.preventDefault(); error.hidden = true;
        const formData = new FormData(form);
        const body = Object.fromEntries(formData.entries());
        body.remember = document.querySelector('#home-auth-remember').checked;
        submit.disabled = true; submit.textContent = mode === 'register' ? translations.register_submitting : translations.login_submitting;
        try {
            const response = await fetch(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '' }, body: JSON.stringify(body) });
            const payload = await response.json();
            if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message || translations.generic_error);
            window.location.assign(payload.data?.redirect || '/dashboard');
        } catch (requestError) { error.textContent = requestError.message; error.hidden = false; }
        finally { submit.disabled = false; submit.textContent = mode === 'register' ? translations.register_submit : translations.login_submit; }
    });
}
