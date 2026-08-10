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

export default function setting() {
    loadSettingsPreferences();

    return [
        _.Card({
            icon: 'settings',
            title: 'Settings',
            subtitle: 'Application and editor preferences.',
            body: _.Grid({ gap: 'lg' },
                _.GridCol({ span: 24, mobile: { span: 12 } }, editorSafetyCard()),
                _.GridCol({ span: 24, mobile: { span: 12 } }, workspacePreferencesCard()),
                _.GridCol({ span: 24 }, panelDefaultsCard()),
                _.GridCol({ span: 12 }, () => settingsStatus.value ? statusAlert() : null),
            ),
        }),
    ];
}
