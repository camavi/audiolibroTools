import '../../../css/adminAiPricing.css';

const prices = _.rod([]);
const loading = _.rod(true);
const saving = _.rod(false);
const status = _.rod(null);
const priceModels = new Map();
const priceControls = new Map();
let tokenProducts = { plans: [], packages: [] };

const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const priceValue = (value) => value === null || value === undefined ? '' : String(value);
const unitLabel = (item) => ({ per_million_tokens: 'Per 1K input/output tokens', per_audio_minute: 'Per audio minute', per_image: 'Per generated image' })[item.pricing_unit] || item.pricing_unit;
const priceKey = (item) => `${item.provider_key}:${item.model}:${item.modality}`;

function hydrate(items, products = {}) {
    JSswift.reactive.untracked(() => {
        priceModels.clear();
        priceControls.clear();
        tokenProducts = {
            plans: products.plans || [],
            packages: products.packages || [],
        };
        prices.value = items.map((item) => {
            const input = _.rod(priceValue(item.input_tokens));
            const output = _.rod(priceValue(item.output_tokens));
            const credits = _.rod(priceValue(item.customer_credits));
            const key = priceKey(item);

            // Models and DOM controls stay outside the reactive row objects.
            // JSswift proxies nested objects in a rod; proxying an HTMLElement
            // makes native DOM getters throw “Illegal invocation”.
            priceModels.set(key, { input, output, credits });
            priceControls.set(key, {
                input: item.modality === 'text' ? tokenField('Tokens in / 1K', input) : '—',
                output: item.modality === 'text' ? tokenField('Tokens out / 1K', output) : '—',
                credits: item.modality !== 'text' ? tokenField('Customer tokens', credits) : '—',
            });

            return { ...item, key };
        });
    });
}

async function load() {
    loading.value = true;
    try {
        const data = dataOf(await _.http.getJSON('/dashboard/api/admin/ai-pricing'));
        hydrate(data.prices || [], data.token_products);
    }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load the AI pricing catalog.') }; }
    finally { loading.value = false; }
}

async function save() {
    if (saving.value) return;
    saving.value = true; status.value = null;
    try {
        const payload = prices.value.map((item) => {
            const models = priceModels.get(item.key);

            return {
            provider_key: item.provider_key,
            model: item.model,
            modality: item.modality,
                input_tokens: item.modality === 'text' ? Number(models.input.value) : null,
                output_tokens: item.modality === 'text' ? Number(models.output.value) : null,
                customer_credits: item.modality !== 'text' && models.credits.value !== '' ? Number(models.credits.value) : null,
            };
        });
        const data = dataOf(await _.http.putJSON('/dashboard/api/admin/ai-pricing', { prices: payload }));
        hydrate(data.prices || [], data.token_products);
        status.value = { type: 'success', message: 'AI pricing catalog saved.' };
    } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Check every price before saving the catalog.') }; }
    finally { saving.value = false; }
}

async function updateStatus(item, action) {
    status.value = null;
    try {
        const data = dataOf(await _.http.patchJSON('/dashboard/api/admin/ai-pricing/status', {
            provider_key: item.provider_key,
            model: item.model,
            modality: item.modality,
            action,
        }));
        hydrate(data.prices || [], data.token_products);
        status.value = { type: 'success', message: action === 'delete' ? `${item.model} was removed from the pricing catalog.` : `${item.model} was ${action}d.` };
    } catch (error) { status.value = { type: 'danger', message: errorMessage(error, `Unable to ${action} this AI model.`) }; }
}

function confirmDelete(item) {
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.span('Remove AI model'), _.h3(`Remove ${item.model}?`), _.p('This removes the model from the pricing catalog. It does not change existing AI settings or jobs.')),
        content: ({ close }) => _.div({ class: 'at-aiPricingConfirm' },
            _.p('You can add it back later by restoring the model in the server configuration.'),
            _.div({ class: 'at-aiPricingConfirmActions' },
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({ color: 'danger', icon: 'delete', onClick: () => { updateStatus(item, 'delete'); close(); } }, 'Remove model'),
            ),
        ),
    } }).open();
}

function openAddDialog() {
    const providerKey = _.rod('');
    const providerName = _.rod('');
    const model = _.rod('');
    const modality = _.rod('text');
    const input = _.rod('');
    const output = _.rod('');
    const credits = _.rod('');
    const submitting = _.rod(false);
    const dialogStatus = _.rod(null);

    const inputControl = tokenField('Tokens in / 1K', input);
    const outputControl = tokenField('Tokens out / 1K', output);
    const creditsControl = tokenField('Customer tokens', credits);
    const submit = async (close) => {
        if (submitting.value) return;
        submitting.value = true; dialogStatus.value = null;
        try {
            const data = dataOf(await _.http.postJSON('/dashboard/api/admin/ai-pricing', {
                provider_key: providerKey.value.trim(),
                provider_name: providerName.value.trim(),
                model: model.value.trim(),
                modality: modality.value,
                input_tokens: modality.value === 'text' ? Number(input.value) : null,
                output_tokens: modality.value === 'text' ? Number(output.value) : null,
                customer_credits: modality.value !== 'text' && credits.value !== '' ? Number(credits.value) : null,
            }));
            hydrate(data.prices || [], data.token_products);
            status.value = { type: 'success', message: `${model.value.trim()} was added to the pricing catalog.` };
            close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: errorMessage(error, 'Complete every required model and price field.') }; }
        finally { submitting.value = false; }
    };

    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.span('AI token charges'), _.h3('Add model'), _.p('Add a provider model that is not in the default catalog.')),
        content: ({ close }) => _.div({ class: 'at-aiPricingAddDialog' },
            _.Input({ label: 'Provider key', model: providerKey, placeholder: 'e.g. at-elevenlabs', required: true }),
            _.Input({ label: 'Provider name', model: providerName, placeholder: 'e.g. AT · ElevenLabs', required: true }),
            _.Input({ label: 'Model', model, placeholder: 'e.g. multilingual-v2', required: true }),
            _.Select({ label: 'Type', model: modality, options: [{ value: 'text', label: 'Text · input/output tokens' }, { value: 'audio', label: 'Audio · generated minute' }, { value: 'image', label: 'Image · generated image' }] }),
            () => modality.value === 'text' ? _.div({ class: 'at-aiPricingAddCosts' }, inputControl, outputControl) : _.div({ class: 'at-aiPricingAddCosts' }, creditsControl),
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-aiPricingConfirmActions' },
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({ color: 'primary', icon: 'add', loading: submitting, onClick: () => submit(close) }, 'Add model'),
            ),
        ),
    } }).open();
}

function tokenField(label, model) {
    return _.Input({ label, type: 'number', min: 1, step: 1, model, placeholder: 'Tokens' });
}

function configuredActions(item, simulation) {
    const models = priceModels.get(item.key);
    if (item.modality === 'text') {
        return [
            {
                label: 'Input · 1K',
                tokens: Number(simulation.customerInput.value || 0),
                supplierCostCents: Math.round(Number(simulation.providerInput.value || 0) * 100),
                hasSupplierCost: simulation.providerInput.value !== '',
                supplierLabel: 'LLM cost',
            },
            {
                label: 'Output · 1K',
                tokens: Number(simulation.customerOutput.value || 0),
                supplierCostCents: Math.round(Number(simulation.providerOutput.value || 0) * 100),
                hasSupplierCost: simulation.providerOutput.value !== '',
                supplierLabel: 'LLM cost',
            },
        ].filter((action) => action.tokens > 0);
    }

    const tokens = item.modality === 'image'
        ? Number(simulation.customerTokens.value || 0)
        : Math.ceil(Number(simulation.units.value || 0) * Number(models?.credits.value || 0));
    const unit = item.modality === 'audio' ? 'Audio generation' : 'Image generation';

    const supplierCostCents = item.modality === 'image'
        ? Math.round(Number(simulation.providerCost.value || 0) * 100)
        : 0;

    return tokens > 0 ? [{ label: unit, tokens, supplierCostCents, hasSupplierCost: item.modality === 'image' && simulation.providerCost.value !== '', supplierLabel: 'GPT cost' }] : [];
}

function money(cents, currency) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(Number(cents || 0) / 100);
}

function tokenRate(product) {
    const rate = Number(product.price_cents || 0) / 100 / Number(product.credits || 1);

    return `${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(rate)} ${product.currency || 'EUR'} / token`;
}

function moneyPrecise(cents, currency) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(cents || 0) / 100);
}

function productCard(product, actions, type) {
    const tokenValueCents = Number(product.price_cents || 0) / Number(product.credits || 1);

    return _.article({ class: 'at-aiPricingCalculatorProduct' },
        _.div({ class: 'at-aiPricingCalculatorProductHeader' },
            _.div(_.strong(product.name), _.span(`${Number(product.credits || 0).toLocaleString('it-IT')} tokens${type === 'plan' ? ' / month' : ''} · ${tokenRate(product)}`)),
            _.div(_.strong(money(product.price_cents, product.currency)), _.span(type === 'plan' ? '/ month' : 'one-time')),
        ),
        _.div({ class: 'at-aiPricingCalculatorActions' }, actions.map((action) => {
            const customerValueCents = tokenValueCents * action.tokens;
            const marginCents = customerValueCents - Number(action.supplierCostCents || 0);
            const breakEvenTokens = action.hasSupplierCost && tokenValueCents > 0
                ? Math.ceil(Number(action.supplierCostCents || 0) / tokenValueCents)
                : null;

            return _.div({ class: `at-aiPricingCalculatorAction ${action.hasSupplierCost ? (marginCents < 0 ? 'is-loss' : 'is-profit') : ''}` },
                _.div(
                    _.strong(action.label),
                    _.span(action.hasSupplierCost ? `Provider cost ${moneyPrecise(action.supplierCostCents, product.currency)} · minimum ${breakEvenTokens.toLocaleString('it-IT')} tokens` : 'Enter provider cost to calculate the minimum charge'),
                ),
                _.div(
                    _.strong(`${action.tokens.toLocaleString('it-IT')} customer tokens`),
                    _.span(`${moneyPrecise(customerValueCents, product.currency)} customer value`),
                    action.hasSupplierCost ? _.span({ class: 'at-aiPricingCalculatorActionMargin' }, `${marginCents < 0 ? 'Loss' : 'Margin'} ${moneyPrecise(marginCents, product.currency)}`) : null,
                ),
            );
        })),
    );
}

function calculationSection(title, products, actions, type) {
    const activeProducts = products.filter((product) => product.is_active && Number(product.credits || 0) > 0);

    return _.section({ class: 'at-aiPricingCalculatorSection' },
        _.div(_.h4(title), _.span(type === 'plan' ? 'Monthly plans currently available to customers.' : 'One-time token packages currently available to customers.')),
        activeProducts.length
            ? _.div({ class: 'at-aiPricingCalculatorProducts' }, activeProducts.map((product) => productCard(product, actions, type)))
            : _.p({ class: 'at-aiPricingCalculatorEmpty' }, 'No active products are available.'),
    );
}

function simulationControls(item, simulation) {
    if (item.modality === 'text') {
        return _.div({ class: 'at-aiPricingSimulationFields' },
            _.Input({ label: 'Provider cost in / 1K (€)', type: 'number', min: 0, step: '0.000001', model: simulation.providerInput, placeholder: 'e.g. 0.0010' }),
            _.Input({ label: 'Provider cost out / 1K (€)', type: 'number', min: 0, step: '0.000001', model: simulation.providerOutput, placeholder: 'e.g. 0.0040' }),
            _.Input({ label: 'Customer tokens in / 1K', type: 'number', min: 1, step: 1, model: simulation.customerInput }),
            _.Input({ label: 'Customer tokens out / 1K', type: 'number', min: 1, step: 1, model: simulation.customerOutput }),
        );
    }

    if (item.modality === 'image') {
        return _.div({ class: 'at-aiPricingSimulationFields' },
            _.Input({ label: 'Customer tokens per image', type: 'number', min: 1, step: 1, model: simulation.customerTokens }),
            _.Input({ label: 'GPT cost for one image (€)', type: 'number', min: 0, step: '0.0001', model: simulation.providerCost, placeholder: 'e.g. 0.0560' }),
        );
    }

    return _.div({ class: 'at-aiPricingSimulationFields' },
        _.Input({ label: 'Audio minutes to simulate', type: 'number', min: 0, step: '0.1', model: simulation.units }),
    );
}

function openCalculator(item) {
    const simulation = item.modality === 'text'
        ? {
            providerInput: _.rod(''),
            providerOutput: _.rod(''),
            customerInput: _.rod(priceValue(priceModels.get(item.key)?.input.value)),
            customerOutput: _.rod(priceValue(priceModels.get(item.key)?.output.value)),
        }
        : item.modality === 'image'
            ? { customerTokens: _.rod(priceValue(priceModels.get(item.key)?.credits.value)), providerCost: _.rod('') }
            : { units: _.rod('1') };

    _.Dialog({ size: 'xl', stickyActions: true, slots: {
        header: _.div(_.span('Token calculator'), _.h3(item.model), _.p('See this model’s configured token charge across monthly plans and one-time packages.')),
        content: _.div({ class: 'at-aiPricingCalculator' },
            _.Alert({ type: 'info', icon: 'calculate', message: item.modality === 'image' ? 'This calculation is for one generated image. Adjust the customer token charge and current GPT cost in EUR to compare customer value, provider cost and estimated gross margin.' : item.modality === 'text' ? 'Enter the provider cost and customer token charge for one thousand input/output tokens. Each card shows the minimum token charge to break even and the profit or loss from your chosen charge.' : 'Choose the usage to simulate. The value uses the configured customer-token charge and does not include provider costs.' }),
            simulationControls(item, simulation),
            () => {
                const actions = configuredActions(item, simulation);

                return actions.length
                    ? _.div(
                        calculationSection('Monthly subscriptions', tokenProducts.plans, actions, 'plan'),
                        calculationSection('One-time token packages', tokenProducts.packages, actions, 'package'),
                    )
                    : _.Alert({ type: 'warning', message: 'Enter a token charge in this row and a simulated usage greater than zero.' });
            },
        ),
        footer: ({ close }) => _.Btn({ color: 'secondary', onClick: close }, 'Close'),
    } }).open();
}

export default function adminAiPricingPage() {
    load();
    window.AudiobookTools?.setPageHeaderActions?.([]);

    return _.main({ class: 'at-aiPricingPage' },
        _.section({ class: 'at-aiPricingHero' },
            _.div(_.span('Administration'), _.h2('AI token charges'), _.p('Configure what customers spend. Text models use separate input and output token charges; audio and image models use tokens per generated unit.')),
            _.div({ class: 'at-aiPricingHeroActions' },
                _.Btn({ color: 'secondary', icon: 'add', onClick: openAddDialog }, 'Add model'),
                _.Btn({ color: 'primary', icon: 'save', loading: saving, onClick: save }, 'Save charges'),
            ),
        ),
        () => status.value ? _.Alert(status.value) : null,
        _.section({ class: 'at-aiPricingGuide' },
            _.Icon({ name: 'info' }),
            _.div(_.strong('Token basis'), _.span('Set how many customer tokens each AI action consumes. Text has separate input and output charges; audio is charged per generated minute and images per generated image.')),
        ),
        () => loading.value ? _.div({ class: 'at-aiPricingLoading' }, 'Loading AI models…') : _.section({ class: 'at-aiPricingCard' },
            _.div({ class: 'at-aiPricingTableWrap' },
                _.Table({
                    class: 'at-aiPricingTable',
                    rows: () => prices.value,
                    rowKey: (item) => item.key,
                    pageSize: 50,
                    pageSizeOptions: [50],
                    hideFooter: true,
                    emptyText: 'No AI models are configured.',
                    columns: [
                        { key: 'provider_name', label: 'Provider' },
                        { key: 'model', label: 'Model', render: (item) => _.code(item.model) },
                        { key: 'modality', label: 'Type', render: (item) => _.span({ class: `at-aiPricingType is-${item.modality}` }, item.modality) },
                        { key: 'unit', label: 'Charge basis', render: unitLabel },
                        { key: 'input', label: 'Tokens in / 1K', render: (item) => priceControls.get(item.key)?.input || '—' },
                        { key: 'output', label: 'Tokens out / 1K', render: (item) => priceControls.get(item.key)?.output },
                        { key: 'credits', label: 'Tokens / unit', render: (item) => priceControls.get(item.key)?.credits },
                    ],
                    actionsLabel: 'Actions',
                    actions: (item) => _.div({ class: 'at-aiPricingActions' },
                        _.Btn({ dense: true, color: 'secondary', size: 'sm', icon: 'calculate', title: 'Calculate token value', 'aria-label': 'Calculate token value', onClick: () => openCalculator(item) }),
                        _.Btn({ dense: true, color: item.is_enabled ? 'warning' : 'success', size: 'sm', icon: item.is_enabled ? 'pause_circle' : 'play_circle', title: item.is_enabled ? 'Disable model' : 'Enable model', 'aria-label': item.is_enabled ? 'Disable model' : 'Enable model', onClick: () => updateStatus(item, item.is_enabled ? 'disable' : 'enable') }),
                        _.Btn({ dense: true, color: 'danger', size: 'sm', icon: 'delete', title: 'Remove model', 'aria-label': 'Remove model', onClick: () => confirmDelete(item) }),
                    ),
                }),
            ),
        ),
    );
}
