const EDITOR_PREFERENCES_KEY = 'audiobookTools.editor.preferences';

const indexView = _.rod(true);
const commandView = _.rod(true);
const confirmPanelActions = _.rod(true);
const pageFormat = _.rod('book');
const rightWorkspaceTool = _.rod('chat');
const translationTargetLocale = _.rod('en');
const versionFilter = _.rod('all');
const versionSortOrder = _.rod('newest');
const versionSearch = _.rod('');
const bookActivityFilter = _.rod('all');
const blockCommentFilter = _.rod('open');
const blockCommentAnchorFilter = _.rod('all');
const settingsStatus = _.rod(null);
const aiProviders = _.rod([]);
const aiServices = _.rod([]);
const aiSettingsByService = _.rod({});
const aiSelectedService = _.rod('chat');
const aiProviderModel = _.rod('mock');
const aiModelModel = _.rod('mock-correction-v1');
const aiApiKey = _.rod('');
const aiSystemPrompt = _.rod('');
const aiDefaultsStatus = _.rod('idle');
const aiDefaultsContextKey = _.rod(null);
const savingAiDefault = _.rod(false);

const pageFormatOptions = [
    { label: 'Book - Novel', value: 'book' },
    { label: 'Paperback 5x8', value: 'paperback-5x8' },
    { label: 'Paperback 6x9', value: 'paperback-6x9' },
    { label: 'A5', value: 'a5' },
    { label: 'A4', value: 'a4' },
    { label: 'US Letter', value: 'letter' },
    { label: 'Screen draft', value: 'draft' },
];

const rightWorkspaceToolOptions = [
    { label: 'AI Chat', value: 'chat' },
    { label: 'Comments', value: 'comments' },
    { label: 'Correct', value: 'correct' },
    { label: 'Voices', value: 'voices' },
    { label: 'Audio', value: 'audio' },
    { label: 'Translate', value: 'translate' },
    { label: 'Versions', value: 'versions' },
    { label: 'Activity', value: 'activity' },
    { label: 'Settings', value: 'settings' },
];

const translationLocaleOptions = [
    { label: 'English', value: 'en' },
    { label: 'Italian', value: 'it' },
    { label: 'Spanish', value: 'es' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Polish', value: 'pl' },
    { label: 'Turkish', value: 'tr' },
    { label: 'Russian', value: 'ru' },
    { label: 'Dutch', value: 'nl' },
    { label: 'Czech', value: 'cs' },
    { label: 'Arabic', value: 'ar' },
    { label: 'Chinese', value: 'zh' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Hungarian', value: 'hu' },
    { label: 'Korean', value: 'ko' },
];

const versionFilterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Current', value: 'current' },
    { label: 'Activity', value: 'activity' },
    { label: 'Stale', value: 'stale' },
    { label: 'AI', value: 'ai' },
];

const versionSortOptions = [
    { label: 'Newest first', value: 'newest' },
    { label: 'Oldest first', value: 'oldest' },
];

const activityFilterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Action', value: 'action' },
    { label: 'Review', value: 'review' },
    { label: 'Stale', value: 'stale' },
];

const commentFilterOptions = [
    { label: 'Open', value: 'open' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Stale', value: 'stale' },
    { label: 'All', value: 'all' },
];

const commentAnchorFilterOptions = [
    { label: 'Any anchor', value: 'all' },
    { label: 'Current anchor', value: 'anchored' },
    { label: 'Matched anchor', value: 'reanchored' },
    { label: 'Lost anchor', value: 'stale' },
];

function readEditorPreferences() {
    try {
        return JSON.parse(globalThis.localStorage?.getItem(EDITOR_PREFERENCES_KEY) || '{}');
    } catch {
        return {};
    }
}

function writeEditorPreferences(preferences) {
    try {
        globalThis.localStorage?.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences));
        return true;
    } catch {
        return false;
    }
}

function loadSettingsPreferences() {
    const preferences = readEditorPreferences();
    const pageFormats = new Set(pageFormatOptions.map((option) => option.value));
    const tools = new Set(rightWorkspaceToolOptions.map((option) => option.value));
    const locales = new Set(translationLocaleOptions.map((option) => option.value));

    applyLocalValue(indexView, typeof preferences.indexView === 'boolean' ? preferences.indexView : true);
    applyLocalValue(commandView, typeof preferences.commandView === 'boolean' ? preferences.commandView : true);
    applyLocalValue(confirmPanelActions, typeof preferences.confirmPanelActions === 'boolean' ? preferences.confirmPanelActions : true);
    applyLocalValue(pageFormat, pageFormats.has(preferences.pageFormat) ? preferences.pageFormat : 'book');
    applyLocalValue(rightWorkspaceTool, tools.has(preferences.rightWorkspaceTool) ? preferences.rightWorkspaceTool : 'chat');
    applyLocalValue(translationTargetLocale, locales.has(preferences.translationTargetLocale) ? preferences.translationTargetLocale : 'en');
    applyLocalValue(versionFilter, hasOption(versionFilterOptions, preferences.versionFilter) ? preferences.versionFilter : 'all');
    applyLocalValue(versionSortOrder, hasOption(versionSortOptions, preferences.versionSortOrder) ? preferences.versionSortOrder : 'newest');
    applyLocalValue(versionSearch, typeof preferences.versionSearch === 'string' ? preferences.versionSearch : '');
    applyLocalValue(bookActivityFilter, hasOption(activityFilterOptions, preferences.bookActivityFilter) ? preferences.bookActivityFilter : 'all');
    applyLocalValue(blockCommentFilter, hasOption(commentFilterOptions, preferences.blockCommentFilter) ? preferences.blockCommentFilter : 'open');
    applyLocalValue(blockCommentAnchorFilter, hasOption(commentAnchorFilterOptions, preferences.blockCommentAnchorFilter) ? preferences.blockCommentAnchorFilter : 'all');
}

function applyLocalValue(model, value) {
    if (model.value !== value) {
        model.value = value;
    }
}

function hasOption(options, value) {
    return options.some((option) => option.value === value);
}

function inputChangeValue(value, fallback = '') {
    if (value?.target) return value.target.value;
    if (typeof value === 'string') return value;

    return fallback;
}

function normalizeDataPayload(payload) {
    return payload?.data || payload || {};
}

function selectedAiProvider() {
    return aiProviders.value.find((provider) => provider.provider_key === aiProviderModel.value)
        || aiProviders.value[0]
        || null;
}

function selectedAiModelOptions() {
    return selectedAiProvider()?.models || [];
}

function applyAiDefaultPayload(payload, service) {
    const data = normalizeDataPayload(payload);
    const setting = data.setting || {
        service,
        provider_key: 'mock',
        model: 'mock-correction-v1',
        system_prompt: '',
    };

    aiProviders.value = data.providers || [];
    aiServices.value = data.services || [];
    aiSettingsByService.value = {
        ...aiSettingsByService.value,
        [service]: setting,
    };
    aiProviderModel.value = setting.provider_key || 'mock';
    aiModelModel.value = setting.model || selectedAiProvider()?.default_model || 'mock-correction-v1';
    aiSystemPrompt.value = setting.system_prompt || '';
    aiApiKey.value = '';
    aiDefaultsStatus.value = 'ready';
}

function loadAiDefaults(service = aiSelectedService.value, { force = false } = {}) {
    const contextKey = `global:${service}`;

    if (!force && aiDefaultsContextKey.value === contextKey && aiDefaultsStatus.value === 'loading') return;
    if (!force && aiDefaultsContextKey.value === contextKey && aiDefaultsStatus.value !== 'error') return;

    aiDefaultsContextKey.value = contextKey;
    aiDefaultsStatus.value = 'loading';

    const params = new URLSearchParams({ service });

    _.http.getJSON(`/dashboard/api/ai/providers?${params.toString()}`)
        .then((payload) => applyAiDefaultPayload(payload, service))
        .catch(() => {
            aiDefaultsStatus.value = 'error';
        });
}

function setAiSelectedService(value) {
    const service = inputChangeValue(value, aiSelectedService.value);

    if (aiSelectedService.value !== service) {
        aiSelectedService.value = service;
    }

    loadAiDefaults(service, { force: true });
}

function setAiProvider(value) {
    const providerKey = inputChangeValue(value, aiProviderModel.value);
    const provider = aiProviders.value.find((item) => item.provider_key === providerKey) || null;
    const nextModel = provider?.models?.includes(aiModelModel.value)
        ? aiModelModel.value
        : (provider?.default_model || provider?.models?.[0] || '');

    aiProviderModel.value = providerKey;
    aiModelModel.value = nextModel;
}

function setAiModel(value) {
    aiModelModel.value = inputChangeValue(value, aiModelModel.value);
}

function setAiSystemPrompt(value) {
    aiSystemPrompt.value = inputChangeValue(value, aiSystemPrompt.value);
}

function setAiApiKey(value) {
    aiApiKey.value = inputChangeValue(value, aiApiKey.value);
}

async function saveAiDefaultSetting() {
    if (savingAiDefault.value) return;

    savingAiDefault.value = true;

    try {
        const payload = await _.http.patchJSON('/dashboard/api/ai/settings', {
            service: aiSelectedService.value,
            provider_key: aiProviderModel.value,
            model: aiModelModel.value,
            api_key: aiApiKey.value.trim() || null,
            system_prompt: aiSystemPrompt.value.trim(),
        });
        const data = normalizeDataPayload(payload);

        if (data.setting) {
            aiSettingsByService.value = {
                ...aiSettingsByService.value,
                [data.setting.service]: data.setting,
            };
            aiProviderModel.value = data.setting.provider_key;
            aiModelModel.value = data.setting.model;
            aiSystemPrompt.value = data.setting.system_prompt || '';
        }

        aiApiKey.value = '';
        settingsStatus.value = {
            type: 'success',
            title: 'AI default saved',
            message: 'The selected AI service default was updated.',
        };
        loadAiDefaults(aiSelectedService.value, { force: true });
    } catch {
        settingsStatus.value = {
            type: 'danger',
            title: 'AI default not saved',
            message: 'Check provider, model and API key, then try again.',
        };
    } finally {
        savingAiDefault.value = false;
    }
}

function updatePreference(key, value) {
    const saved = writeEditorPreferences({
        ...readEditorPreferences(),
        [key]: value,
    });

    settingsStatus.value = saved
        ? {
            type: 'success',
            title: 'Settings saved',
            message: 'Editor preferences were updated for this browser.',
        }
        : {
            type: 'danger',
            title: 'Settings not saved',
            message: 'The browser did not allow local preference storage.',
        };
}

function setConfirmPanelActions(enabled) {
    confirmPanelActions.value = Boolean(enabled);
    updatePreference('confirmPanelActions', confirmPanelActions.value);
}

function setBooleanPreference(key, model, enabled) {
    model.value = Boolean(enabled);
    updatePreference(key, model.value);
}

function setStringPreference(key, model, value) {
    const nextValue = inputChangeValue(value, model.value);

    model.value = nextValue;
    updatePreference(key, nextValue);
}

function resetEditorPreferences() {
    const saved = writeEditorPreferences({});

    loadSettingsPreferences();
    settingsStatus.value = saved
        ? {
            type: 'success',
            title: 'Preferences reset',
            message: 'Editor preferences were reset for this browser.',
        }
        : {
            type: 'danger',
            title: 'Preferences not reset',
            message: 'The browser did not allow local preference storage.',
        };
}

function statusAlert() {
    const status = settingsStatus.value;
    if (!status) return null;

    return _.Alert(status);
}

function editorSafetyCard() {
    return _.Card({
        icon: 'verified_user',
        title: 'Editor safety',
        subtitle: 'Controls for actions that change text, review status, translation status or audio output.',
        body: _.Grid({ gap: 'md' },
            _.GridCol({ span: 12, mobile: { span: 12 } },
                _.Toggle({
                    label: () => confirmPanelActions.value ? 'Confirm panel actions: On' : 'Confirm panel actions: Off',
                    model: confirmPanelActions,
                    onChange: (value) => setConfirmPanelActions(Boolean(value)),
                })
            ),
            _.GridCol({ span: 12, mobile: { span: 12 } },
                _.Alert({
                    type: 'info',
                    title: 'Activity always confirms',
                    message: 'The Activity queue keeps confirmation dialogs mandatory even when panel confirmations are disabled.',
                })
            )
        ),
    });
}

function workspacePreferencesCard() {
    return _.Card({
        icon: 'dashboard_customize',
        title: 'Workspace preferences',
        subtitle: 'Local editor preferences saved in this browser.',
        body: _.Grid({ gap: 'md' },
            _.GridCol({ span: 12, mobile: { span: 12 } },
                _.Alert({
                    type: 'light',
                    title: 'Stored locally',
                    message: 'These preferences are restored from local storage when the editor opens.',
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Toggle({
                    label: () => indexView.value ? 'Book index: On' : 'Book index: Off',
                    model: indexView,
                    onChange: (value) => setBooleanPreference('indexView', indexView, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Toggle({
                    label: () => commandView.value ? 'Command bar: On' : 'Command bar: Off',
                    model: commandView,
                    onChange: (value) => setBooleanPreference('commandView', commandView, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Page format',
                    model: pageFormat,
                    options: pageFormatOptions,
                    onChange: (value) => setStringPreference('pageFormat', pageFormat, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Default right tool',
                    model: rightWorkspaceTool,
                    options: rightWorkspaceToolOptions,
                    onChange: (value) => setStringPreference('rightWorkspaceTool', rightWorkspaceTool, value),
                })
            ),
            _.GridCol({ span: 12, mobile: { span: 12 } },
                _.Btn({
                    type: 'button',
                    color: 'secondary',
                    icon: 'restart_alt',
                    onClick: resetEditorPreferences,
                }, 'Reset editor preferences')
            )
        ),
    });
}

function panelDefaultsCard() {
    return _.Card({
        icon: 'filter_alt',
        title: 'Panel defaults',
        subtitle: 'Initial filters used when the book editor opens.',
        body: _.Grid({ gap: 'md' },
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Activity filter',
                    model: bookActivityFilter,
                    options: activityFilterOptions,
                    onChange: (value) => setStringPreference('bookActivityFilter', bookActivityFilter, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Comment status filter',
                    model: blockCommentFilter,
                    options: commentFilterOptions,
                    onChange: (value) => setStringPreference('blockCommentFilter', blockCommentFilter, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Comment anchor filter',
                    model: blockCommentAnchorFilter,
                    options: commentAnchorFilterOptions,
                    onChange: (value) => setStringPreference('blockCommentAnchorFilter', blockCommentAnchorFilter, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Version filter',
                    model: versionFilter,
                    options: versionFilterOptions,
                    onChange: (value) => setStringPreference('versionFilter', versionFilter, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Version order',
                    model: versionSortOrder,
                    options: versionSortOptions,
                    onChange: (value) => setStringPreference('versionSortOrder', versionSortOrder, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Input({
                    label: 'Version search',
                    model: versionSearch,
                    placeholder: 'Optional search text',
                    onInput: (value) => setStringPreference('versionSearch', versionSearch, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Translation target',
                    model: translationTargetLocale,
                    options: translationLocaleOptions,
                    onChange: (value) => setStringPreference('translationTargetLocale', translationTargetLocale, value),
                })
            )
        ),
    });
}

function aiDefaultSummaryCards() {
    const services = aiServices.value.length ? aiServices.value : [
        { key: 'chat', label: 'AI Chat' },
        { key: 'comments', label: 'Comments' },
        { key: 'correction', label: 'Correct' },
        { key: 'voices', label: 'Voices' },
        { key: 'audio', label: 'Audio' },
        { key: 'translate', label: 'Translate' },
        { key: 'versions', label: 'Versions' },
    ];

    return _.Grid({ gap: 'sm' },
        services
            .filter((service) => service.key !== 'rewrite')
            .map((service) => {
                const setting = aiSettingsByService.value[service.key];
                const provider = aiProviders.value.find((item) => item.provider_key === setting?.provider_key);
                const label = provider?.name || setting?.provider_key || 'Default';
                const model = setting?.model || provider?.default_model || 'Not loaded';

                return _.GridCol({ span: 6, mobile: { span: 12 } },
                    _.Alert({
                        type: service.key === aiSelectedService.value ? 'info' : 'light',
                        title: service.label,
                        message: `${label} - ${model}`,
                    })
                );
            })
    );
}

function aiDefaultsCard() {
    const provider = selectedAiProvider();
    const modelOptions = selectedAiModelOptions().map((model) => ({ label: model, value: model }));
    const providerOptions = aiProviders.value
        .filter((item) => item.is_selectable !== false)
        .map((item) => ({ label: item.name, value: item.provider_key }));
    const serviceOptions = aiServices.value
        .filter((service) => service.key !== 'rewrite')
        .map((service) => ({ label: service.label, value: service.key }));

    return _.Card({
        icon: 'psychology',
        title: 'AI defaults',
        subtitle: 'Global provider and model used when a book or tool has no specific override.',
        body: _.Grid({ gap: 'md' },
            aiDefaultsStatus.value === 'loading' ? _.GridCol({ span: 12 },
                _.Alert({
                    type: 'info',
                    title: 'Loading AI providers',
                    message: 'Provider and model options are loading.',
                })
            ) : null,
            aiDefaultsStatus.value === 'error' ? _.GridCol({ span: 12 },
                _.Alert({
                    type: 'danger',
                    title: 'AI providers unavailable',
                    message: 'Unable to load provider settings.',
                })
            ) : null,
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Service',
                    icon: 'category',
                    model: aiSelectedService,
                    options: serviceOptions,
                    onChange: setAiSelectedService,
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Provider',
                    icon: 'hub',
                    model: aiProviderModel,
                    options: providerOptions,
                    onChange: setAiProvider,
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Select({
                    label: 'Model',
                    icon: 'memory',
                    model: aiModelModel,
                    options: modelOptions,
                    onChange: setAiModel,
                })
            ),
            provider?.connection_mode !== 'managed' ? _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Input({
                    label: 'API key',
                    icon: 'key',
                    model: aiApiKey,
                    type: 'password',
                    placeholder: provider?.has_api_key ? 'Leave empty to keep the saved key' : 'Paste provider API key',
                    onInput: setAiApiKey,
                })
            ) : null,
            _.GridCol({ span: 12 },
                _.Textarea({
                    label: 'System prompt',
                    icon: 'terminal',
                    rows: 5,
                    model: aiSystemPrompt,
                    placeholder: 'Prompt used by this service when no book override exists',
                    onInput: setAiSystemPrompt,
                })
            ),
            provider ? _.GridCol({ span: 12 },
                _.Alert({
                    type: provider.connection_mode === 'managed' && !provider.is_configured ? 'warning' : 'light',
                    title: provider.name,
                    message: provider.connection_mode === 'managed'
                        ? provider.is_configured
                            ? `${provider.billing_label}. ${provider.privacy_label}`
                            : 'This Audiobook Tools provider is coming soon and cannot be selected yet.'
                        : `${provider.billing_label || 'Your provider'}. ${provider.privacy_label || provider.base_url || 'Provider endpoint'}`,
                })
            ) : null,
            _.GridCol({ span: 12 },
                _.Btn({
                    type: 'button',
                    color: 'primary',
                    icon: 'save',
                    loading: savingAiDefault,
                    disabled: aiDefaultsStatus.value === 'loading' || !aiProviderModel.value || !aiModelModel.value || provider?.is_selectable === false,
                    onClick: saveAiDefaultSetting,
                }, savingAiDefault.value ? 'Saving AI default...' : 'Save AI default')
            ),
            _.GridCol({ span: 12 }, aiDefaultSummaryCards())
        ),
    });
}

export default function setting() {
    loadSettingsPreferences();
    loadAiDefaults();

    return [
        _.Card({
            icon: 'settings',
            title: 'Settings',
            subtitle: 'Application and editor preferences.',
            body: _.Grid({ gap: 'lg' },
                _.GridCol({ span: 24, mobile: { span: 12 } }, editorSafetyCard()),
                _.GridCol({ span: 24, mobile: { span: 12 } }, workspacePreferencesCard()),
                _.GridCol({ span: 24 }, panelDefaultsCard()),
                _.GridCol({ span: 24 }, aiDefaultsCard()),
                _.GridCol({ span: 12 }, () => settingsStatus.value ? statusAlert() : null),
            ),
        }),
    ];
}
