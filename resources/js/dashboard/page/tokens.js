import '../../../css/tokens.css';

const wallet = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const savingAutoRecharge = _.rod(false);
const autoRechargeEnabled = _.rod(false);
const autoRechargeThreshold = _.rod('500');
const autoRechargeAmount = _.rod('2000');

function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function errorMessage(error, fallback) { return error?.data?.message || error?.message || fallback; }
function formatTokens(value) { return new Intl.NumberFormat().format(Number(value || 0)); }

function applyWallet(data) {
    wallet.value = data;
    const balance = data.balance || {};
    CMSwift.reactive.untracked(() => {
        autoRechargeEnabled.value = Boolean(balance.auto_recharge_enabled);
        autoRechargeThreshold.value = balance.auto_recharge_threshold ? String(balance.auto_recharge_threshold) : '500';
        autoRechargeAmount.value = balance.auto_recharge_amount ? String(balance.auto_recharge_amount) : '2000';
    });
}

async function loadWallet() {
    loading.value = true;
    try { applyWallet(dataOf(await _.http.getJSON('/dashboard/api/tokens'))); }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load token wallet.') }; }
    finally { loading.value = false; }
}

async function saveAutoRecharge() {
    if (savingAutoRecharge.value) return;
    savingAutoRecharge.value = true; status.value = null;
    try {
        const data = dataOf(await _.http.patchJSON('/dashboard/api/tokens/auto-recharge', {
            enabled: autoRechargeEnabled.value,
            threshold: autoRechargeEnabled.value ? Number(autoRechargeThreshold.value) : null,
            amount: autoRechargeEnabled.value ? Number(autoRechargeAmount.value) : null,
        }));
        wallet.value = { ...wallet.value, balance: data.balance };
        status.value = { type: 'success', message: autoRechargeEnabled.value ? 'Auto-recharge settings saved.' : 'Auto-recharge is disabled.' };
    } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to save auto-recharge settings.') }; }
    finally { savingAutoRecharge.value = false; }
}

function openTopUpDialog() {
    const selected = _.rod('1000');
    const dialogStatus = _.rod(null);
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.span({ class: 'at-tokensEyebrow' }, 'Add tokens'), _.h3('Choose a token package'), _.p('Tokens are added after a confirmed payment.')),
        content: ({ close }) => _.div({ class: 'at-tokensDialog' },
            _.Select({ label: 'Token package', model: selected, options: () => (wallet.value?.top_up_packages || []).map((pack) => ({ value: String(pack.credits), label: pack.label })) }),
            _.div({ class: 'at-tokensPaymentNotice' }, _.Icon({ name: 'info' }), _.span('Payment checkout is not connected yet. No charge and no tokens will be created until a verified payment provider is configured.')),
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-tokensDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'payments', disabled: true }, 'Continue to payment')),
        ),
    } }).open();
}

function statCard(icon, value, label, note) {
    return _.div({ class: 'at-tokensStat' }, _.Icon({ name: icon }), _.div(_.strong(() => formatTokens(value())), _.span(label), _.small(note)));
}

function historyLabel(entry) {
    return ({ consumed: 'Tokens used', reserved: 'Tokens reserved', released: 'Tokens released', top_up: 'Tokens added' })[entry.type] || 'Wallet activity';
}

export default function tokensPage() {
    loadWallet();
    window.AudiobookTools?.setPageHeaderActions?.([]);

    return _.main({ class: 'at-tokensPage' },
        _.section({ class: 'at-tokensHero' },
            _.div(_.span({ class: 'at-tokensEyebrow' }, 'Token wallet'), _.h2('Usage & recharge'), _.p('Keep track of AI usage and set a balance floor for automatic recharge.')),
            _.Btn({ color: 'primary', icon: 'add_card', onClick: openTopUpDialog }, 'Add tokens'),
        ),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-tokensLoading' }, 'Loading token wallet…') : wallet.value ? _.div({ class: 'at-tokensGrid' },
            _.section({ class: 'at-tokensBalanceCard' },
                _.div({ class: 'at-tokensCardHead' }, _.div(_.span('Available balance'), _.h3(() => `${formatTokens(wallet.value.balance?.available_credits)} tokens`)), _.Icon({ name: 'token' })),
                _.p('Tokens are used for managed AI tasks, such as translation batches.'),
                _.div({ class: 'at-tokensStats' },
                    statCard('trending_down', () => wallet.value.usage?.consumed_last_30_days, 'Used in last 30 days', 'Completed AI work'),
                    statCard('pending_actions', () => wallet.value.balance?.reserved_credits, 'Currently reserved', 'Active work in progress'),
                    statCard('data_usage', () => wallet.value.balance?.consumed_credits, 'Used all time', 'Completed AI work'),
                ),
            ),
            _.section({ class: 'at-tokensAutoCard' },
                _.div({ class: 'at-tokensCardHead' }, _.div(_.span('Automatic recharge'), _.h3('Never run out')), _.Icon({ name: 'autorenew' })),
                _.p('When your balance reaches the chosen threshold, a verified payment method will recharge the selected amount.'),
                _.Checkbox({ label: 'Enable automatic recharge', model: autoRechargeEnabled }),
                () => autoRechargeEnabled.value ? _.div({ class: 'at-tokensAutoFields' }, _.Input({ label: 'Recharge when balance drops below', type: 'number', min: 1, model: autoRechargeThreshold, suffix: 'tokens' }), _.Input({ label: 'Recharge amount', type: 'number', min: 100, model: autoRechargeAmount, suffix: 'tokens' })) : _.small({ class: 'at-tokensAutoOff' }, 'Automatic recharge is off. You can enable it whenever a payment method is available.'),
                _.Btn({ color: 'secondary', icon: 'save', loading: savingAutoRecharge, onClick: saveAutoRecharge }, 'Save auto-recharge'),
            ),
            _.section({ class: 'at-tokensHistoryCard' },
                _.div({ class: 'at-tokensCardHead' }, _.div(_.span('Recent activity'), _.h3('Token history')), _.small(() => `${wallet.value.usage?.entries_last_30_days || 0} events in the last 30 days`)),
                () => wallet.value.history?.length ? _.div({ class: 'at-tokensHistory' }, ...wallet.value.history.map((entry) => _.div({ class: 'at-tokensHistoryRow' }, _.div(_.Icon({ name: entry.type === 'consumed' ? 'remove_circle_outline' : 'add_circle_outline' }), _.div(_.strong(historyLabel(entry)), _.small(entry.book_name || entry.reason || 'Account wallet'))), _.div({ class: `at-tokensHistoryAmount ${entry.type === 'consumed' || entry.type === 'reserved' ? 'is-negative' : ''}` }, `${entry.type === 'consumed' || entry.type === 'reserved' ? '−' : '+'}${formatTokens(entry.credits)}`, _.small(entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''))))) : _.div({ class: 'at-tokensEmpty' }, _.Icon({ name: 'receipt_long' }), _.span('Your token activity will appear here once you use a managed AI service.')),
            ),
        ) : null,
    );
}
