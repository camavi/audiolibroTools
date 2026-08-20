const modal = document.querySelector('#home-auth-modal');
const form = document.querySelector('#home-auth-form');

if (modal && form) {
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
        title.textContent = registration ? 'Create your workspace' : 'Welcome back';
        copy.textContent = registration ? 'Start creating books, audiobooks and editions in one place.' : 'Sign in to continue to your workspace.';
        nameField.hidden = !registration;
        confirmField.hidden = !registration;
        remember.hidden = registration;
        password.autocomplete = registration ? 'new-password' : 'current-password';
        submit.textContent = registration ? 'Create account' : 'Sign in';
        switchCopy.textContent = registration ? 'Already have an account?' : 'New to Audiobook Tools?';
        switchButton.textContent = registration ? 'Sign in' : 'Create an account';
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
        submit.disabled = true; submit.textContent = mode === 'register' ? 'Creating account…' : 'Signing in…';
        try {
            const response = await fetch(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '' }, body: JSON.stringify(body) });
            const payload = await response.json();
            if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat()[0] || payload.message || 'Unable to continue.');
            window.location.assign(payload.data?.redirect || '/dashboard');
        } catch (requestError) { error.textContent = requestError.message; error.hidden = false; }
        finally { submit.disabled = false; submit.textContent = mode === 'register' ? 'Create account' : 'Sign in'; }
    });
}
