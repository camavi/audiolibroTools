import '../../../css/setting.css';

const EDITOR_PREFERENCES_KEY = 'audiobookTools.editor.preferences';

const indexView = _.rod(true);
const commandView = _.rod(true);
const confirmPanelActions = _.rod(true);
const pageFormat = _.rod('book');
const rightWorkspaceTool = _.rod('chat');
const translationTargetLocale = _.rod('en');
const versionFilter = _.rod('all');
const versionSortOrder = _.rod('newest');
const bookActivityFilter = _.rod('all');
const blockCommentFilter = _.rod('open');
const blockCommentAnchorFilter = _.rod('all');
const settingsStatus = _.rod(null);
const aiProviders = _.rod([]);
const aiServices = _.rod([]);
const aiDefaultForms = new Map();
const aiServiceFallback = [
    { key: 'chat', label: 'AI Chat', icon: 'forum' },
    { key: 'comments', label: 'Comments', icon: 'comment' },
    { key: 'correction', label: 'Correct', icon: 'spellcheck' },
    { key: 'audio', label: 'Audio', icon: 'graphic_eq' },
    { key: 'translate', label: 'Translate', icon: 'translate' },
    { key: 'versions', label: 'Versions', icon: 'history' },
];

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

function aiDefaultForm(service) {
    if (!aiDefaultForms.has(service)) {
        aiDefaultForms.set(service, {
            service,
            provider: _.rod('mock'),
            model: _.rod(service === 'translate' ? 'mock-translation-v1' : 'mock-correction-v1'),
            apiKey: _.rod(''),
            systemPrompt: _.rod(''),
            status: _.rod('idle'),
            saving: _.rod(false),
        });
    }

    return aiDefaultForms.get(service);
}

function providerForAiDefault(form) {
    return aiProviders.value.find((provider) => provider.provider_key === form.provider.value)
        || aiProviders.value[0]
        || null;
}

function providerRequiresApiKey(provider) {
    return provider?.provider_key !== 'mock' && provider?.connection_mode !== 'managed';
}

function aiDefaultServices() {
    const services = aiServices.value.length ? aiServices.value : aiServiceFallback;
    return services.filter((service) => service.key !== 'rewrite');
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
    const form = aiDefaultForm(service);
    form.provider.value = setting.provider_key || 'mock';
    const provider = providerForAiDefault(form);
    form.model.value = setting.model || provider?.default_model || 'mock-correction-v1';
    form.systemPrompt.value = setting.system_prompt || '';
    form.apiKey.value = '';
    form.status.value = 'ready';
}

function loadAiDefault(service, { force = false } = {}) {
    const form = aiDefaultForm(service);
    if (!force && ['loading', 'ready'].includes(form.status.value)) return;

    form.status.value = 'loading';

    const params = new URLSearchParams({ service });

    _.http.getJSON(`/dashboard/api/ai/providers?${params.toString()}`)
        .then((payload) => applyAiDefaultPayload(payload, service))
        .catch(() => {
            form.status.value = 'error';
        });
}

function loadAiDefaults() {
    aiDefaultServices().forEach((service) => loadAiDefault(service.key));
}

function setAiProvider(form, value) {
    const providerKey = inputChangeValue(value, form.provider.value);
    const provider = aiProviders.value.find((item) => item.provider_key === providerKey) || null;
    const nextModel = provider?.models?.includes(form.model.value)
        ? form.model.value
        : (provider?.default_model || provider?.models?.[0] || '');

    form.provider.value = providerKey;
    form.model.value = nextModel;
}

function setAiModel(form, value) {
    form.model.value = inputChangeValue(value, form.model.value);
}

function setAiSystemPrompt(form, value) {
    form.systemPrompt.value = inputChangeValue(value, form.systemPrompt.value);
}

function setAiApiKey(form, value) {
    form.apiKey.value = inputChangeValue(value, form.apiKey.value);
}

async function saveAiDefaultSetting(form) {
    if (form.saving.value) return;

    form.saving.value = true;

    try {
        const payload = await _.http.patchJSON('/dashboard/api/ai/settings', {
            service: form.service,
            provider_key: form.provider.value,
            model: form.model.value,
            api_key: form.apiKey.value.trim() || null,
            system_prompt: form.systemPrompt.value.trim(),
        });
        const data = normalizeDataPayload(payload);

        if (data.setting) {
            form.provider.value = data.setting.provider_key;
            form.model.value = data.setting.model;
            form.systemPrompt.value = data.setting.system_prompt || '';
        }

        form.apiKey.value = '';
        settingsStatus.value = {
            type: 'success',
            title: 'AI default saved',
            message: `${form.service} default was updated.`,
        };
        loadAiDefault(form.service, { force: true });
    } catch {
        settingsStatus.value = {
            type: 'danger',
            title: 'AI default not saved',
            message: 'Check provider, model and API key, then try again.',
        };
    } finally {
        form.saving.value = false;
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

function focusSettingsSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function settingsSection({ id, eyebrow, title, description, icon, content, fullWidth = false }) {
    return _.section({ id, class: `at-settingsSection ${fullWidth ? 'is-fullWidth' : ''}` },
        _.div({ class: 'at-settingsSectionHeading' },
            _.div({ class: 'at-settingsSectionIcon' }, _.Icon({ name: icon })),
            _.div(
                _.span({ class: 'at-settingsEyebrow' }, eyebrow),
                _.h2(title),
                _.p(description),
            ),
        ),
        _.div({ class: 'at-settingsSectionContent' }, content),
    );
}

function workspacePreferencesCard() {
    return _.Card({
        class: 'at-settingsCard',
        icon: 'dashboard_customize',
        title: 'Workspace preferences',
        subtitle: 'Saved in this browser and restored when the editor opens.',
        body: _.Grid({ gap: 'md' },
            _.GridCol({ span: 12, mobile: { span: 12 } },
                _.Checkbox({
                    label: 'Ask before actions that change content or audio',
                    model: confirmPanelActions,
                    onChange: (value) => setConfirmPanelActions(Boolean(value)),
                }),
                _.small({ class: 'at-settingsPreferenceNote' }, 'The Activity queue always asks for confirmation.'),
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Checkbox({
                    label: 'Show book index',
                    model: indexView,
                    onChange: (value) => setBooleanPreference('indexView', indexView, value),
                })
            ),
            _.GridCol({ span: 6, mobile: { span: 12 } },
                _.Checkbox({
                    label: 'Show command bar',
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

function panelDefaultGroup({ icon, title, description, fields }) {
    return _.section({ class: 'at-settingsPanelDefaultGroup' },
        _.div({ class: 'at-settingsPanelDefaultHead' },
            _.span({ class: 'at-settingsPanelDefaultIcon' }, _.Icon({ name: icon })),
            _.div(_.h3(title), _.p(description)),
        ),
        _.div({ class: 'at-settingsPanelDefaultFields' }, fields),
    );
}

function panelDefaultsCard() {
    return _.Card({
        class: 'at-settingsCard',
        icon: 'filter_alt',
        title: 'Panel defaults',
        subtitle: 'Initial filters used when the book editor opens.',
        body: _.div({ class: 'at-settingsPanelDefaultGrid' },
            panelDefaultGroup({
                icon: 'local_activity',
                title: 'Activity',
                description: 'Choose the first queue view.',
                fields: _.Select({
                    label: 'Initial filter',
                    model: bookActivityFilter,
                    options: activityFilterOptions,
                    onChange: (value) => setStringPreference('bookActivityFilter', bookActivityFilter, value),
                }),
            }),
            panelDefaultGroup({
                icon: 'comment',
                title: 'Comments',
                description: 'Start with the review context you use most.',
                fields: [
                    _.Select({
                        label: 'Status filter',
                        model: blockCommentFilter,
                        options: commentFilterOptions,
                        onChange: (value) => setStringPreference('blockCommentFilter', blockCommentFilter, value),
                    }),
                    _.Select({
                        label: 'Anchor filter',
                        model: blockCommentAnchorFilter,
                        options: commentAnchorFilterOptions,
                        onChange: (value) => setStringPreference('blockCommentAnchorFilter', blockCommentAnchorFilter, value),
                    }),
                ],
            }),
            panelDefaultGroup({
                icon: 'history',
                title: 'Versions',
                description: 'Set the default history view and order.',
                fields: [
                    _.Select({
                        label: 'Initial filter',
                        model: versionFilter,
                        options: versionFilterOptions,
                        onChange: (value) => setStringPreference('versionFilter', versionFilter, value),
                    }),
                    _.Select({
                        label: 'Order',
                        model: versionSortOrder,
                        options: versionSortOptions,
                        onChange: (value) => setStringPreference('versionSortOrder', versionSortOrder, value),
                    }),
                ],
            }),
            panelDefaultGroup({
                icon: 'translate',
                title: 'Translation',
                description: 'Choose the language proposed for new work.',
                fields: _.Select({
                    label: 'Target language',
                    model: translationTargetLocale,
                    options: translationLocaleOptions,
                    onChange: (value) => setStringPreference('translationTargetLocale', translationTargetLocale, value),
                }),
            }),
        ),
    });
}

function aiDefaultServiceCard(service) {
    const form = aiDefaultForm(service.key);
    const providerOptions = () => aiProviders.value
        .filter((item) => item.is_selectable !== false)
        .map((item) => ({ label: item.name, value: item.provider_key }));
    const modelOptions = () => (providerForAiDefault(form)?.models || [])
        .map((model) => ({ label: model, value: model }));

    return _.Card({
        class: 'at-settingsCard at-settingsAiServiceCard',
        icon: service.icon || 'psychology',
        title: service.label,
        subtitle: 'Used when this tool has no book-specific override.',
        body: _.div({ class: 'at-settingsAiForm' },
            () => form.status.value === 'loading' ? _.Alert({
                type: 'info',
                title: 'Loading configuration',
                message: 'Provider and model options are loading.',
            }) : form.status.value === 'error' ? _.Alert({
                type: 'danger',
                title: 'Configuration unavailable',
                message: 'Unable to load this AI default.',
            }) : null,
            _.div({ class: 'at-settingsAiFields' },
            _.div(
                _.Select({
                    class: 'at-settingsAiField',
                    label: 'Provider',
                    icon: 'hub',
                    model: form.provider,
                    options: providerOptions,
                    onChange: (value) => setAiProvider(form, value),
                })
            ),
            _.div(
                _.Select({
                    class: 'at-settingsAiField',
                    label: 'Model',
                    icon: 'memory',
                    model: form.model,
                    options: modelOptions,
                    onChange: (value) => setAiModel(form, value),
                })
            ),
            _.div({
                class: 'at-settingsAiApiSlot',
                hidden: () => !providerRequiresApiKey(providerForAiDefault(form)),
            },
                    _.Input({
                        class: 'at-settingsAiField',
                        label: 'API key',
                        icon: 'key',
                        model: form.apiKey,
                        type: 'password',
                        placeholder: 'Leave empty to keep the saved key',
                        onInput: (value) => setAiApiKey(form, value),
                    })
            ),
            _.div(
                _.Textarea({
                    class: 'at-settingsAiField',
                    label: 'System prompt',
                    icon: 'terminal',
                    rows: 6,
                    model: form.systemPrompt,
                    placeholder: 'Prompt used by this service when no book override exists.',
                    onInput: (value) => setAiSystemPrompt(form, value),
                })
            )),
            () => {
                const provider = providerForAiDefault(form);
                return provider ? _.Alert({
                    type: provider.connection_mode === 'managed' && !provider.is_configured ? 'warning' : 'light',
                    title: provider.name,
                    message: provider.connection_mode === 'managed'
                        ? provider.is_configured
                            ? `${provider.billing_label}. ${provider.privacy_label}`
                            : 'This Audiobook Tools provider is coming soon and cannot be selected yet.'
                        : `${provider.billing_label || 'Your provider'}. ${provider.privacy_label || provider.base_url || 'Provider endpoint'}`,
                }) : null;
            },
            _.div({ class: 'at-settingsAiActions' },
                _.Btn({
                    type: 'button',
                    color: 'primary',
                    icon: 'save',
                    loading: form.saving,
                    disabled: () => form.status.value !== 'ready' || !form.provider.value || !form.model.value || providerForAiDefault(form)?.is_selectable === false,
                    onClick: () => saveAiDefaultSetting(form),
                }, () => form.saving.value ? 'Saving...' : `Save ${service.label} default`)
            )
        ),
    });
}

function aiDefaultsCard() {
    return _.Card({
        class: 'at-settingsCard at-settingsAiCard',
        icon: 'psychology',
        title: 'AI defaults by tool',
        subtitle: 'Each tool has its own global fallback. A book-level override always wins.',
        body: _.div({ class: 'at-settingsAiServiceGrid' },
            ...aiDefaultServices().map(aiDefaultServiceCard),
        ),
    });
}

export default function setting() {
    loadSettingsPreferences();
    loadAiDefaults();

    return _.main({ class: 'at-settingsPage' },
        _.section({ class: 'at-settingsHero' },
            _.div({ class: 'at-settingsHeroCopy' },
                _.span({ class: 'at-settingsEyebrow' }, 'Control center'),
                _.h1('Settings'),
                _.p('Shape how the editor opens, how its review panels behave and which AI defaults your books inherit.'),
            ),
            _.div({ class: 'at-settingsHeroMeta' },
                _.span({ class: 'at-settingsHeroTag' }, _.Icon({ name: 'devices' }), 'Saved on this browser'),
                _.span({ class: 'at-settingsHeroTag' }, _.Icon({ name: 'psychology' }), 'AI defaults for your account'),
            ),
        ),
        () => settingsStatus.value ? _.div({ class: 'at-settingsStatus' }, statusAlert()) : null,
        _.nav({ class: 'at-settingsJumpNav', 'aria-label': 'Settings sections' },
            _.Btn({ class: 'at-settingsJumpButton', color: 'secondary', outline: true, icon: 'dashboard_customize', onClick: () => focusSettingsSection('settings-workspace') }, 'Workspace'),
            _.Btn({ class: 'at-settingsJumpButton', color: 'secondary', outline: true, icon: 'tune', onClick: () => focusSettingsSection('settings-editor-defaults') }, 'Editor defaults'),
            _.Btn({ class: 'at-settingsJumpButton', color: 'secondary', outline: true, icon: 'psychology', onClick: () => focusSettingsSection('settings-ai-defaults') }, 'AI defaults'),
        ),
        settingsSection({
            id: 'settings-workspace',
            eyebrow: 'Your workspace',
            title: 'Open the editor your way',
            description: 'These controls only affect this browser and are restored when you return to a book.',
            icon: 'dashboard_customize',
            content: workspacePreferencesCard(),
        }),
        settingsSection({
            id: 'settings-editor-defaults',
            eyebrow: 'Editor defaults',
            title: 'Start each panel with useful filters',
            description: 'Choose the initial context for activity, comments, versions and translation work.',
            icon: 'tune',
            content: panelDefaultsCard(),
        }),
        settingsSection({
            id: 'settings-ai-defaults',
            eyebrow: 'AI configuration',
            title: 'Global defaults for every book',
            description: 'A book-level override takes precedence; otherwise each tool uses the configuration saved here.',
            icon: 'psychology',
            content: aiDefaultsCard(),
            fullWidth: true,
        }),
    );
}
