import '../../../css/adminSubscriptionPlans.css';

const plans = _.rod([]);
const loading = _.rod(true);
const status = _.rod(null);

const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const formatCredits = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatPrice = (cents, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(Number(cents || 0) / 100);

async function load() {
    loading.value = true;
    try { plans.value = dataOf(await _.http.getJSON('/dashboard/api/admin/subscription-plans')).plans || []; }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load subscription plans.') }; }
    finally { loading.value = false; }
}

function editPlan(plan) {
    const name = _.rod(plan.name || '');
    const description = _.rod(plan.description || '');
    const monthlyPrice = _.rod(String(Number(plan.monthly_price_cents || 0) / 100));
    const credits = _.rod(String(plan.monthly_credits || 0));
    const active = _.rod(Boolean(plan.is_active));
    const saving = _.rod(false);
    const dialogStatus = _.rod(null);
    const save = async (close) => {
        if (saving.value) return;
        saving.value = true; dialogStatus.value = null;
        try {
            await _.http.patchJSON(`/dashboard/api/admin/subscription-plans/${plan.id}`, {
                name: name.value.trim(),
                description: description.value.trim() || null,
                monthly_price_cents: Math.round(Number(monthlyPrice.value) * 100),
                currency: plan.currency || 'EUR',
                monthly_credits: Number(credits.value),
                is_active: active.value,
            });
            await load();
            status.value = { type: 'success', message: `${name.value.trim()} plan saved.` };
            close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: errorMessage(error, 'Check the plan details before saving.') }; }
        finally { saving.value = false; }
    };

    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.span('Monthly subscription'), _.h3(`Edit ${plan.name}`), _.p('Changes apply to future checkout and renewals. Existing subscriptions will retain their recorded terms.')),
        content: ({ close }) => _.div({ class: 'at-subscriptionPlanDialog' },
            _.Input({ label: 'Plan name', model: name, required: true }),
            _.Textarea({ label: 'Description', rows: 2, model: description }),
            _.div({ class: 'at-subscriptionPlanFields' },
                _.Input({ label: 'Monthly price', type: 'number', min: 0, step: '.01', prefix: '€', model: monthlyPrice }),
                _.Input({ label: 'Monthly included tokens', type: 'number', min: 0, step: 1, model: credits }),
            ),
            _.Checkbox({ label: 'Plan available for new subscriptions', model: active }),
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-subscriptionPlanActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'save', loading: saving, onClick: () => save(close) }, 'Save plan')),
        ),
    } }).open();
}

export default function adminSubscriptionPlansPage() {
    load();
    window.AudiobookTools?.setPageHeaderActions?.([]);

    return _.main({ class: 'at-subscriptionPlansPage' },
        _.section({ class: 'at-subscriptionPlansHero' }, _.div(
            _.span('Administration'), _.h2('Monthly subscription plans'), _.p('Manage the three recurring plans. Token top-ups will remain a separate purchase flow.'),
        )),
        () => status.value ? _.Alert(status.value) : null,
        _.section({ class: 'at-subscriptionPlansNotice' }, _.Icon({ name: 'info' }), _.span('Checkout, renewals and token allocation are not connected yet. This catalog defines the plans that the payment flow will use.')),
        () => loading.value ? _.div({ class: 'at-subscriptionPlansLoading' }, 'Loading subscription plans…') : _.div({ class: 'at-subscriptionPlansGrid' }, ...plans.value.map((plan) => _.article({ class: () => `at-subscriptionPlanCard ${plan.is_active ? '' : 'is-inactive'}` },
            _.div({ class: 'at-subscriptionPlanHead' }, _.div(_.span(plan.plan_key), _.h3(plan.name)), _.span({ class: 'at-subscriptionPlanStatus' }, plan.is_active ? 'Active' : 'Inactive')),
            _.p(plan.description || 'No description.'),
            _.strong({ class: 'at-subscriptionPlanPrice' }, `${formatPrice(plan.monthly_price_cents, plan.currency)} / month`),
            _.div({ class: 'at-subscriptionPlanCredits' }, _.Icon({ name: 'token' }), _.span(`${formatCredits(plan.monthly_credits)} tokens included monthly`)),
            _.Btn({ color: 'secondary', icon: 'edit', onClick: () => editPlan(plan) }, 'Edit plan'),
        ))),
    );
}
