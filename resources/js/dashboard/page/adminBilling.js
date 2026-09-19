import '../../../css/adminBilling.css';

const report = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const period = _.rod('90');
const groupBy = _.rod('week');
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const money = (cents, currency = 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(cents || 0) / 100);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

async function load() {
    loading.value = true;
    try { report.value = unwrap(await _.http.getJSON(`/dashboard/api/admin/billing/token-sales?period=${period.value}&group_by=${groupBy.value}`)); }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load token sales.') }; }
    finally { loading.value = false; }
}

function stat(icon, value, label, note) { return _.div({ class: 'at-billingStat' }, _.Icon({ name: icon }), _.div(_.strong(value), _.span(label), _.small(note))); }

export default function adminBillingPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-billingPage' },
        _.section({ class: 'at-billingHero' }, _.div(_.span('Administration'), _.h2('Billing analytics'), _.p('Platform token sales only. Book royalties and author payouts remain in their separate analytics area.')), _.Btn({ color: 'secondary', icon: 'refresh', onClick: load }, 'Refresh')),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-billingLoading' }, 'Loading token sales…') : !report.value ? null : _.div({ class: 'at-billingWorkspace' },
            _.section({ class: 'at-billingFilters' }, _.Select({ label: 'Period', model: period, options: [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }], onChange: load }), _.Select({ label: 'Group sales by', model: groupBy, options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], onChange: load })),
            _.section({ class: 'at-billingStats' },
                stat('payments', () => money(report.value.summary.revenue_cents), 'Token sales', 'Confirmed payments'),
                stat('shopping_cart_checkout', () => number(report.value.summary.paid_purchases), 'Paid purchases', 'Within selected period'),
                stat('group', () => number(report.value.summary.paying_customers), 'Paying customers', 'Unique accounts'),
                stat('token', () => number(report.value.summary.credits_sold), 'Tokens sold', 'Credited after payment'),
                stat('receipt_long', () => money(report.value.summary.average_order_cents), 'Average order', 'Paid purchases only'),
            ),
            _.section({ class: 'at-billingTrend' }, _.div({ class: 'at-billingHead' }, _.div(_.span('Sales trend'), _.h3('Confirmed token sales')), _.small(() => `Grouped by ${report.value.group_by}`)), () => {
                const trend = report.value.trend || []; const max = Math.max(...trend.map((item) => item.revenue_cents), 1);
                if (!trend.length) return null;
                const bars = trend.map((item) => _.div(
                    { class: 'at-billingBar', title: `${item.label}: ${money(item.revenue_cents)}` },
                    _.i({ style: { height: `${Math.max(2, item.revenue_cents / max * 100)}%` } }),
                ));
                return _.div(
                    { class: 'at-billingChart' },
                    ...bars,
                    _.div({ class: 'at-billingChartLabels' }, _.span(trend[0]?.label || ''), _.span(trend.at(-1)?.label || '')),
                );
            }),
            _.div({ class: 'at-billingGrid' },
                _.section(
                    { class: 'at-billingCard' },
                    _.div({ class: 'at-billingHead' }, _.div(_.span('Package performance'), _.h3('What customers buy'))),
                    () => {
                        const items = report.value.packages || [];
                        return items.length
                            ? _.div({ class: 'at-billingList' }, ...items.map((item) => _.div({ class: 'at-billingRow' }, _.strong(item.name), _.span(`${number(item.purchases)} purchases`), _.span(`${number(item.credits_sold)} tokens`), _.strong(money(item.revenue_cents)))))
                            : _.div({ class: 'at-billingEmpty' }, 'No paid token purchases yet.');
                    },
                ),
                _.section(
                    { class: 'at-billingCard' },
                    _.div({ class: 'at-billingHead' }, _.div(_.span('Checkout status'), _.h3('Purchase funnel'))),
                    () => _.div({ class: 'at-billingStatuses' }, ...(report.value.statuses || []).map((item) => _.div(_.span(item.status.replace('_', ' ')), _.strong(number(item.count))))),
                ),
            ),
            _.section(
                { class: 'at-billingCard' },
                _.div({ class: 'at-billingHead' }, _.div(_.span('Recent purchases'), _.h3('Latest checkout activity'))),
                () => {
                    const items = report.value.recent_purchases || [];
                    return items.length
                        ? _.div({ class: 'at-billingList' }, ...items.map((item) => _.div({ class: 'at-billingRow at-billingRecent' }, _.div(_.strong(item.customer), _.small(item.package_name)), _.span({ class: `at-billingStatus is-${item.status}` }, item.status.replace('_', ' ')), _.span(`${number(item.credits)} tokens`), _.strong(money(item.amount_cents, item.currency)))))
                        : _.div({ class: 'at-billingEmpty' }, 'No checkout activity in this period.');
                },
            ),
        ),
    );
}
