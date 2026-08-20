import '../../../css/logout.css';

let started = false;

export default function logoutPage() {
    if (!started) {
        started = true;
        _.http.postJSON('/auth/logout', {})
            .then((payload) => {
                const data = payload?.data?.data || payload?.data || {};
                window.location.replace(data.redirect || '/');
            })
            .catch(() => window.location.replace('/'));
    }

    return _.main({ class: 'at-logoutPage' },
        _.section({ class: 'at-logoutCard' },
            _.Icon({ name: 'logout' }),
            _.h2('Signing you out…'),
            _.p('Your session is being closed securely.'),
        ),
    );
}
