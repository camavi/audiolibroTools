import '../../../css/subscription.css';

const data = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const startingCheckout = _.rod(false);
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const money = (cents, currency = 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(cents || 0) / 100);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const date = (value) => value ? new Date(value).toLocaleDateString() : '—';
const label = (value) => String(value || '').replace('_', ' ');

async function load() {
    loading.value = true;
    status.value = null;
    try { data.value = unwrap(await _.http.getJSON('/dashboard/api/subscription')); }
    catch (error) { status.value = { type: 'danger', message: error?.message || 'Unable to load subscription details.' }; }
    finally { loading.value = false; }
}

function unavailableAction() {
    status.value = { type: 'info', message: 'Subscription billing is not configured yet. These actions will be enabled when Stripe subscriptions are activated.' };
}

async function startCheckout(plan) {
    if (startingCheckout.value || !plan.checkout_ready) return;
    startingCheckout.value = true; status.value = null;
    try {
        const result = unwrap(await _.http.postJSON('/dashboard/api/subscription/checkout', { subscription_plan_id: plan.id }));
        window.location.assign(result.checkout_url);
    } catch (error) {
        status.value = { type: 'danger', message: error?.data?.message || error?.message || 'Unable to start subscription checkout.' };
    } finally {
        startingCheckout.value = false;
    }
}

function planCard(plan, current) {
    const isCurrent = current?.plan_name === plan.name;
    return _.article({ class: 'at-subscriptionPlan' + (isCurrent ? ' is-current' : '') },
        _.div(_.span(isCurrent ? 'Current plan' : 'Monthly plan'), _.h3(plan.name), _.p(plan.description || 'Monthly AI capacity for your projects.')),
        _.strong(money(plan.monthly_price_cents, plan.currency) + ' / month'),
        _.small(number(plan.monthly_credits) + ' tokens included every month'),
        _.Btn({ color: isCurrent ? 'secondary' : 'primary', icon: isCurrent ? 'check_circle' : 'payments', loading: startingCheckout, disabled: () => isCurrent || !plan.checkout_ready, onClick: () => startCheckout(plan) }, isCurrent ? 'Current plan' : 'Choose plan'),
    );
}

export default function subscriptionPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-subscriptionPage' },
        _.section({ class: 'at-subscriptionHero' }, _.div(_.span('Account'), _.h2('Subscription'), _.p('Your monthly AI capacity and renewal information.'))),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-subscriptionLoading' }, 'Loading subscription…') : !data.value ? null : data.value.subscription ? _.section({ class: 'at-subscriptionCurrent' },
            _.div(_.span('Current plan'), _.h3(data.value.subscription.plan_name), _.strong(() => money(data.value.subscription.monthly_price_cents, data.value.subscription.currency) + ' / month')),
            _.div(_.span({ class: () => 'at-subscriptionStatus is-' + data.value.subscription.status }, () => label(data.value.subscription.status)), _.small(() => data.value.subscription.cancel_at_period_end ? 'Cancels on ' + date(data.value.subscription.current_period_ends_at) + '.' : 'Next renewal: ' + date(data.value.subscription.current_period_ends_at))),
            _.div({ class: 'at-subscriptionInfo' }, _.Icon({ name: 'token' }), _.span(() => number(data.value.subscription.monthly_credits) + ' tokens monthly'), _.Icon({ name: 'event' }), _.span(() => 'Current period ends ' + date(data.value.subscription.current_period_ends_at))),
            _.div({ class: 'at-subscriptionActions' },
                _.Btn({ color: 'secondary', icon: 'swap_horiz', disabled: () => !data.value?.checkout_ready, onClick: unavailableAction }, 'Change plan'),
                _.Btn({ color: 'danger', icon: 'cancel', disabled: () => !data.value?.checkout_ready || data.value.subscription.cancel_at_period_end, onClick: unavailableAction }, () => data.value.subscription.cancel_at_period_end ? 'Cancellation scheduled' : 'Cancel subscription'),
            ),
        ) : _.section({ class: 'at-subscriptionEmpty' }, _.Icon({ name: 'card_membership' }), _.div(_.h3('No active subscription'), _.p('Choose a monthly plan below. Checkout will become available when billing is configured.'))),
        () => !loading.value && data.value ? _.section({ class: 'at-subscriptionPlans' },
            _.div({ class: 'at-subscriptionSectionHead' }, _.div(_.span('Available plans'), _.h3('Choose your monthly capacity')), _.small(() => data.value.checkout_ready ? 'Secure checkout is available.' : 'Checkout is temporarily unavailable.')),
            _.div({ class: 'at-subscriptionPlanGrid' }, ...(data.value.plans || []).map((plan) => planCard(plan, data.value.subscription))),
        ) : null,
        () => !loading.value && data.value && !(data.value.plans || []).some((plan) => plan.checkout_ready) ? _.div({ class: 'at-subscriptionNotice' }, _.Icon({ name: 'info' }), _.span('Subscription checkout is configured but prices have not been synced to Stripe yet.')) : null,
    );
}
