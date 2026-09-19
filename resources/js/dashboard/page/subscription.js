import '../../../css/subscription.css';

const data = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const startingCheckout = _.rod(false);
const subscriptionAction = _.rod('idle');
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

async function changePlan(plan) {
    if (subscriptionAction.value !== 'idle' || !data.value?.subscription || !plan.checkout_ready) return;
    subscriptionAction.value = 'previewing-plan'; status.value = null;
    let preview;
    try {
        preview = unwrap(await _.http.postJSON('/dashboard/api/subscription/plan-preview', { subscription_plan_id: plan.id })).preview;
    } catch (error) {
        status.value = { type: 'danger', message: error?.data?.message || error?.message || 'Unable to calculate the plan change.' };
        subscriptionAction.value = 'idle';
        return;
    }
    subscriptionAction.value = 'idle';

    const amount = money(preview.amount_due, preview.currency);
    const confirmed = await _.dialog.confirm({
        title: `Change to ${plan.name}?`,
        message: preview.amount_due > 0
            ? `Due today: ${amount}. Stripe will charge your saved payment method immediately. If payment cannot be completed, your current plan stays unchanged.`
            : preview.amount_due < 0
                ? `Credit today: ${money(Math.abs(preview.amount_due), preview.currency)}. Stripe will apply it according to your billing balance.`
                : 'No payment is due today. Your new plan will take effect immediately.',
        okText: preview.amount_due > 0 ? `Pay ${amount} and change plan` : 'Change plan',
    });
    if (!confirmed) return;

    subscriptionAction.value = 'changing-plan'; status.value = null;
    try {
        const result = unwrap(await _.http.patchJSON('/dashboard/api/subscription/plan', { subscription_plan_id: plan.id, proration_date: preview.proration_date }));
        data.value = { ...data.value, subscription: result.subscription };
        status.value = { type: 'success', message: `Your plan has been changed to ${plan.name}.` };
    } catch (error) {
        status.value = { type: 'danger', message: error?.data?.message || error?.message || 'Unable to change the subscription plan.' };
    } finally { subscriptionAction.value = 'idle'; }
}

async function updateCancellation(cancelAtPeriodEnd) {
    if (subscriptionAction.value !== 'idle' || !data.value?.subscription) return;
    const confirmed = await _.dialog.confirm({
        title: cancelAtPeriodEnd ? 'Cancel at the end of this period?' : 'Keep your subscription active?',
        message: cancelAtPeriodEnd
            ? 'Your included tokens and plan remain available until the current period ends.'
            : 'Stripe will restore the automatic renewal of your current plan.',
        okText: cancelAtPeriodEnd ? 'Schedule cancellation' : 'Reactivate subscription',
    });
    if (!confirmed) return;

    subscriptionAction.value = cancelAtPeriodEnd ? 'cancelling' : 'reactivating'; status.value = null;
    try {
        const result = unwrap(await _.http.patchJSON('/dashboard/api/subscription/cancellation', { cancel_at_period_end: cancelAtPeriodEnd }));
        data.value = { ...data.value, subscription: result.subscription };
        status.value = { type: 'success', message: cancelAtPeriodEnd ? 'Cancellation is scheduled at the end of the current period.' : 'Your subscription will renew automatically again.' };
    } catch (error) {
        status.value = { type: 'danger', message: error?.data?.message || error?.message || 'Unable to update subscription cancellation.' };
    } finally { subscriptionAction.value = 'idle'; }
}

async function openCustomerPortal() {
    if (subscriptionAction.value !== 'idle' || !data.value?.subscription || !data.value.portal_ready) return;
    subscriptionAction.value = 'opening-portal'; status.value = null;
    try {
        const result = unwrap(await _.http.postJSON('/dashboard/api/subscription/customer-portal', {}));
        window.location.assign(result.portal_url);
    } catch (error) {
        status.value = { type: 'danger', message: error?.data?.message || error?.message || 'Unable to open Stripe billing portal.' };
        subscriptionAction.value = 'idle';
    }
}

function planCard(plan, current) {
    const isCurrent = current?.plan_name === plan.name;
    const canChange = Boolean(current && !current.cancel_at_period_end && !isCurrent && plan.checkout_ready);
    return _.article({ class: 'at-subscriptionPlan' + (isCurrent ? ' is-current' : '') },
        _.div(_.span(isCurrent ? 'Current plan' : 'Monthly plan'), _.h3(plan.name), _.p(plan.description || 'Monthly AI capacity for your projects.')),
        _.strong(money(plan.monthly_price_cents, plan.currency) + ' / month'),
        _.small(number(plan.monthly_credits) + ' tokens included every month'),
        current
            ? _.Btn({ color: isCurrent ? 'secondary' : 'primary', icon: isCurrent ? 'check_circle' : 'swap_horiz', loading: () => ['previewing-plan', 'changing-plan'].includes(subscriptionAction.value), disabled: () => subscriptionAction.value !== 'idle' || isCurrent || !canChange, onClick: () => changePlan(plan) }, isCurrent ? 'Current plan' : 'Change to this plan')
            : _.Btn({ color: 'primary', icon: 'payments', loading: startingCheckout, disabled: () => !plan.checkout_ready, onClick: () => startCheckout(plan) }, 'Choose plan'),
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
                _.Btn({ color: 'secondary', icon: 'receipt_long', loading: () => subscriptionAction.value === 'opening-portal', disabled: () => subscriptionAction.value !== 'idle' || !data.value?.portal_ready, onClick: openCustomerPortal }, 'Billing & invoices'),
                _.Btn({ color: data.value.subscription.cancel_at_period_end ? 'primary' : 'danger', icon: data.value.subscription.cancel_at_period_end ? 'restart_alt' : 'cancel', loading: () => ['cancelling', 'reactivating'].includes(subscriptionAction.value), disabled: () => subscriptionAction.value !== 'idle' || !data.value?.checkout_ready, onClick: () => updateCancellation(!data.value.subscription.cancel_at_period_end) }, () => data.value.subscription.cancel_at_period_end ? 'Reactivate subscription' : 'Cancel subscription'),
            ),
        ) : _.section({ class: 'at-subscriptionEmpty' }, _.Icon({ name: 'card_membership' }), _.div(_.h3('No active subscription'), _.p('Choose a monthly plan below. Checkout will become available when billing is configured.'))),
        () => !loading.value && data.value ? _.section({ class: 'at-subscriptionPlans' },
            _.div({ class: 'at-subscriptionSectionHead' }, _.div(_.span('Available plans'), _.h3('Choose your monthly capacity')), _.small(() => data.value.checkout_ready ? 'Secure checkout is available.' : 'Checkout is temporarily unavailable.')),
            _.div({ class: 'at-subscriptionPlanGrid' }, ...(data.value.plans || []).map((plan) => planCard(plan, data.value.subscription))),
        ) : null,
        () => !loading.value && data.value && !(data.value.plans || []).some((plan) => plan.checkout_ready) ? _.div({ class: 'at-subscriptionNotice' }, _.Icon({ name: 'info' }), _.span('Subscription checkout is configured but prices have not been synced to Stripe yet.')) : null,
    );
}
