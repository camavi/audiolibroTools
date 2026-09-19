import '../../../css/adminBilling.css';

const report = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const period = _.rod('90');
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const money = (cents, currency = 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(cents || 0) / 100);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const label = (value) => String(value || '').replace('_', ' ');

async function load() {
    loading.value = true; status.value = null;
    try { report.value = unwrap(await _.http.getJSON('/dashboard/api/admin/billing/subscriptions?period=' + period.value)); }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load subscription analytics.') }; }
    finally { loading.value = false; }
}

function stat(icon, value, labelText, note) { return _.div({ class: 'at-billingStat' }, _.Icon({ name: icon }), _.div(_.strong(value), _.span(labelText), _.small(note))); }

export default function adminSubscriptionAnalyticsPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-billingPage' },
        _.section({ class: 'at-billingHero' }, _.div(_.span('Administration · Billing'), _.h2('Subscription analytics'), _.p('Track recurring revenue, plan distribution and upcoming subscription risk.')), _.Btn({ color: 'secondary', icon: 'refresh', onClick: load }, 'Refresh')),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-billingLoading' }, 'Loading subscriptions…') : !report.value ? null : _.div({ class: 'at-billingWorkspace' },
            _.section({ class: 'at-billingFilters' }, _.Select({ label: 'Period', model: period, options: [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }], onChange: load })),
            _.section({ class: 'at-billingStats' },
                stat('subscriptions', () => number(report.value.summary.active_subscriptions), 'Active subscriptions', 'Active and ending at period end'),
                stat('payments', () => money(report.value.summary.mrr_cents), 'Monthly recurring revenue', 'Active and canceling plans'),
                stat('person_add', () => number(report.value.summary.new_subscriptions), 'New subscriptions', 'Within selected period'),
                stat('person_remove', () => number(report.value.summary.cancelled_subscriptions), 'Cancelled', 'Ended within selected period'),
                stat('warning', () => number(report.value.summary.scheduled_cancellations + report.value.summary.past_due_subscriptions), 'Needs attention', 'Scheduled cancellation or past due'),
            ),
            _.div({ class: 'at-billingGrid' },
                _.section({ class: 'at-billingCard' },
                    _.div({ class: 'at-billingHead' }, _.div(_.span('Plan distribution'), _.h3('Recurring revenue by plan'))),
                    () => {
                        const items = report.value.plans || [];
                        if (!items.length) return _.div({ class: 'at-billingEmpty' }, 'No active subscriptions yet.');
                        return _.div({ class: 'at-billingList' }, ...items.map((item) => _.div(
                            { class: 'at-billingRow' }, _.strong(item.plan_name), _.span(number(item.active_subscriptions) + ' active'),
                            _.span(number(item.monthly_credits) + ' tokens/mo'), _.strong(money(item.mrr_cents, item.currency)),
                        )));
                    },
                ),
                _.section({ class: 'at-billingCard' },
                    _.div({ class: 'at-billingHead' }, _.div(_.span('Subscription status'), _.h3('Portfolio health'))),
                    () => _.div({ class: 'at-billingStatuses' }, ...(report.value.statuses || []).map((item) => _.div(_.span(label(item.status)), _.strong(number(item.count))))),
                ),
            ),
            _.section({ class: 'at-billingCard' },
                _.div({ class: 'at-billingHead' }, _.div(_.span('Recent subscriptions'), _.h3('Latest account activity'))),
                () => {
                    const items = report.value.recent_subscriptions || [];
                    if (!items.length) return _.div({ class: 'at-billingEmpty' }, 'No subscription activity in this period.');
                    return _.div({ class: 'at-billingList' }, ...items.map((item) => _.div(
                        { class: 'at-billingRow at-billingRecent' }, _.div(_.strong(item.customer), _.small(item.plan_name)),
                        _.span({ class: 'at-billingStatus' }, label(item.status)), _.span(number(item.monthly_credits) + ' tokens/mo'),
                        _.strong(money(item.monthly_price_cents, item.currency)),
                    )));
                },
            ),
        ),
    );
}
