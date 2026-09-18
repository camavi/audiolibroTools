import '../../../css/adminAiPricing.css';

const prices = _.rod([]);
const loading = _.rod(true);
const saving = _.rod(false);
const status = _.rod(null);
const priceModels = new Map();
const priceControls = new Map();

const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const priceValue = (value) => value === null || value === undefined ? '' : String(value);
const unitLabel = (item) => ({ per_million_tokens: 'USD / 1M tokens', per_audio_minute: 'USD / audio minute', per_image: 'USD / image' })[item.pricing_unit] || item.pricing_unit;
const priceKey = (item) => `${item.provider_key}:${item.model}:${item.modality}`;

function hydrate(items) {
    JSswift.reactive.untracked(() => {
        priceModels.clear();
        priceControls.clear();
        prices.value = items.map((item) => {
            const input = _.rod(priceValue(item.input_price_usd));
            const output = _.rod(priceValue(item.output_price_usd));
            const unit = _.rod(priceValue(item.unit_price_usd));
            const key = priceKey(item);

            // Models and DOM controls stay outside the reactive row objects.
            // JSswift proxies nested objects in a rod; proxying an HTMLElement
            // makes native DOM getters throw “Illegal invocation”.
            priceModels.set(key, { input, output, unit });
            priceControls.set(key, {
                input: item.modality === 'text' ? priceField('Input', input, '0.000000') : null,
                output: item.modality === 'text' ? priceField('Output', output, '0.000000') : priceField('Unit price', unit, '0.000000'),
            });

            return { ...item, key };
        });
    });
}

async function load() {
    loading.value = true;
    try { hydrate(dataOf(await _.http.getJSON('/dashboard/api/admin/ai-pricing')).prices || []); }
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
                input_price_usd: item.modality === 'text' ? Number(models.input.value) : null,
                output_price_usd: item.modality === 'text' ? Number(models.output.value) : null,
                unit_price_usd: item.modality === 'text' ? null : Number(models.unit.value),
            };
        });
        const data = dataOf(await _.http.putJSON('/dashboard/api/admin/ai-pricing', { prices: payload }));
        hydrate(data.prices || []);
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
        hydrate(data.prices || []);
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
    const unit = _.rod('');
    const submitting = _.rod(false);
    const dialogStatus = _.rod(null);

    const inputControl = priceField('Input · USD / 1M tokens', input, '0.000000');
    const outputControl = priceField('Output · USD / 1M tokens', output, '0.000000');
    const unitControl = priceField('Unit price', unit, '0.000000');
    const submit = async (close) => {
        if (submitting.value) return;
        submitting.value = true; dialogStatus.value = null;
        try {
            const data = dataOf(await _.http.postJSON('/dashboard/api/admin/ai-pricing', {
                provider_key: providerKey.value.trim(),
                provider_name: providerName.value.trim(),
                model: model.value.trim(),
                modality: modality.value,
                input_price_usd: modality.value === 'text' ? Number(input.value) : null,
                output_price_usd: modality.value === 'text' ? Number(output.value) : null,
                unit_price_usd: modality.value === 'text' ? null : Number(unit.value),
            }));
            hydrate(data.prices || []);
            status.value = { type: 'success', message: `${model.value.trim()} was added to the pricing catalog.` };
            close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: errorMessage(error, 'Complete every required model and price field.') }; }
        finally { submitting.value = false; }
    };

    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.span('AI pricing'), _.h3('Add model'), _.p('Add a provider model that is not in the default catalog.')),
        content: ({ close }) => _.div({ class: 'at-aiPricingAddDialog' },
            _.Input({ label: 'Provider key', model: providerKey, placeholder: 'e.g. at-elevenlabs', required: true }),
            _.Input({ label: 'Provider name', model: providerName, placeholder: 'e.g. AT · ElevenLabs', required: true }),
            _.Input({ label: 'Model', model, placeholder: 'e.g. multilingual-v2', required: true }),
            _.Select({ label: 'Type', model: modality, options: [{ value: 'text', label: 'Text · input/output tokens' }, { value: 'audio', label: 'Audio · generated minute' }, { value: 'image', label: 'Image · generated image' }] }),
            () => modality.value === 'text' ? _.div({ class: 'at-aiPricingAddCosts' }, inputControl, outputControl) : unitControl,
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-aiPricingConfirmActions' },
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({ color: 'primary', icon: 'add', loading: submitting, onClick: () => submit(close) }, 'Add model'),
            ),
        ),
    } }).open();
}

function priceField(label, model, placeholder) {
    return _.Input({ label, type: 'number', min: 0, step: '0.000001', model, placeholder, prefix: '$' });
}

export default function adminAiPricingPage() {
    load();
    window.AudiobookTools?.setPageHeaderActions?.([]);

    return _.main({ class: 'at-aiPricingPage' },
        _.section({ class: 'at-aiPricingHero' },
            _.div(_.span('Administration'), _.h2('AI model pricing'), _.p('Maintain the supplier cost catalog. Text models use separate input and output prices; audio and image models use one price per unit.')),
            _.div({ class: 'at-aiPricingHeroActions' },
                _.Btn({ color: 'secondary', icon: 'add', onClick: openAddDialog }, 'Add model'),
                _.Btn({ color: 'primary', icon: 'save', loading: saving, onClick: save }, 'Save pricing'),
            ),
        ),
        () => status.value ? _.Alert(status.value) : null,
        _.section({ class: 'at-aiPricingGuide' },
            _.Icon({ name: 'info' }),
            _.div(_.strong('Cost basis'), _.span('Text is measured per million input/output tokens. Audio is measured by generated audio minute. Images are measured per generated image. These values are a catalog for cost tracking; they do not change customer token charges yet.')),
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
                        { key: 'unit', label: 'Cost basis', render: unitLabel },
                        { key: 'input', label: 'Input', render: (item) => priceControls.get(item.key)?.input || '—' },
                        { key: 'output', label: 'Output', render: (item) => priceControls.get(item.key)?.output },
                    ],
                    actionsLabel: 'Actions',
                    actions: (item) => _.div({ class: 'at-aiPricingActions' },
                        _.Btn({ dense: true, color: item.is_enabled ? 'warning' : 'success', size: 'sm', icon: item.is_enabled ? 'pause_circle' : 'play_circle', title: item.is_enabled ? 'Disable model' : 'Enable model', onClick: () => updateStatus(item, item.is_enabled ? 'disable' : 'enable') }, item.is_enabled ? 'Disable' : 'Enable'),
                        _.Btn({ dense: true, color: 'danger', size: 'sm', icon: 'delete', title: 'Remove model', onClick: () => confirmDelete(item) }, 'Remove'),
                    ),
                }),
            ),
        ),
    );
}
