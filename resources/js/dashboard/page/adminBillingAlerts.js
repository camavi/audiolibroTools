import '../../../css/adminBilling.css';

const report = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const label = (value) => String(value || '').replace('_', ' ');

async function load() {
    loading.value = true; status.value = null;
    try { report.value = unwrap(await _.http.getJSON('/dashboard/api/admin/billing/alerts')); }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load billing alerts.') }; }
    finally { loading.value = false; }
}

function stat(icon, value, labelText, note) { return _.div({ class: 'at-billingStat' }, _.Icon({ name: icon }), _.div(_.strong(value), _.span(labelText), _.small(note))); }

export default function adminBillingAlertsPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-billingPage' },
        _.section({ class: 'at-billingHero' }, _.div(_.span('Administration · Billing'), _.h2('Billing alerts'), _.p('Operational issues that need attention before they affect customer access or revenue.')), _.Btn({ color: 'secondary', icon: 'refresh', onClick: load }, 'Refresh')),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-billingLoading' }, 'Loading billing alerts…') : !report.value ? null : _.div({ class: 'at-billingWorkspace' },
            _.section({ class: 'at-billingStats' },
                stat('notifications_active', () => number(report.value.summary.open_alerts), 'Open alerts', 'Current operational issues'),
                stat('error_outline', () => number(report.value.summary.critical_alerts), 'Critical', 'Payment recovery needed'),
                stat('payments', () => number(report.value.summary.payment_alerts), 'Payment alerts', 'Subscription or checkout failures'),
                stat(() => report.value.summary.webhook_ready ? 'verified' : 'warning', () => report.value.summary.webhook_ready ? 'Ready' : 'Action needed', 'Webhook', 'Payment confirmation pipeline'),
            ),
            _.section({ class: 'at-billingCard' },
                _.div({ class: 'at-billingHead' }, _.div(_.span('Attention queue'), _.h3('Resolve the highest-impact items first'))),
                () => {
                    const items = report.value.alerts || [];
                    if (!items.length) return _.div({ class: 'at-billingEmpty' }, 'No billing alerts. Everything is operating normally.');
                    return _.div({ class: 'at-billingList' }, ...items.map((item) => _.div(
                        { class: 'at-billingAlert is-' + item.severity },
                        _.Icon({ name: item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'info' }),
                        _.div(_.strong(item.title), _.span(item.description), item.customer ? _.small(item.customer) : null),
                        _.span({ class: 'at-billingStatus' }, label(item.category)),
                    )));
                },
            ),
        ),
    );
}
