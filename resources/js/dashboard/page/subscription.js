import '../../../css/subscription.css';

const data = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const money = (cents, currency = 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(cents || 0) / 100);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

async function load() {
    loading.value = true;
    try { data.value = unwrap(await _.http.getJSON('/dashboard/api/subscription')); }
    catch (error) { status.value = { type: 'danger', message: error?.message || 'Unable to load subscription details.' }; }
    finally { loading.value = false; }
}

export default function subscriptionPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-subscriptionPage' },
        _.section({ class: 'at-subscriptionHero' }, _.div(_.span('Account'), _.h2('Subscription'), _.p('Your monthly AI capacity and renewal information.'))),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-subscriptionLoading' }, 'Loading subscription…') : !data.value ? null : data.value.subscription ? _.section({ class: 'at-subscriptionCurrent' },
            _.div(_.span('Current plan'), _.h3(data.value.subscription.plan_name), _.strong(() => money(data.value.subscription.monthly_price_cents, data.value.subscription.currency) + ' / month')),
            _.div(_.span({ class: () => 'at-subscriptionStatus is-' + data.value.subscription.status }, () => data.value.subscription.status), _.small(() => data.value.subscription.cancel_at_period_end ? 'Cancels at the end of this period.' : 'Renews automatically when billing is active.')),
            _.div({ class: 'at-subscriptionInfo' }, _.Icon({ name: 'token' }), _.span(() => number(data.value.subscription.monthly_credits) + ' tokens monthly'), _.Icon({ name: 'event' }), _.span(() => data.value.subscription.current_period_ends_at ? new Date(data.value.subscription.current_period_ends_at).toLocaleDateString() : '—')),
        ) : _.section({ class: 'at-subscriptionEmpty' }, _.Icon({ name: 'card_membership' }), _.div(_.h3('No active subscription'), _.p('Subscription checkout is being prepared. Available plans remain in Administration.'))),
    );
}
