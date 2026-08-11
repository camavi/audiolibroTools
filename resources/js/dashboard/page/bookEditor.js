import { Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { buildVersionTextDiff, findApproximateTextMatch, summarizeVersionTextDiff } from '../editorDiff';
import {
    createAiBookBlockTranslation,
    loadBookBlockTranslations,
    resolveBookBlockTranslation,
    translationLocaleOptions,
} from '../shared/bookTranslations';


const EDITOR_PREFERENCES_KEY = 'audiobookTools.editor.preferences';

const indexView = _.rod(true);
const commandView = _.rod(true);
const editorReady = _.rod(false);
const editorUiTick = _.rod(0);
const editorPageFormat = _.rod('book');
const editorStatus = _.rod(null);
const saveStatus = _.rod('idle');
const confirmPanelActions = _.rod(true);
const editorBook = _.rod(null);
const editorOutline = _.rod([]);
const activeEditorBlockId = _.rod(null);
const rightWorkspaceTool = _.rod('chat');
const blockVersions = _.rod([]);
const blockVersionsStatus = _.rod('idle');
const blockVersionsContextKey = _.rod(null);
const blockVersionActionStatus = _.rod('idle');
const blockVersionsError = _.rod(null);
const hiddenVersionExplanationIds = _.rod([]);
const versionFilter = _.rod('all');
const versionSortOrder = _.rod('newest');
const versionSearch = _.rod('');
const bookActivityItems = _.rod([]);
const bookActivitySummary = _.rod({ all: 0, action: 0, review: 0, stale: 0 });
const bookActivityStatus = _.rod('idle');
const bookActivityContextKey = _.rod(null);
const bookActivityError = _.rod(null);
const bookActivityFilter = _.rod('all');
const activeBookActivityItemId = _.rod(null);
const bookActivityActionStatus = _.rod('idle');
const bookActivityFeedback = _.rod(null);
const blockReviews = _.rod([]);
const blockReviewsStatus = _.rod('idle');
const blockReviewsContextKey = _.rod(null);
const blockReviewsError = _.rod(null);
const blockReviewActionStatus = _.rod('idle');
const blockComments = _.rod([]);
const bookCommentsQueue = _.rod([]);
const bookCommentsQueueStatus = _.rod('idle');
const bookCommentsQueueContextKey = _.rod(null);
const bookCommentsQueueError = _.rod(null);
const blockCommentSummaries = _.rod({});
const blockCommentSelectionAnchor = _.rod(null);
const blockCommentAnchorResolutions = _.rod({});
const activeBlockCommentId = _.rod(null);
const blockCommentDraft = _.rod('');
const blockCommentFilter = _.rod('open');
const blockCommentAnchorFilter = _.rod('all');
const blockCommentsStatus = _.rod('idle');
const blockCommentsContextKey = _.rod(null);
const blockCommentsError = _.rod(null);
const blockCommentActionStatus = _.rod('idle');
const voiceProfiles = _.rod([]);
const voiceProfilesStatus = _.rod('idle');
const voiceProfilesContextKey = _.rod(null);
const voiceProfilesError = _.rod(null);
const voiceAssignment = _.rod(null);
const voiceAssignmentStatus = _.rod('idle');
const voiceAssignmentContextKey = _.rod(null);
const voiceAssignmentError = _.rod(null);
const voiceAssignmentActionStatus = _.rod('idle');
const selectedVoiceProfileId = _.rod('');
const voiceProfileName = _.rod('');
const voiceProfileRole = _.rod('character');
const voiceProfileProvider = _.rod('');
const voiceProfileVoiceId = _.rod('');
const voiceProfileLanguage = _.rod('');
const voiceProfileNotes = _.rod('');
const voiceProfileDialogStatus = _.rod(null);
const savingVoiceProfile = _.rod(false);
const audioSegments = _.rod([]);
const audioStatus = _.rod('idle');
const audioContextKey = _.rod(null);
const audioError = _.rod(null);
const audioActionStatus = _.rod('idle');
const blockTranslations = _.rod([]);
const blockTranslationsStatus = _.rod('idle');
const blockTranslationsContextKey = _.rod(null);
const blockTranslationsError = _.rod(null);
const blockTranslationActionStatus = _.rod('idle');
const translationTargetLocale = _.rod('en');
const aiChatMessages = _.rod([]);
const aiChatDraft = _.rod('');
const aiChatStatus = _.rod('idle');
const aiChatError = _.rod(null);
const aiChatContextKey = _.rod(null);
const aiProviders = _.rod([]);
const aiProviderSetting = _.rod({ service: 'correction', provider_key: 'mock', model: 'mock-correction-v1' });
const aiServiceSettings = _.rod({});
const aiServices = _.rod([]);
const aiProviderStatus = _.rod('idle');
const aiProviderContextKey = _.rod(null);
const aiServiceModel = _.rod('correction');
const aiProviderModel = _.rod('mock');
const aiModelModel = _.rod('mock-correction-v1');
const aiProviderApiKey = _.rod('');
const aiProviderSystemPrompt = _.rod('');
const customProviderName = _.rod('');
const customProviderBaseUrl = _.rod('');
const customProviderModels = _.rod('');
const customProviderApiKey = _.rod('');
const customProviderStatus = _.rod(null);
const savingAiProvider = _.rod(false);
const savingAiSetting = _.rod(false);

let focusEditorBlock = () => { };
let loadBlockVersions = () => { };
let restoreBlockVersion = () => { };
let explainBlockVersion = () => { };
let loadBlockReviews = () => { };
let createBlockReview = () => { };
let applyBlockReview = () => { };
let rejectBlockReview = () => { };
let loadBookActivity = () => { };
let navigateBookActivityItem = () => { };
let loadBlockComments = () => { };
let loadBookCommentsQueue = () => { };
let createBlockComment = () => { };
let createBlockCommentFromSource = () => { };
let updateBlockCommentStatus = () => { };
let updateBlockCommentAnchor = () => { };
let navigateBlockComment = () => { };
let refreshInlineCommentMarkers = () => { };
let loadVoiceProfiles = () => { };
let loadBlockVoiceAssignment = () => { };
let saveBlockVoiceAssignment = () => { };
let clearBlockVoiceAssignment = () => { };
let openVoiceProfileDialog = () => { };
let loadBlockAudio = () => { };
let generateBlockAudio = () => { };
let loadBlockTranslations = () => { };
let createBlockTranslation = () => { };
let updateBlockTranslationStatus = () => { };
let askAiChat = () => { };
let loadAiChatMessages = () => { };
let loadAiProviders = () => { };
let saveAiProviderSetting = () => { };
let openCustomProviderDialog = () => { };
let openToolAiSettingsDialog = () => { };
let bookActivityFeedbackTimer = null;
let openSystemPromptDialog = () => { };

const AUTOSAVE_DELAY = 1200;
const commentAnchorPluginKey = new PluginKey('audiobookCommentAnchors');

const pageFormatOptions = [
    { label: 'Book - Novel', value: 'book' },
    { label: 'Paperback 5x8', value: 'paperback-5x8' },
    { label: 'Paperback 6x9', value: 'paperback-6x9' },
    { label: 'A5', value: 'a5' },
    { label: 'A4', value: 'a4' },
    { label: 'US Letter', value: 'letter' },
    { label: 'Screen draft', value: 'draft' },
];

const rightWorkspaceTools = [
    { id: 'chat', icon: 'forum', label: 'AI Chat' },
    { id: 'comments', icon: 'comment', label: 'Comments' },
    { id: 'correct', icon: 'auto_fix_high', label: 'Correct' },
    { id: 'voices', icon: 'record_voice_over', label: 'Voices' },
    { id: 'audio', icon: 'graphic_eq', label: 'Audio' },
    { id: 'translate', icon: 'translate', label: 'Translate' },
    { id: 'versions', icon: 'history', label: 'Versions' },
    { id: 'activity', icon: 'fact_check', label: 'Activity' },
    { id: 'settings', icon: 'tune', label: 'Settings' },
];

const voiceRoleOptions = [
    { label: 'Character', value: 'character' },
    { label: 'Narrator', value: 'narrator' },
    { label: 'Ambient', value: 'ambient' },
    { label: 'System', value: 'system' },
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

const activityFilterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Action', value: 'action' },
    { label: 'Review', value: 'review' },
    { label: 'Stale', value: 'stale' },
];

function readEditorPreferences() {
    try {
        return JSON.parse(globalThis.localStorage?.getItem(EDITOR_PREFERENCES_KEY) || '{}');
    } catch {
        return {};
    }
}

function writeEditorPreference(key, value) {
    try {
        globalThis.localStorage?.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify({
            ...readEditorPreferences(),
            [key]: value,
        }));
    } catch {
        // Local preferences are optional; private browsing or storage limits should not block the editor.
    }
}

function restoreEditorPreferences() {
    const preferences = readEditorPreferences();
    const pageFormats = new Set(pageFormatOptions.map((option) => option.value));
    const tools = new Set(rightWorkspaceTools.map((tool) => tool.id));
    const locales = new Set(translationLocaleOptions.map((option) => option.value));

    if (typeof preferences.indexView === 'boolean') indexView.value = preferences.indexView;
    if (typeof preferences.commandView === 'boolean') commandView.value = preferences.commandView;
    if (typeof preferences.confirmPanelActions === 'boolean') confirmPanelActions.value = preferences.confirmPanelActions;
    if (pageFormats.has(preferences.pageFormat)) editorPageFormat.value = preferences.pageFormat;
    if (tools.has(preferences.rightWorkspaceTool)) rightWorkspaceTool.value = preferences.rightWorkspaceTool;
    if (locales.has(preferences.translationTargetLocale)) translationTargetLocale.value = preferences.translationTargetLocale;
    if (versionFilterOptions.some((option) => option.value === preferences.versionFilter)) versionFilter.value = preferences.versionFilter;
    if (versionSortOptions.some((option) => option.value === preferences.versionSortOrder)) versionSortOrder.value = preferences.versionSortOrder;
    if (typeof preferences.versionSearch === 'string') versionSearch.value = preferences.versionSearch;
    if (activityFilterOptions.some((option) => option.value === preferences.bookActivityFilter)) bookActivityFilter.value = preferences.bookActivityFilter;
    if (commentFilterOptions.some((option) => option.value === preferences.blockCommentFilter)) blockCommentFilter.value = preferences.blockCommentFilter;
    if (commentAnchorFilterOptions.some((option) => option.value === preferences.blockCommentAnchorFilter)) blockCommentAnchorFilter.value = preferences.blockCommentAnchorFilter;
    if (Array.isArray(preferences.hiddenVersionExplanationIds)) {
        hiddenVersionExplanationIds.value = preferences.hiddenVersionExplanationIds.filter((id) => Number.isFinite(Number(id)));
    }
}

restoreEditorPreferences();

const toolAiServices = {
    chat: 'chat',
    comments: 'comments',
    correct: 'correction',
    voices: 'voices',
    audio: 'audio',
    translate: 'translate',
    versions: 'versions',
};

function aiServiceForTool(toolId) {
    return toolAiServices[toolId] || toolId || 'correction';
}

const TrackableBlocks = Extension.create({
    name: 'trackableBlocks',

    addGlobalAttributes() {
        return [
            {
                types: ['paragraph', 'heading', 'blockquote', 'horizontalRule'],
                attributes: {
                    blockId: {
                        default: null,
                        parseHTML: element => element.getAttribute('data-block-id'),
                        renderHTML: attributes => {
                            if (!attributes.blockId) return {};

                            return {
                                'data-block-id': attributes.blockId,
                            };
                        },
                    },
                },
            },
        ];
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('audiobookTrackableBlockIds'),
                appendTransaction: (transactions, oldState, newState) => {
                    if (!transactions.some((transaction) => transaction.docChanged)) return null;
                    if (oldState.doc.eq(newState.doc)) return null;

                    const tr = newState.tr;
                    const seenBlockIds = new Set();

                    newState.doc.descendants((node, pos) => {
                        if (!isTrackableNode(node)) return;

                        const blockId = node.attrs.blockId;
                        if (blockId && !seenBlockIds.has(blockId)) {
                            seenBlockIds.add(blockId);
                            return;
                        }

                        const nextBlockId = createBlockId();
                        seenBlockIds.add(nextBlockId);

                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            blockId: nextBlockId,
                        });
                    });

                    return tr.docChanged ? tr : null;
                },
            }),
        ];
    },
});

const CommentAnchors = Extension.create({
    name: 'commentAnchors',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: commentAnchorPluginKey,
                state: {
                    init: () => DecorationSet.empty,
                    apply(transaction, decorations) {
                        const nextDecorations = transaction.getMeta(commentAnchorPluginKey);
                        if (nextDecorations) return nextDecorations;

                        return decorations.map(transaction.mapping, transaction.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return commentAnchorPluginKey.getState(state);
                    },
                },
            }),
        ];
    },
});

function createBlockId() {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultDocument() {
    return {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                attrs: { blockId: createBlockId() },
            },
        ],
    };
}

function isTrackableNode(node) {
    const type = typeof node?.type === 'string'
        ? node.type
        : node?.type?.name;

    return ['paragraph', 'heading', 'blockquote', 'horizontalRule'].includes(type);
}

function withBlockIds(node, seenBlockIds = new Set()) {
    if (!node || typeof node !== 'object') return node;

    const nextNode = { ...node };

    if (isTrackableNode(nextNode)) {
        const blockId = nextNode.attrs?.blockId;
        const nextBlockId = blockId && !seenBlockIds.has(blockId)
            ? blockId
            : createBlockId();

        seenBlockIds.add(nextBlockId);

        nextNode.attrs = {
            ...(nextNode.attrs || {}),
            blockId: nextBlockId,
        };
    }

    if (Array.isArray(nextNode.content)) {
        nextNode.content = nextNode.content.map((child) => withBlockIds(child, seenBlockIds));
    }

    return nextNode;
}

function documentFromBlocks(blocks) {
    const content = (blocks || [])
        .map((block) => block.content_json)
        .filter(Boolean)
        .map((block) => withBlockIds(block));

    return content.length
        ? { type: 'doc', content }
        : defaultDocument();
}

function normalizeEditorPayload(payload) {
    if (payload?.book || payload?.blocks || payload?.document) return payload;
    if (payload?.data?.book || payload?.data?.blocks || payload?.data?.document) return payload.data;
    if (payload?.data?.data?.book || payload?.data?.data?.blocks || payload?.data?.data?.document) return payload.data.data;

    return {};
}

function normalizeDataPayload(payload) {
    if (payload?.data?.data) return payload.data.data;
    if (payload?.data) return payload.data;

    return payload || {};
}

function textFromNode(node) {
    if (!node || typeof node !== 'object') return '';
    if (typeof node.text === 'string') return node.text;

    return (node.content || [])
        .map(textFromNode)
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function diffTokens(text) {
    return (text || '')
        .match(/\S+/g) || [];
}

function diffTokenParts(originalText, suggestedText) {
    const original = diffTokens(originalText);
    const suggested = diffTokens(suggestedText);
    const rows = Array.from({ length: original.length + 1 }, () => Array(suggested.length + 1).fill(0));

    for (let i = original.length - 1; i >= 0; i -= 1) {
        for (let j = suggested.length - 1; j >= 0; j -= 1) {
            rows[i][j] = original[i] === suggested[j]
                ? rows[i + 1][j + 1] + 1
                : Math.max(rows[i + 1][j], rows[i][j + 1]);
        }
    }

    const parts = [];
    let i = 0;
    let j = 0;

    while (i < original.length && j < suggested.length) {
        if (original[i] === suggested[j]) {
            parts.push({ type: 'same', text: original[i] });
            i += 1;
            j += 1;
        } else if (rows[i + 1][j] >= rows[i][j + 1]) {
            parts.push({ type: 'removed', text: original[i] });
            i += 1;
        } else {
            parts.push({ type: 'added', text: suggested[j] });
            j += 1;
        }
    }

    while (i < original.length) {
        parts.push({ type: 'removed', text: original[i] });
        i += 1;
    }

    while (j < suggested.length) {
        parts.push({ type: 'added', text: suggested[j] });
        j += 1;
    }

    return parts;
}

function renderDiffLine(parts, mode) {
    const visibleParts = parts.filter((part) => {
        if (mode === 'original') return part.type !== 'added';
        return part.type !== 'removed';
    });

    if (!visibleParts.length) return _.span({ class: 'at-reviewDiff-empty' }, 'Empty block');

    return visibleParts.map((part, index) => _.span({
        class: part.type === 'same'
            ? 'at-reviewDiff-token'
            : `at-reviewDiff-token is-${part.type}`,
    }, `${index ? ' ' : ''}${part.text}`));
}

function reviewDiff(originalText, suggestedText) {
    const parts = diffTokenParts(originalText || '', suggestedText || '');

    return _.div({ class: 'at-reviewDiff' },
        _.div({ class: 'at-reviewDiff-row' },
            _.span({ class: 'at-reviewDiff-label' }, 'Original'),
            _.p(renderDiffLine(parts, 'original'))
        ),
        _.div({ class: 'at-reviewDiff-row' },
            _.span({ class: 'at-reviewDiff-label' }, 'Suggested'),
            _.p(renderDiffLine(parts, 'suggested'))
        )
    );
}

function selectedAiProvider() {
    return aiProviders.value.find((provider) => provider.provider_key === aiProviderSetting.value.provider_key)
        || aiProviders.value[0]
        || null;
}

function selectedAiModelOptions() {
    return selectedAiProvider()?.models || [];
}

function providerByKey(providerKey) {
    return aiProviders.value.find((provider) => provider.provider_key === providerKey) || null;
}

function providerNeedsApiKey(providerKey) {
    return providerKey && !['mock', 'ollama'].includes(providerKey);
}

function correctionAiSetting() {
    if (aiServiceSettings.value.correction) return aiServiceSettings.value.correction;
    if (aiProviderSetting.value.service === 'correction') return aiProviderSetting.value;

    return {
        service: 'correction',
        provider_key: 'mock',
        model: 'mock-correction-v1',
    };
}

function correctionAiSummary() {
    const setting = correctionAiSetting();
    const provider = providerByKey(setting.provider_key);

    return {
        setting,
        provider,
        providerName: provider?.name || setting.provider_key || 'AI provider',
        model: setting.model || provider?.default_model || '',
        hasApiKey: Boolean(provider?.has_api_key),
        missingApiKey: providerNeedsApiKey(setting.provider_key) && !provider?.has_api_key,
    };
}

function chatAiSetting() {
    if (aiServiceSettings.value.chat) return aiServiceSettings.value.chat;
    if (aiProviderSetting.value.service === 'chat') return aiProviderSetting.value;

    return {
        service: 'chat',
        provider_key: 'mock',
        model: 'mock-correction-v1',
    };
}

function chatAiSummary() {
    const setting = chatAiSetting();
    const provider = providerByKey(setting.provider_key);

    return {
        setting,
        provider,
        providerName: provider?.name || setting.provider_key || 'AI provider',
        model: setting.model || provider?.default_model || '',
        hasApiKey: Boolean(provider?.has_api_key),
        missingApiKey: providerNeedsApiKey(setting.provider_key) && !provider?.has_api_key,
    };
}

function audioAiSetting() {
    if (aiServiceSettings.value.audio) return aiServiceSettings.value.audio;
    if (aiProviderSetting.value.service === 'audio') return aiProviderSetting.value;

    return {
        service: 'audio',
        provider_key: 'mock',
        model: 'mock-tts-v1',
    };
}

function audioAiSummary() {
    const setting = audioAiSetting();
    const provider = providerByKey(setting.provider_key);

    return {
        setting,
        provider,
        providerName: provider?.name || setting.provider_key || 'Audio provider',
        model: setting.model || provider?.default_model || '',
        hasApiKey: Boolean(provider?.has_api_key),
        missingApiKey: providerNeedsApiKey(setting.provider_key) && !provider?.has_api_key,
    };
}

function translateAiSetting() {
    if (aiServiceSettings.value.translate) return aiServiceSettings.value.translate;
    if (aiProviderSetting.value.service === 'translate') return aiProviderSetting.value;

    return {
        service: 'translate',
        provider_key: 'mock',
        model: 'mock-translation-v1',
    };
}

function translateAiSummary() {
    const setting = translateAiSetting();
    const provider = providerByKey(setting.provider_key);

    return {
        setting,
        provider,
        providerName: provider?.name || setting.provider_key || 'Translation provider',
        model: setting.model || provider?.default_model || '',
        hasApiKey: Boolean(provider?.has_api_key),
        missingApiKey: providerNeedsApiKey(setting.provider_key) && !provider?.has_api_key,
    };
}

function versionsAiSetting() {
    if (aiServiceSettings.value.versions) return aiServiceSettings.value.versions;
    if (aiProviderSetting.value.service === 'versions') return aiProviderSetting.value;

    return {
        service: 'versions',
        provider_key: 'mock',
        model: 'mock-correction-v1',
    };
}

function versionsAiSummary() {
    const setting = versionsAiSetting();
    const provider = providerByKey(setting.provider_key);

    return {
        setting,
        provider,
        providerName: provider?.name || setting.provider_key || 'Versions provider',
        model: setting.model || provider?.default_model || '',
        hasApiKey: Boolean(provider?.has_api_key),
        missingApiKey: providerNeedsApiKey(setting.provider_key) && !provider?.has_api_key,
    };
}

function syncAiSettingModels(setting) {
    const service = setting.service || 'correction';
    const providerKey = setting.provider_key || 'mock';
    const model = setting.model || 'mock-correction-v1';

    if (aiServiceModel.value !== service) aiServiceModel.value = service;
    if (aiProviderModel.value !== providerKey) aiProviderModel.value = providerKey;
    if (aiModelModel.value !== model) aiModelModel.value = model;
}

function setAiProviderSetting(nextSetting) {
    const normalized = {
        service: nextSetting.service || 'correction',
        provider_key: nextSetting.provider_key || 'mock',
        model: nextSetting.model || 'mock-correction-v1',
        system_prompt: nextSetting.system_prompt || '',
    };

    const current = aiProviderSetting.value;
    if (
        current.service !== normalized.service
        || current.provider_key !== normalized.provider_key
        || current.model !== normalized.model
        || current.system_prompt !== normalized.system_prompt
    ) {
        aiProviderSetting.value = normalized;
    }

    if (aiProviderSystemPrompt.value !== normalized.system_prompt) aiProviderSystemPrompt.value = normalized.system_prompt;
    syncAiSettingModels(normalized);
}

function selectChangeValue(value, fallback = '') {
    if (value && typeof value === 'object' && 'target' in value) {
        return value.target?.value ?? fallback;
    }

    return value ?? fallback;
}

function requestErrorMessage(error, fallback) {
    const payload = error?.data || error?.response || error || {};
    const errors = payload.errors || null;
    const firstError = errors
        ? Object.values(errors).flat().find(Boolean)
        : null;

    return firstError || payload.message || error?.message || fallback;
}

function runUntracked(fn) {
    const untracked = globalThis.CMSwift?.reactive?.untracked;

    return typeof untracked === 'function' ? untracked(fn) : fn();
}

function extractEditorBlocks(doc, blockMeta) {
    const blocks = [];

    (doc?.content || []).forEach((node, index) => {
        if (!isTrackableNode(node) || !node.attrs?.blockId) return;

        const meta = blockMeta.get(node.attrs.blockId) || {};

        blocks.push({
            block_uuid: node.attrs.blockId,
            base_version_id: meta.current_version_id || null,
            type: node.type === 'heading' ? 'heading' : node.type === 'horizontalRule' ? 'scene_break' : node.type,
            sort_order: (index + 1) * 1000,
            content_json: node,
            text_plain: textFromNode(node),
            content_hash: meta.content_hash || null,
        });
    });

    return blocks;
}

function blockKindLabel(type) {
    const labels = {
        heading: 'CH',
        paragraph: 'Text',
        blockquote: 'Quote',
        scene_break: 'Break',
    };

    return labels[type] || 'Block';
}

function outlineLabel(block, index) {
    if (block.type === 'scene_break') return 'Scene break';
    if (block.text_plain) return block.text_plain;

    return `${blockKindLabel(block.type)} ${index + 1}`;
}

function outlineKindLabel(item) {
    if (item.type === 'heading') return `CH ${item.chapterNumber}`;

    return blockKindLabel(item.type);
}

function activeOutlineItem() {
    return editorOutline.value.find((item) => item.block_uuid === activeEditorBlockId.value) || null;
}

function setIndexView(visible) {
    indexView.value = visible;
    writeEditorPreference('indexView', visible);
}

function setCommandView(visible) {
    commandView.value = visible;
    writeEditorPreference('commandView', visible);
}

function setRightWorkspaceTool(toolId) {
    rightWorkspaceTool.value = toolId;
    writeEditorPreference('rightWorkspaceTool', toolId);
}

function setEditorPageFormat(format) {
    editorPageFormat.value = format;
    writeEditorPreference('pageFormat', format);
}

function setTranslationTargetLocale(locale) {
    translationTargetLocale.value = locale;
    writeEditorPreference('translationTargetLocale', locale);
}

function setVersionFilter(filter) {
    versionFilter.value = filter;
    writeEditorPreference('versionFilter', filter);
}

function setVersionSortOrder(order) {
    versionSortOrder.value = order;
    writeEditorPreference('versionSortOrder', order);
}

function setVersionSearch(search) {
    versionSearch.value = search;
    writeEditorPreference('versionSearch', search);
}

function setBookActivityFilter(filter) {
    bookActivityFilter.value = filter;
    writeEditorPreference('bookActivityFilter', filter);
}

function setBlockCommentFilter(filter) {
    blockCommentFilter.value = filter;
    writeEditorPreference('blockCommentFilter', filter);
}

function setBlockCommentAnchorFilter(filter) {
    blockCommentAnchorFilter.value = filter;
    writeEditorPreference('blockCommentAnchorFilter', filter);
}

function setConfirmPanelActions(enabled) {
    confirmPanelActions.value = Boolean(enabled);
    writeEditorPreference('confirmPanelActions', confirmPanelActions.value);
}

function cssSelectorEscape(value) {
    const stringValue = String(value || '');

    return globalThis.CSS?.escape
        ? globalThis.CSS.escape(stringValue)
        : stringValue.replace(/["\\]/g, '\\$&');
}

function activeBlockCommentCounts() {
    return summarizeBlockComments(blockComments.value);
}

function summarizeBlockComments(comments) {
    const commentList = comments || [];

    return {
        all: commentList.length,
        open: commentList.filter((comment) => (comment.status || 'open') === 'open' && comment.is_current_version).length,
        resolved: commentList.filter((comment) => comment.status === 'resolved').length,
        stale: commentList.filter((comment) => !comment.is_current_version).length,
    };
}

function normalizeBlockCommentSummary(summary) {
    return {
        all: Number(summary?.all || 0),
        open: Number(summary?.open || 0),
        resolved: Number(summary?.resolved || 0),
        stale: Number(summary?.stale || 0),
    };
}

function commentAnchor(comment) {
    return comment?.metadata_json?.anchor || null;
}

function anchorSnippet(anchor, maxLength = 90) {
    const text = String(anchor?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';

    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function commentAnchorStateLabel(comment) {
    const anchor = commentAnchor(comment);
    if (!anchor) return null;
    if (comment.is_current_version) return 'Anchored';

    const resolution = blockCommentAnchorResolutions.value[comment.id];

    return resolution?.state === 'reanchored' ? 'Reanchored' : 'Stale anchor';
}

function commentAnchorStateClass(comment) {
    const anchor = commentAnchor(comment);
    if (!anchor) return '';
    if (comment.is_current_version) return 'is-current';

    const resolution = blockCommentAnchorResolutions.value[comment.id];

    return resolution?.state === 'reanchored' ? 'is-reanchored' : 'is-stale';
}

function commentMatchesAnchorFilter(comment) {
    const anchor = commentAnchor(comment);
    if (blockCommentAnchorFilter.value === 'all') return true;
    if (blockCommentAnchorFilter.value === 'anchored') return Boolean(anchor) && comment.is_current_version;
    if (blockCommentAnchorFilter.value === 'reanchored') return Boolean(anchor) && blockCommentAnchorResolutions.value[comment.id]?.state === 'reanchored';
    if (blockCommentAnchorFilter.value === 'stale') return Boolean(anchor) && !comment.is_current_version && blockCommentAnchorResolutions.value[comment.id]?.state !== 'reanchored';

    return true;
}

function activeBlockAnchorCounts(comments) {
    const commentList = comments || [];

    return {
        all: commentList.length,
        anchored: commentList.filter((comment) => commentAnchor(comment) && comment.is_current_version).length,
        reanchored: commentList.filter((comment) => commentAnchor(comment) && blockCommentAnchorResolutions.value[comment.id]?.state === 'reanchored').length,
        stale: commentList.filter((comment) => commentAnchor(comment) && !comment.is_current_version && blockCommentAnchorResolutions.value[comment.id]?.state !== 'reanchored').length,
    };
}

function blockCommentContextBlockUuid() {
    const [, blockUuid] = String(blockCommentsContextKey.value || '').split(':');

    return blockUuid || null;
}

function commentMarkerStateForBlock(blockUuid) {
    if (!blockUuid) return null;

    const counts = blockCommentSummaries.value[blockUuid]
        || (blockCommentContextBlockUuid() === blockUuid ? activeBlockCommentCounts() : null);
    if (!counts?.all) return null;

    const state = counts.open ? 'open' : (counts.stale ? 'stale' : 'resolved');

    return {
        count: counts.open || counts.stale || counts.resolved || counts.all,
        state,
        title: `${counts.open} open comments, ${counts.resolved} resolved, ${counts.stale} stale`,
    };
}

function visibleBlockComments(comments) {
    return comments.filter((comment) => {
        if (blockCommentFilter.value === 'open') return (comment.status || 'open') === 'open' && comment.is_current_version;
        if (blockCommentFilter.value === 'resolved') return comment.status === 'resolved';
        if (blockCommentFilter.value === 'stale') return !comment.is_current_version;

        return true;
    }).filter((comment) => commentMatchesAnchorFilter(comment));
}

function visibleBookCommentsQueue() {
    return visibleBlockComments(bookCommentsQueue.value);
}

function bookCommentsQueueCounts() {
    return summarizeBlockComments(bookCommentsQueue.value);
}

function bookCommentsQueueAnchorCounts() {
    return activeBlockAnchorCounts(bookCommentsQueue.value);
}

function bookCommentSummaryCounts() {
    return Object.values(blockCommentSummaries.value || {}).reduce((summary, counts) => {
        summary.all += Number(counts.all || 0);
        summary.open += Number(counts.open || 0);
        summary.resolved += Number(counts.resolved || 0);
        summary.stale += Number(counts.stale || 0);

        return summary;
    }, { all: 0, open: 0, resolved: 0, stale: 0 });
}

function bookActivityCounts() {
    const summary = bookActivitySummary.value || {};

    return {
        all: Number(summary.all || 0),
        action: Number(summary.action || 0),
        review: Number(summary.review || 0),
        stale: Number(summary.stale || 0),
    };
}

function visibleBookActivityItems() {
    const items = bookActivityItems.value || [];
    if (bookActivityFilter.value === 'all') return items;

    return items.filter((item) => item.severity === bookActivityFilter.value);
}

function activeBookActivityItem() {
    const activeId = activeBookActivityItemId.value;
    if (!activeId) return null;

    return (bookActivityItems.value || []).find((item) => item.id === activeId) || null;
}

function activityScrollerElement() {
    return document.querySelector('.at-activityScroller');
}

function preserveActivityScroll(callback) {
    const scroller = activityScrollerElement();
    const scrollTop = scroller?.scrollTop ?? null;

    callback();

    if (scrollTop === null) return;

    requestAnimationFrame(() => {
        const nextScroller = activityScrollerElement();
        if (nextScroller) nextScroller.scrollTop = scrollTop;
    });
}

function openBookActivityItem(item, { openTool = true, preserveScroll = !openTool } = {}) {
    if (!item) return;

    const applySelection = () => {
        activeBookActivityItemId.value = item.id || null;

        if (item.block_uuid) {
            focusEditorBlock(item.block_uuid);
        }

        if (openTool && item.tool) {
            setRightWorkspaceTool(item.tool);
        }
    };

    if (preserveScroll && rightWorkspaceTool.value === 'activity') {
        preserveActivityScroll(applySelection);
        return;
    }

    applySelection();
}

function activityOpenActionLabel(item) {
    const labels = {
        comments: 'Open Comments',
        correct: 'Open Correct',
        versions: 'Open Versions',
        voices: 'Open Voices',
        audio: 'Open Audio',
        translate: 'Open Translate',
    };

    return labels[item?.tool] || 'Open';
}

function activityTargetBlock(item) {
    return editorOutline.value.find((block) => block.block_uuid === item?.block_uuid) || null;
}

function activityDirectActions(item) {
    if (item?.type === 'audio_missing') {
        return [{ action: 'generate_audio', label: 'Generate audio', primary: true }];
    }

    if (item?.type === 'draft_reviews' && item.action_target?.id && Number(item.count || 0) === 1) {
        return [
            { action: 'apply_review', label: 'Apply', primary: true },
            { action: 'reject_review', label: 'Reject' },
        ];
    }

    if (item?.type === 'draft_translations' && item.action_target?.id && Number(item.count || 0) === 1) {
        return [
            { action: 'approve_translation', label: 'Approve', primary: true },
            { action: 'reject_translation', label: 'Reject' },
        ];
    }

    return [];
}

function activityActionConfirmCopy(item, action) {
    const copies = {
        generate_audio: {
            title: 'Generate audio?',
            body: 'This will create an audio segment for the current block version using the configured Audio provider.',
            confirm: 'Generate audio',
        },
        apply_review: {
            title: 'Apply correction?',
            body: 'This will replace the selected block text, save the document, and mark this correction as applied.',
            confirm: 'Apply correction',
        },
        reject_review: {
            title: 'Reject correction?',
            body: 'This will mark the correction as rejected without changing the book text.',
            confirm: 'Reject correction',
        },
        approve_translation: {
            title: 'Approve translation?',
            body: 'This will approve this translation draft for the current block version.',
            confirm: 'Approve translation',
        },
        reject_translation: {
            title: 'Reject translation?',
            body: 'This will reject this translation draft without changing the book text.',
            confirm: 'Reject translation',
        },
    };

    return copies[action] || {
        title: 'Run activity action?',
        body: item?.title || 'This will update the selected activity item.',
        confirm: 'Run action',
    };
}

function activityActionFeedbackMessage(action) {
    const messages = {
        generate_audio: 'Audio generated',
        apply_review: 'Correction applied',
        reject_review: 'Correction rejected',
        approve_translation: 'Translation approved',
        reject_translation: 'Translation rejected',
    };

    return messages[action] || 'Activity updated';
}

function setBookActivityFeedback(item, message, type = 'success') {
    if (bookActivityFeedbackTimer) clearTimeout(bookActivityFeedbackTimer);

    bookActivityFeedback.value = {
        itemId: item?.id || null,
        message,
        type,
    };

    bookActivityFeedbackTimer = setTimeout(() => {
        bookActivityFeedback.value = null;
        bookActivityFeedbackTimer = null;
    }, 4500);
}

function openBookActivityActionConfirm(item, keyBook, directAction) {
    const copy = activityActionConfirmCopy(item, directAction.action);

    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3(copy.title),
                _.span({ class: 'text-muted' }, item?.title || 'Activity action'),
            ),
            content: ({ close }) => _.div({ class: 'at-activityConfirmDialog' },
                _.p(copy.body),
                item?.preview ? _.blockquote({ class: 'at-activityConfirmPreview' }, item.preview) : null,
                _.div({ class: 'at-activityConfirmActions' },
                    _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Cancel'),
                    _.Btn({
                        type: 'button',
                        color: directAction.primary ? 'primary' : 'secondary',
                        onClick: () => {
                            close();
                            runBookActivityItemAction(item, keyBook, directAction.action);
                        },
                    }, copy.confirm)
                )
            ),
        },
    }).open();
}

function runPanelAction(action, options = {}, callback = () => { }) {
    if (!confirmPanelActions.value) {
        callback();
        return;
    }

    const copy = activityActionConfirmCopy(null, action);

    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3(copy.title),
                _.span({ class: 'text-muted' }, options.context || 'Panel action'),
            ),
            content: ({ close }) => _.div({ class: 'at-activityConfirmDialog' },
                _.p(copy.body),
                options.preview ? _.blockquote({ class: 'at-activityConfirmPreview' }, options.preview) : null,
                _.div({ class: 'at-activityConfirmActions' },
                    _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Cancel'),
                    _.Btn({
                        type: 'button',
                        color: options.primary === false ? 'secondary' : 'primary',
                        onClick: () => {
                            close();
                            callback();
                        },
                    }, copy.confirm)
                )
            ),
        },
    }).open();
}

function activityActionStatusForItem(item, action = 'run') {
    return item?.id ? `activity:${item.id}:${action}` : 'idle';
}

function isActivityItemActionBusy(item, action = 'run') {
    return bookActivityActionStatus.value === activityActionStatusForItem(item, action);
}

function canRunActivityDirectAction(item, action = 'run') {
    if (bookActivityActionStatus.value !== 'idle') return false;
    if (!activityDirectActions(item).some((candidate) => candidate.action === action)) return false;

    const block = activityTargetBlock(item);
    if ((action === 'apply_review' || action === 'reject_review') && (!block || block.dirty || blockReviewActionStatus.value !== 'idle')) return false;
    if ((action === 'approve_translation' || action === 'reject_translation') && (!block || blockTranslationActionStatus.value !== 'idle')) return false;

    return true;
}

function runBookActivityItemAction(item, keyBook, action = 'run') {
    if (!item || !keyBook || !canRunActivityDirectAction(item, action)) return;

    if (action === 'generate_audio') {
        generateActivityAudio(item, keyBook, action);
        return;
    }

    if (action === 'apply_review' || action === 'reject_review') {
        updateActivityReview(item, action);
        return;
    }

    if (action === 'approve_translation' || action === 'reject_translation') {
        updateActivityTranslation(item, keyBook, action);
    }
}

function generateActivityAudio(item, keyBook, action = 'generate_audio') {
    if (!item?.block_uuid || bookActivityActionStatus.value !== 'idle') return;

    const statusKey = activityActionStatusForItem(item, action);
    const audioSetting = audioAiSetting();

    preserveActivityScroll(() => {
        activeBookActivityItemId.value = item.id || null;
        focusEditorBlock(item.block_uuid);
    });

    bookActivityActionStatus.value = statusKey;
    bookActivityError.value = null;

    _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(item.block_uuid)}/audio/generate`, {
        provider_key: audioSetting.provider_key,
        model: audioSetting.model,
    })
        .then((payload) => {
            const data = normalizeDataPayload(payload);
            const activeBlock = activeOutlineItem();

            if (data.segment && activeBlock?.block_uuid === item.block_uuid) {
                audioSegments.value = [
                    data.segment,
                    ...audioSegments.value.filter((segment) => segment.id !== data.segment.id),
                ];
                audioStatus.value = 'ready';
            }

            setBookActivityFeedback(item, activityActionFeedbackMessage(action));
            loadBookActivity(keyBook, { force: true });
        })
        .catch((error) => {
            bookActivityError.value = requestErrorMessage(error, 'Unable to run activity action.');
            setBookActivityFeedback(item, 'Activity action failed', 'error');
        })
        .finally(() => {
            if (bookActivityActionStatus.value === statusKey) {
                bookActivityActionStatus.value = 'idle';
            }
        });
}

async function updateActivityReview(item, action) {
    const block = activityTargetBlock(item);
    const review = item?.action_target;
    if (!block || !review?.id || bookActivityActionStatus.value !== 'idle') return;

    const statusKey = activityActionStatusForItem(item, action);

    preserveActivityScroll(() => {
        activeBookActivityItemId.value = item.id || null;
        focusEditorBlock(item.block_uuid);
    });

    bookActivityActionStatus.value = statusKey;
    bookActivityError.value = null;

    try {
        let updated = false;

        if (action === 'apply_review') {
            updated = await applyBlockReview(block, {
                ...review,
                status: 'draft',
                is_current_version: true,
            });
        } else {
            updated = await rejectBlockReview(block, {
                ...review,
                status: 'draft',
                is_current_version: true,
            });
        }

        if (updated) {
            setBookActivityFeedback(item, activityActionFeedbackMessage(action));
        }
    } catch (error) {
        bookActivityError.value = requestErrorMessage(error, 'Unable to update correction from Activity.');
        setBookActivityFeedback(item, 'Activity action failed', 'error');
    } finally {
        if (bookActivityActionStatus.value === statusKey) {
            bookActivityActionStatus.value = 'idle';
        }
    }
}

function updateActivityTranslation(item, keyBook, action) {
    const block = activityTargetBlock(item);
    const translation = item?.action_target;
    if (!block || !translation?.id || bookActivityActionStatus.value !== 'idle') return;

    const statusKey = activityActionStatusForItem(item, action);
    const status = action === 'approve_translation' ? 'approved' : 'rejected';

    preserveActivityScroll(() => {
        activeBookActivityItemId.value = item.id || null;
        focusEditorBlock(item.block_uuid);
    });

    bookActivityActionStatus.value = statusKey;
    bookActivityError.value = null;

    _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/translations/${translation.id}`, {
        status,
    })
        .then((payload) => {
            const data = normalizeDataPayload(payload);

            if (data.translation) {
                blockTranslations.value = [
                    data.translation,
                    ...blockTranslations.value.filter((itemTranslation) => itemTranslation.id !== data.translation.id),
                ];
                blockTranslationsStatus.value = 'ready';
            }

            loadBookActivity(keyBook, { force: true });
            setBookActivityFeedback(item, activityActionFeedbackMessage(action));
        })
        .catch((error) => {
            bookActivityError.value = requestErrorMessage(error, 'Unable to update translation from Activity.');
            setBookActivityFeedback(item, 'Activity action failed', 'error');
        })
        .finally(() => {
            if (bookActivityActionStatus.value === statusKey) {
                bookActivityActionStatus.value = 'idle';
            }
        });
}

function activitySummaryLabel(item) {
    if (!item) return null;

    const targetTool = rightWorkspaceTools.find((tool) => tool.id === item.tool);
    const blockKind = activityBlockKindLabel(item);
    const title = item.title || 'Activity';

    return `${targetTool?.label || item.tool}: ${title} on ${blockKind}`;
}

function activitySourceBadge(item) {
    const targetTool = rightWorkspaceTools.find((tool) => tool.id === item?.tool);
    const label = targetTool?.label || item?.tool || 'Activity';

    return _.span({
        class: `at-activitySourceBadge source-${item?.tool || 'activity'}`,
        title: `Source: ${label}`,
    }, label);
}

function activityBlockKindLabel(item) {
    if (item?.block_type === 'heading') return 'Chapter';

    return blockKindLabel(item?.block_type || 'paragraph');
}

function blockCommentBadge(item) {
    const counts = blockCommentSummaries.value[item.block_uuid]
        || (blockCommentContextBlockUuid() === item.block_uuid ? activeBlockCommentCounts() : null);
    if (!counts?.all) return null;

    const label = counts.open ? `${counts.open}` : `${counts.all}`;

    return _.span({
        class: counts.open ? 'at-indexBook-commentBadge has-open' : 'at-indexBook-commentBadge',
        title: `${counts.open} open comments, ${counts.resolved} resolved, ${counts.stale} stale`,
    }, label);
}

function isVersionExplanationHidden(version) {
    const explanationId = Number(version?.explanation?.id || 0);
    if (!explanationId) return false;

    return hiddenVersionExplanationIds.value.includes(explanationId);
}

function toggleVersionExplanation(version) {
    const explanationId = Number(version?.explanation?.id || 0);
    if (!explanationId) return;

    const hiddenIds = hiddenVersionExplanationIds.value.includes(explanationId)
        ? hiddenVersionExplanationIds.value.filter((id) => id !== explanationId)
        : [...hiddenVersionExplanationIds.value, explanationId];

    hiddenVersionExplanationIds.value = hiddenIds;
    writeEditorPreference('hiddenVersionExplanationIds', hiddenIds);
}

function saveStatusLabel(status) {
    const labels = {
        idle: 'Idle',
        dirty: 'Unsaved changes',
        saving: 'Saving...',
        saved: 'Saved',
        error: 'Save failed',
        conflict: 'Conflict detected',
    };

    return labels[status] || 'Idle';
}

function saveStatusIcon(status) {
    const icons = {
        idle: 'cloud_done',
        dirty: 'sync_problem',
        saving: 'sync',
        saved: 'cloud_done',
        error: 'cloud_off',
        conflict: 'report',
    };

    return icons[status] || 'cloud_done';
}

function activeToolLabel() {
    return rightWorkspaceTools.find((tool) => tool.id === rightWorkspaceTool.value)?.label || 'AI Chat';
}

function activeServerEvents() {
    const events = [];

    if (saveStatus.value === 'saving') events.push('Saving document');
    if (aiProviderStatus.value === 'loading') events.push('Loading AI settings');
    if (bookActivityStatus.value === 'loading') events.push('Loading activity');
    if (bookActivityActionStatus.value.startsWith('activity:')) events.push('Running activity action');
    if (blockVersionsStatus.value === 'loading') events.push('Loading versions');
    if (blockVersionActionStatus.value.startsWith('restoring:')) events.push('Restoring version');
    if (blockVersionActionStatus.value.startsWith('explaining:')) events.push('Explaining changes');
    if (blockReviewsStatus.value === 'loading') events.push('Loading corrections');
    if (blockReviewActionStatus.value === 'checking') events.push('Checking block');
    if (blockCommentsStatus.value === 'loading') events.push('Loading comments');
    if (bookCommentsQueueStatus.value === 'loading') events.push('Loading comment queue');
    if (blockCommentActionStatus.value === 'creating') events.push('Adding comment');
    if (voiceProfilesStatus.value === 'loading') events.push('Loading voices');
    if (voiceAssignmentStatus.value === 'loading') events.push('Loading voice assignment');
    if (voiceAssignmentActionStatus.value === 'saving') events.push('Assigning voice');
    if (voiceAssignmentActionStatus.value === 'clearing') events.push('Clearing voice');
    if (audioStatus.value === 'loading') events.push('Loading audio');
    if (audioActionStatus.value === 'generating') events.push('Generating audio');
    if (blockTranslationsStatus.value === 'loading') events.push('Loading translations');
    if (blockTranslationActionStatus.value === 'translating') events.push('Translating block');
    if (aiChatStatus.value === 'loading') events.push('Loading chat');
    if (aiChatStatus.value === 'asking') events.push('Asking AI');
    if (savingAiProvider.value) events.push('Saving provider');
    if (savingAiSetting.value) events.push('Saving AI setting');

    return events;
}

function serverHealthStatus() {
    const hasError = [
        blockReviewsStatus.value,
        bookActivityStatus.value,
        blockCommentsStatus.value,
        bookCommentsQueueStatus.value,
        voiceProfilesStatus.value,
        voiceAssignmentStatus.value,
        audioStatus.value,
        blockTranslationsStatus.value,
        aiChatStatus.value,
        aiProviderStatus.value,
        blockVersionsStatus.value,
    ].includes('error') || bookActivityActionStatus.value === 'error' || ['error', 'conflict'].includes(saveStatus.value);

    if (hasError) return 'error';
    if (activeServerEvents().length) return 'busy';

    return 'ready';
}

function estimateTokens(text) {
    if (!text) return 0;

    return Math.max(1, Math.ceil(text.trim().length / 4));
}

function buildEditorOutline(blocks, blockMeta) {
    let chapterNumber = 0;
    let blockNumberInChapter = 0;
    let hasChapter = false;

    return blocks.map((block, index) => {
        const meta = blockMeta.get(block.block_uuid);
        const isChapter = block.type === 'heading';

        if (isChapter) {
            chapterNumber += 1;
            blockNumberInChapter = 0;
            hasChapter = true;
        } else if (hasChapter) {
            blockNumberInChapter += 1;
        }

        return {
            block_uuid: block.block_uuid,
            type: block.type,
            label: outlineLabel(block, index),
            dirty: !meta || meta.signature !== blockSignature(block),
            current_version_id: meta?.current_version_id || block.base_version_id || null,
            isChapter,
            level: isChapter || !hasChapter ? 0 : 1,
            chapterNumber: isChapter ? chapterNumber : null,
            blockNumberInChapter: !isChapter && hasChapter ? blockNumberInChapter : null,
        };
    });
}

function blockSignature(block) {
    return JSON.stringify({
        type: block.type,
        sort_order: block.sort_order,
        content_json: block.content_json,
        text_plain: block.text_plain,
    });
}

function readRouteBookKey(ctx) {
    return ctx?.params?.key_book
        || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/edit/)?.[1]
        || window.location.pathname.match(/\/dashboard\/book\/([a-f0-9]{32})edit/)?.[1]
        || null;
}

function indexBook() {
    return _.div({
        class: () => !indexView.value ? 'at-indexBook cms-d-none' : 'at-indexBook', area: 'indexBook'
    },
        _.div({ class: 'at-indexBook-header' },
            _.span('Book Index'),
            _.span({ class: 'at-indexBook-count' }, () => {
                const outline = editorOutline.value;
                const chapterCount = outline.filter((item) => item.isChapter).length;

                return chapterCount
                    ? `${chapterCount} ch / ${outline.length}`
                    : `${outline.length}`;
            })
        ),
        _.div({ class: 'at-indexBook-list' }, () => {
            const outline = editorOutline.value;

            if (!outline.length) {
                return _.div({ class: 'at-indexBook-empty' }, 'No blocks');
            }

            return outline.map((item) => _.button({
                type: 'button',
                class: () => {
                    const classes = [
                        'at-indexBook-item',
                        `level-${item.level}`,
                        `type-${item.type}`,
                    ];

                    if (item.isChapter) classes.push('is-chapter');
                    if (item.block_uuid === activeEditorBlockId.value) classes.push('is-active');

                    return classes.join(' ');
                },
                onclick: () => focusEditorBlock(item.block_uuid),
                title: item.label,
            },
                _.span({ class: `at-indexBook-kind kind-${item.type}` }, outlineKindLabel(item)),
                _.span({ class: 'at-indexBook-label' }, item.label),
                blockCommentBadge(item),
                item.dirty ? _.span({ class: 'at-indexBook-dirty', title: 'Unsaved' }, '•') : null,
            ));
        })
    );
}

function rightWorkspaceHeader(tool, block, keyBook) {
    const service = aiServiceForTool(tool.id);

    return _.div({ class: 'at-rightWorkspace-header' },
        _.div({ class: 'at-rightWorkspace-headerTop' },
            _.div({ class: 'at-rightWorkspace-title' },
                _.Icon ? _.Icon({ name: tool.icon, class: 'at-rightWorkspace-titleIcon' }) : null,
                _.span(tool.label)
            ),
            !['activity', 'settings'].includes(tool.id) ? _.button({
                type: 'button',
                class: 'at-rightWorkspace-toolSettings',
                title: `${tool.label} AI settings`,
                onclick: () => openToolAiSettingsDialog(keyBook, service, tool.label),
            }, _.Icon ? _.Icon({ name: 'settings', class: 'at-rightWorkspace-toolSettingsIcon' }) : 'Settings') : null
        ),
        _.div({ class: 'at-rightWorkspace-context' }, block
            ? `${outlineKindLabel(block)} · ${block.label}`
            : 'Book context'
        )
    );
}

function blockContextSummary(block) {
    return _.div({ class: 'at-rightWorkspace-summary' },
        _.div({ class: 'at-rightWorkspace-summaryRow' },
            _.span('Scope'),
            _.strong(block ? outlineKindLabel(block) : 'Book')
        ),
        _.div({ class: 'at-rightWorkspace-summaryRow' },
            _.span('Selected'),
            _.strong(block ? block.label : 'No block selected')
        ),
        block?.current_version_id ? _.div({ class: 'at-rightWorkspace-summaryRow' },
            _.span('Version'),
            _.strong(`#${block.current_version_id}`)
        ) : null,
        block?.block_uuid ? _.div({ class: 'at-rightWorkspace-summaryRow' },
            _.span('Block'),
            _.strong(block.block_uuid)
        ) : null,
        block?.dirty ? _.div({ class: 'at-rightWorkspace-note warning' }, 'This block has unsaved changes.') : null
    );
}

function versionActivityBadges(version) {
    const activity = version.activity || {};
    const badges = [
        ['reviews', 'Correct'],
        ['comments', 'Comments'],
        ['voices', 'Voices'],
        ['audio', 'Audio'],
        ['translations', 'Translate'],
        ['ai_chats', 'Chat'],
    ];

    return badges
        .filter(([key]) => activity[key])
        .map(([key, label]) => _.span({
            class: `at-versionActivityBadge type-${key}`,
            title: `${activity[key]} ${label}`,
        }, `${label} ${activity[key]}`));
}

function activityPanel(keyBook) {
    const counts = bookActivityCounts();
    const items = visibleBookActivityItems();
    const status = bookActivityStatus.value;
    const activeItemIndex = items.findIndex((item) => item.id === activeBookActivityItemId.value);

    return _.div({ class: 'at-rightWorkspace-section at-activitySection' },
        _.div({ class: 'at-activityScroller' },
            _.div({ class: 'at-activityHead' },
                _.h3('Review queue'),
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action',
                    disabled: status === 'loading',
                    onclick: () => loadBookActivity(keyBook, { force: true }),
                }, status === 'loading' ? 'Loading...' : 'Refresh')
            ),
            _.p('Open the next editorial, correction, translation or audio item that needs attention.'),
            bookActivityError.value ? _.div({ class: 'at-chatError' }, bookActivityError.value) : null,
            _.div({ class: 'at-activityStats' },
                _.div(_.strong(String(counts.action)), _.span('Action')),
                _.div(_.strong(String(counts.review)), _.span('Review')),
                _.div(_.strong(String(counts.stale)), _.span('Stale'))
            ),
            counts.all ? _.div({ class: 'at-commentFilters' }, activityFilterOptions.map((option) => _.button({
                type: 'button',
                class: option.value === bookActivityFilter.value ? 'at-commentFilter is-active' : 'at-commentFilter',
                onclick: () => setBookActivityFilter(option.value),
            },
                _.span(option.label),
                _.strong(String(counts[option.value] || 0))
            ))) : null,
            status === 'loading'
                ? _.div({ class: 'at-chatNotice' }, 'Loading book activity...')
                : null,
            items.length
                ? _.div({ class: 'at-activityList' }, items.map((item) => {
                    const targetTool = rightWorkspaceTools.find((tool) => tool.id === item.tool);
                    const actionButtons = [
                        _.button({
                            type: 'button',
                            class: 'at-activityItemAction',
                            disabled: () => bookActivityActionStatus.value !== 'idle',
                            onclick: (event) => {
                                event.stopPropagation();
                                openBookActivityItem(item, { openTool: false });
                            },
                        }, 'Focus'),
                        ...activityDirectActions(item).map((directAction) => _.button({
                            type: 'button',
                            class: directAction.primary ? 'at-activityItemAction is-primary' : 'at-activityItemAction',
                            disabled: () => !canRunActivityDirectAction(item, directAction.action),
                            onclick: (event) => {
                                event.stopPropagation();
                                openBookActivityActionConfirm(item, keyBook, directAction);
                            },
                        }, () => isActivityItemActionBusy(item, directAction.action) ? `${directAction.label}...` : directAction.label)),
                        _.button({
                            type: 'button',
                            class: 'at-activityItemAction',
                            disabled: () => bookActivityActionStatus.value !== 'idle',
                            onclick: (event) => {
                                event.stopPropagation();
                                openBookActivityItem(item, { openTool: true });
                            },
                        }, activityOpenActionLabel(item)),
                    ].filter(Boolean);

                    return _.div({
                        role: 'button',
                        tabindex: '0',
                        class: [
                            'at-activityItem',
                            `severity-${item.severity || 'review'}`,
                            item.id === activeBookActivityItemId.value ? 'is-active' : '',
                        ].filter(Boolean).join(' '),
                        'data-activity-item-id': String(item.id || ''),
                        onclick: () => openBookActivityItem(item, { openTool: false }),
                        onkeydown: (event) => {
                            if (!['Enter', ' '].includes(event.key)) return;

                            event.preventDefault();
                            openBookActivityItem(item, { openTool: false });
                        },
                        title: item.preview || item.title,
                    },
                        _.span({ class: 'at-activityItemIcon' }, _.Icon ? _.Icon({ name: targetTool?.icon || 'fact_check' }) : null),
                        _.span({ class: 'at-activityItemMain' },
                            _.span({ class: 'at-activityItemTitle' },
                                _.strong(item.title || 'Activity'),
                                _.span({ class: 'at-activityItemTitleMeta' },
                                    activitySourceBadge(item),
                                    _.em(`${item.count || 1}`)
                                )
                            ),
                            _.span({ class: 'at-activityItemMeta' }, `${targetTool?.label || item.tool} · ${activityBlockKindLabel(item)}`),
                            _.span({ class: 'at-activityItemBody' }, item.description || ''),
                            item.preview ? _.span({ class: 'at-activityItemPreview' }, item.preview) : null,
                            () => bookActivityFeedback.value?.itemId === item.id
                                ? _.span({
                                    class: `at-activityFeedback is-${bookActivityFeedback.value.type || 'success'}`,
                                }, bookActivityFeedback.value.message)
                                : null,
                            _.span({ class: 'at-activityItemActions' }, ...actionButtons)
                        )
                    );
                }))
                : _.div({ class: 'at-rightWorkspace-emptyState' },
                    _.strong(counts.all ? 'No activity in this filter' : 'No pending activity'),
                    _.p(counts.all ? 'Switch filter to see other review queue items.' : 'Comments, corrections, translations and audio work will appear here.')
                )
        ),
        items.length ? _.div({ class: 'at-activityNav' },
            _.button({
                type: 'button',
                class: 'at-activityNavBtn',
                onclick: () => navigateBookActivityItem(-1),
            }, 'Previous'),
            _.span(`${Math.max(activeItemIndex, 0) + 1} / ${items.length}`),
            _.button({
                type: 'button',
                class: 'at-activityNavBtn',
                onclick: () => navigateBookActivityItem(1),
            }, 'Next')
        ) : null
    );
}

function openVersionDiffDialog(block, version, versions) {
    const compareTarget = _.rod(defaultVersionCompareTarget(version, versions));
    const showOnlyChanges = _.rod(false);

    _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div({ class: 'at-versionDiffHeader' },
                _.h2('Version changes'),
                _.p(`v${version.version_number}`)
            ),
            content: ({ close }) => _.div({ class: 'at-versionDiffDialog' },
                _.div({ class: 'at-versionDiffToolbar' },
                    _.Select({
                        label: 'Compare with',
                        icon: 'compare_arrows',
                        model: compareTarget,
                        options: versionCompareOptions(version, versions),
                        onChange: (value) => {
                            compareTarget.value = selectChangeValue(value, compareTarget.value);
                        },
                    }),
                    _.label({ class: 'at-versionDiffToggle' },
                        _.input({
                            type: 'checkbox',
                            checked: () => showOnlyChanges.value,
                            onchange: (event) => {
                                showOnlyChanges.value = Boolean(event.target.checked);
                            },
                        }),
                        _.span('Only changes')
                    )
                ),
                () => {
                    const comparison = resolveVersionComparison(version, versions, compareTarget.value);

                    return comparison
                        ? versionDiffContent(comparison, showOnlyChanges.value)
                        : _.div({ class: 'at-versionDiffEmpty' },
                            _.strong('No comparison available'),
                            _.p('This block has only one saved version.')
                        );
                },
                _.div({ class: 'at-versionDiffActions' },
                    _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Close'),
                    _.Btn({
                        type: 'button',
                        color: 'secondary',
                        disabled: () => {
                            const comparison = resolveVersionComparison(version, versions, compareTarget.value);

                            return !comparison
                                || !block?.current_version_id
                                || block?.dirty
                                || blockCommentActionStatus.value !== 'idle';
                        },
                        onClick: async () => {
                            const comparison = resolveVersionComparison(version, versions, compareTarget.value);
                            if (!comparison) return;

                            await createBlockCommentFromSource(block, versionDiffCommentBody(comparison), version.id);
                            close();
                        },
                    }, () => blockCommentActionStatus.value === 'creating' ? 'Adding...' : 'Add as comment'),
                    _.Btn({
                        type: 'button',
                        color: 'primary',
                        disabled: () => {
                            const comparison = resolveVersionComparison(version, versions, compareTarget.value);

                            return !comparison
                                || blockVersionActionStatus.value !== 'idle'
                                || versionsAiSummary().missingApiKey;
                        },
                        onClick: async () => {
                            const comparison = resolveVersionComparison(version, versions, compareTarget.value);
                            if (!comparison) return;

                            await explainBlockVersion(block, version, comparison.compare);
                        },
                    }, () => blockVersionActionStatus.value === `explaining:${version.id}` ? 'Explaining...' : 'Explain this diff')
                )
            ),
        },
    }).open();
}

function defaultVersionCompareTarget(version, versions) {
    const comparison = resolveVersionComparison(version, versions);

    return comparison?.compare ? `version:${comparison.compare.id}` : '';
}

function versionCompareOptions(version, versions) {
    return versions
        .filter((item) => item.id !== version.id)
        .sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0))
        .map((item) => ({
            label: `${item.is_current ? 'Current ' : ''}v${item.version_number} · ${item.source || 'manual'}`,
            value: `version:${item.id}`,
        }));
}

function resolveVersionComparison(version, versions, target = '') {
    const ordered = [...versions].sort((a, b) => Number(a.version_number || 0) - Number(b.version_number || 0));
    const current = ordered.find((item) => item.is_current) || ordered[ordered.length - 1];

    if (!current) return null;

    if (target.startsWith('version:')) {
        const compare = ordered.find((item) => String(item.id) === target.replace('version:', ''));
        if (!compare || compare.id === version.id) return null;

        const [from, to] = Number(version.version_number || 0) <= Number(compare.version_number || 0)
            ? [version, compare]
            : [compare, version];

        return {
            from,
            to,
            compare,
            fromLabel: `v${from.version_number}`,
            toLabel: `${to.is_current ? 'current ' : ''}v${to.version_number}`,
        };
    }

    if (!version.is_current) {
        return {
            from: version,
            to: current,
            compare: current,
            fromLabel: `v${version.version_number}`,
            toLabel: `current v${current.version_number}`,
        };
    }

    const currentIndex = ordered.findIndex((item) => item.id === version.id);
    const previous = ordered[currentIndex - 1];

    if (!previous) return null;

    return {
        from: previous,
        to: version,
        compare: previous,
        fromLabel: `v${previous.version_number}`,
        toLabel: `current v${version.version_number}`,
    };
}

function versionDiffContent(comparison, showOnlyChanges = false) {
    const parts = buildVersionTextDiff(comparison.from.text_plain, comparison.to.text_plain);
    const visibleParts = showOnlyChanges
        ? parts.filter((part) => part.type !== 'same')
        : parts;
    const summary = summarizeVersionTextDiff(parts);

    return _.div({ class: 'at-versionDiffContent' },
        _.div({ class: 'at-versionDiffSummary' },
            _.div(
                _.span('Added'),
                _.strong(`${summary.added} words`)
            ),
            _.div(
                _.span('Removed'),
                _.strong(`${summary.removed} words`)
            ),
            _.div(
                _.span('Source'),
                _.strong(`${comparison.from.source || 'manual'} -> ${comparison.to.source || 'manual'}`)
            )
        ),
        _.div({ class: 'at-versionDiffSplit' },
            _.div(
                _.span('From'),
                _.strong(comparison.fromLabel),
                _.p(comparison.from.text_plain || 'Empty block')
            ),
            _.div(
                _.span('To'),
                _.strong(comparison.toLabel),
                _.p(comparison.to.text_plain || 'Empty block')
            )
        ),
        _.div({ class: 'at-versionDiffBody' },
            visibleParts.length
                ? visibleParts.map((part) => _.span({
                    class: `at-versionDiff-token is-${part.type}`,
                }, part.text))
                : _.span({ class: 'at-versionDiff-token is-same' }, 'No text changes.')
        )
    );
}

function versionDiffCommentBody(comparison) {
    const parts = buildVersionTextDiff(comparison.from.text_plain, comparison.to.text_plain);
    const summary = summarizeVersionTextDiff(parts);

    return [
        `Version diff ${comparison.fromLabel} -> ${comparison.toLabel}`,
        `Added: ${summary.added} words. Removed: ${summary.removed} words.`,
        '',
        'Review this change before applying related editorial, audio or translation decisions.',
    ].join('\n');
}

function versionHasActivity(version) {
    return Object.values(version.activity || {}).some((count) => Number(count) > 0);
}

function versionSearchText(version) {
    return [
        `v${version.version_number || ''}`,
        version.source || '',
        version.text_plain || '',
        version.explanation?.answer || '',
        version.explanation?.provider_name || '',
        version.explanation?.model || '',
    ].join(' ').toLowerCase();
}

function versionFilterCounts(versions) {
    return {
        all: versions.length,
        current: versions.filter((version) => version.is_current).length,
        activity: versions.filter(versionHasActivity).length,
        stale: versions.filter((version) => version.has_stale_activity).length,
        ai: versions.filter((version) => Boolean(version.explanation)).length,
    };
}

function visibleVersions(versions) {
    const search = versionSearch.value.trim().toLowerCase();
    const filtered = versions.filter((version) => {
        if (versionFilter.value === 'current' && !version.is_current) return false;
        if (versionFilter.value === 'activity' && !versionHasActivity(version)) return false;
        if (versionFilter.value === 'stale' && !version.has_stale_activity) return false;
        if (versionFilter.value === 'ai' && !version.explanation) return false;

        return !search || versionSearchText(version).includes(search);
    });

    return filtered.sort((first, second) => {
        const direction = versionSortOrder.value === 'oldest' ? 1 : -1;

        return direction * (Number(first.version_number || 0) - Number(second.version_number || 0));
    });
}

function versionListControls(versions) {
    const counts = versionFilterCounts(versions);

    return _.div({ class: 'at-versionControls' },
        _.div({ class: 'at-versionFilterBar' }, versionFilterOptions.map((option) => _.button({
            type: 'button',
            class: option.value === versionFilter.value ? 'at-versionFilter is-active' : 'at-versionFilter',
            onclick: () => setVersionFilter(option.value),
        },
            _.span(option.label),
            _.strong(String(counts[option.value] || 0))
        ))),
        _.div({ class: 'at-versionControls-row' },
            _.Select({
                class: 'at-versionControlField',
                label: 'Order',
                icon: 'sort',
                model: versionSortOrder,
                options: versionSortOptions,
                onChange: (value) => setVersionSortOrder(selectChangeValue(value, versionSortOrder.value)),
            }),
            _.Input({
                class: 'at-versionControlField',
                label: 'Search',
                icon: 'search',
                model: versionSearch,
                placeholder: 'Search versions',
                onInput: (event) => setVersionSearch(event.target.value),
                onChange: (value) => setVersionSearch(selectChangeValue(value, versionSearch.value)),
            })
        )
    );
}

function versionsPanel(block, keyBook) {
    if (!block) {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Version history'),
            _.p('Select a block to inspect its saved versions.')
        );
    }

    const status = blockVersionsStatus.value;

    if (status === 'loading') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Version history'),
            _.p('Loading versions...')
        );
    }

    if (status === 'error') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Version history'),
            _.p('Unable to load versions for this block.')
        );
    }

    const versions = blockVersions.value;
    const filteredVersions = visibleVersions(versions);
    const staleActivityCount = versions.filter((version) => version.has_stale_activity).length;
    const aiSummary = versionsAiSummary();

    return _.div({ class: 'at-rightWorkspace-section at-versionSection' },
        _.h3('Version history'),
        _.div({ class: aiSummary.missingApiKey ? 'at-correctionProvider has-warning' : 'at-correctionProvider' },
            _.div({ class: 'at-correctionProvider-main' },
                _.span('Provider'),
                _.strong(`${aiSummary.providerName}${aiSummary.model ? ` · ${aiSummary.model}` : ''}`)
            ),
            aiSummary.missingApiKey ? _.button({
                type: 'button',
                class: 'at-correctionProvider-action',
                onclick: () => openToolAiSettingsDialog(keyBook, 'versions', 'Versions'),
            }, 'Configure AI settings') : null
        ),
        () => blockVersionsError.value ? _.div({ class: 'at-chatError' }, blockVersionsError.value) : null,
        staleActivityCount ? _.div({ class: 'at-rightWorkspace-note warning' },
            `${staleActivityCount} older version${staleActivityCount === 1 ? ' has' : 's have'} linked activity.`
        ) : null,
        versions.length ? versionListControls(versions) : null,
        versions.length
            ? filteredVersions.length
                ? _.div({ class: 'at-versionList' }, filteredVersions.map((version) => {
                    const activityBadges = versionActivityBadges(version);
                    const classes = ['at-versionItem'];
                    if (version.is_current) classes.push('is-current');
                    if (version.has_stale_activity) classes.push('has-staleActivity');
                    const explanationHidden = isVersionExplanationHidden(version);

                    return _.div({
                        class: classes.join(' '),
                    },
                        _.div({ class: 'at-versionItem-head' },
                            _.strong(`v${version.version_number}`),
                            _.span(version.source || 'manual'),
                            version.is_current ? _.span({ class: 'at-versionBadge' }, 'Current') : null,
                            version.has_stale_activity ? _.span({ class: 'at-versionBadge is-stale' }, 'Stale links') : null
                        ),
                        _.div({ class: 'at-versionItem-date' }, version.created_at
                            ? new Date(version.created_at).toLocaleString()
                            : ''
                        ),
                        activityBadges.length ? _.div({ class: 'at-versionActivity' }, activityBadges) : null,
                        _.div({ class: 'at-versionItem-preview' }, version.text_plain || 'Empty block'),
                        version.explanation ? _.div({ class: 'at-versionExplanationToggle' },
                            _.button({
                                type: 'button',
                                class: 'at-versionExplanationToggleButton',
                                onclick: () => toggleVersionExplanation(version),
                            }, explanationHidden ? 'Show explanation' : 'Hide explanation')
                        ) : null,
                        version.explanation && !explanationHidden ? _.div({ class: 'at-versionExplanation' },
                            _.div({ class: 'at-versionExplanation-head' },
                                _.strong(version.explanation.provider_name || 'AI'),
                                _.span(version.explanation.model || '')
                            ),
                            _.p(version.explanation.answer || ''),
                            _.div({ class: 'at-versionExplanation-actions' },
                                _.button({
                                    type: 'button',
                                    class: 'at-versionExplanation-action',
                                    disabled: () => !block?.current_version_id
                                        || block?.dirty
                                        || blockCommentActionStatus.value !== 'idle',
                                    onclick: () => createBlockCommentFromSource(block, version.explanation.answer || '', version.id),
                                }, () => blockCommentActionStatus.value === 'creating' ? 'Adding...' : 'Add comment')
                            )
                        ) : null,
                        _.div({ class: 'at-versionItem-actions' },
                            _.button({
                                type: 'button',
                                class: 'at-rightWorkspace-action',
                                onclick: () => openVersionDiffDialog(block, version, versions),
                            }, 'View changes'),
                            _.button({
                                type: 'button',
                                class: 'at-rightWorkspace-action',
                                disabled: () => versions.length < 2
                                    || blockVersionActionStatus.value !== 'idle'
                                    || versionsAiSummary().missingApiKey,
                                onclick: () => explainBlockVersion(block, version),
                            }, () => blockVersionActionStatus.value === `explaining:${version.id}` ? 'Explaining...' : 'Explain'),
                            _.button({
                                type: 'button',
                                class: 'at-rightWorkspace-action',
                                disabled: () => version.is_current || blockVersionActionStatus.value !== 'idle',
                                onclick: () => restoreBlockVersion(block, version),
                            }, () => blockVersionActionStatus.value === `restoring:${version.id}` ? 'Restoring...' : 'Restore')
                        )
                    );
                }))
                : _.div({ class: 'at-rightWorkspace-emptyState' },
                    _.strong('No matching versions'),
                    _.p('Adjust the filter, order or search text.')
                )
            : _.p('No versions saved for this block yet.')
    );
}

function aiChatPanel(block, keyBook) {
    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('AI conversation'),
        () => {
            const aiSummary = chatAiSummary();

            return _.div({ class: aiSummary.missingApiKey ? 'at-correctionProvider has-warning' : 'at-correctionProvider' },
                _.div({ class: 'at-correctionProvider-main' },
                    _.span('Provider'),
                    _.strong(`${aiSummary.providerName}${aiSummary.model ? ` · ${aiSummary.model}` : ''}`)
                ),
                aiSummary.missingApiKey ? _.button({
                    type: 'button',
                    class: 'at-correctionProvider-action',
                    onclick: () => openToolAiSettingsDialog(keyBook, 'chat', 'AI Chat'),
                }, 'Configure AI settings') : null
            );
        },
        _.Textarea({
            label: block ? 'Ask about selected block' : 'Ask about this book',
            icon: 'forum',
            rows: 4,
            model: aiChatDraft,
            placeholder: 'Ask a question for the editorial assistant',
        }),
        () => aiChatError.value ? _.div({ class: 'at-chatError' }, aiChatError.value) : null,
        _.div({ class: 'at-rightWorkspace-actions is-top' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action is-primary',
                disabled: () => {
                    const aiSummary = chatAiSummary();
                    const isAsking = aiChatStatus.value === 'asking';

                    return !Boolean(aiChatDraft.value.trim()) || isAsking || aiSummary.missingApiKey;
                },
                onclick: () => askAiChat(block),
            }, () => {
                const aiSummary = chatAiSummary();

                return aiChatStatus.value === 'asking'
                    ? `Asking ${aiSummary.providerName}...`
                    : 'Ask';
            }),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: () => aiChatStatus.value === 'asking',
                onclick: () => loadAiChatMessages(block, { force: true }),
            }, 'Refresh')
        ),
        () => aiChatStatus.value === 'loading'
            ? _.div({ class: 'at-chatNotice' }, 'Loading conversation...')
            : null,
        () => aiChatMessages.value.length
            ? _.div({ class: 'at-chatMessages' }, aiChatMessages.value.map((message) => _.div({ class: 'at-chatMessage' },
                _.div({ class: 'at-chatQuestion' },
                    _.span('You'),
                    _.p(message.question)
                ),
                _.div({ class: 'at-chatAnswer' },
                    _.div({ class: 'at-chatAnswerHead' },
                        _.strong(message.provider_name || 'AI'),
                        _.span(message.model || '')
                    ),
                    _.p(message.answer)
                )
            )))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No AI messages yet'),
                _.p('Ask a question using the selected block or book as context.')
            )
    );
}

function commentsPanel(block) {
    if (!block) {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Editorial comments'),
            _.p('Select a block to add and review editorial comments.')
        );
    }

    const status = blockCommentsStatus.value;
    const actionStatus = blockCommentActionStatus.value;
    const comments = blockComments.value;
    const visibleComments = visibleBlockComments(comments);
    const visibleQueue = visibleBookCommentsQueue();
    const queueCounts = bookCommentsQueueCounts();
    const queueAnchorCounts = bookCommentsQueueAnchorCounts();
    const counts = queueCounts.all ? queueCounts : activeBlockCommentCounts();
    const anchorCounts = queueCounts.all ? queueAnchorCounts : activeBlockAnchorCounts(comments);
    const activeCommentIndex = visibleQueue.findIndex((comment) => comment.id === activeBlockCommentId.value);
    const selectedAnchor = blockCommentSelectionAnchor.value?.block_uuid === block.block_uuid
        ? blockCommentSelectionAnchor.value
        : null;

    const commentCards = () => comments.length
        ? visibleComments.length
            ? _.div({ class: 'at-commentList' }, visibleComments.map((comment) => {
                const isOpen = (comment.status || 'open') === 'open';
                const isBusy = actionStatus === `updating:${comment.id}`;
                const isUpdatingAnchor = actionStatus === `anchoring:${comment.id}`;
                const anchor = commentAnchor(comment);
                const anchorResolution = blockCommentAnchorResolutions.value[comment.id] || null;
                const isActiveComment = activeBlockCommentId.value === comment.id;

                return _.div({
                    class: [
                        'at-commentItem',
                        comment.is_current_version ? '' : 'is-stale',
                        isActiveComment ? 'is-active' : '',
                    ].filter(Boolean).join(' '),
                    'data-comment-item-id': String(comment.id),
                },
                    _.div({ class: 'at-commentItem-head' },
                        _.strong(isOpen ? 'Open comment' : 'Resolved comment'),
                        _.span({ class: `at-commentStatus status-${comment.status}` }, comment.status || 'open')
                    ),
                    _.div({ class: 'at-commentItem-version' }, comment.version_number
                        ? `v${comment.version_number}${comment.is_current_version ? ' current' : ' stale'}`
                        : ''
                    ),
                    anchorSnippet(anchor)
                        ? _.div({ class: `at-commentAnchor ${commentAnchorStateClass(comment)}` },
                            _.span(commentAnchorStateLabel(comment) || 'Anchor'),
                            _.strong(anchorSnippet(anchor)),
                            anchorResolution?.state === 'reanchored'
                                ? _.em('Matched in current text')
                                : null
                        )
                        : null,
                    _.p({ class: 'at-commentBody' }, comment.body || ''),
                    _.div({ class: 'at-commentItem-actions' },
                        _.button({
                            type: 'button',
                            class: 'at-commentItem-action',
                            onclick: () => focusEditorBlock(comment.block_uuid || block.block_uuid),
                        }, 'Focus block'),
                        anchorResolution?.state === 'reanchored'
                            ? _.button({
                                type: 'button',
                                class: 'at-commentItem-action is-apply',
                                disabled: isUpdatingAnchor || actionStatus !== 'idle' || !block.current_version_id,
                                onclick: () => updateBlockCommentAnchor(block, comment, anchorResolution),
                            }, isUpdatingAnchor ? 'Saving...' : 'Update anchor')
                            : null,
                        _.button({
                            type: 'button',
                            class: isOpen ? 'at-commentItem-action' : 'at-commentItem-action is-apply',
                            disabled: isBusy || actionStatus !== 'idle',
                            onclick: () => updateBlockCommentStatus(block, comment, isOpen ? 'resolved' : 'open'),
                        }, isBusy ? 'Saving...' : (isOpen ? 'Resolve' : 'Reopen'))
                    )
                );
            }))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No comments in this filter'),
                _.p('Switch filter to see other comment states.')
            )
        : _.div({ class: 'at-rightWorkspace-emptyState' },
            _.strong(queueCounts.all ? 'No comments on selected block' : 'No comments yet'),
            _.p(queueCounts.all
                ? 'Use Previous or Next to jump to another block with comments.'
                : 'Add comments to track manual editorial notes on this block version.')
        );

    return _.div({ class: 'at-rightWorkspace-section at-commentsReviewSection' },
        _.div({ class: 'at-commentsReviewScroller' },
            _.h3('Editorial comments'),
            block.dirty ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Save the selected block before adding a comment.') : null,
            !block.current_version_id ? _.div({ class: 'at-rightWorkspace-note warning' }, 'This block needs a saved version before comments can be tracked.') : null,
            selectedAnchor
                ? _.div({ class: 'at-commentAnchorPreview' },
                    _.strong('Anchored to selection'),
                    _.span(anchorSnippet(selectedAnchor))
                )
                : null,
            _.Textarea({
                label: 'Comment',
                icon: 'comment',
                rows: 3,
                model: blockCommentDraft,
                placeholder: 'Add a note for this block',
            }),
            () => blockCommentsError.value ? _.div({ class: 'at-chatError' }, blockCommentsError.value) : null,
            _.div({ class: 'at-rightWorkspace-actions is-top' },
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action is-primary',
                    disabled: () => !Boolean(blockCommentDraft.value.trim())
                        || block.dirty
                        || !block.current_version_id
                        || blockCommentActionStatus.value !== 'idle',
                    onclick: () => createBlockComment(block),
                }, actionStatus === 'creating' ? 'Adding...' : 'Add comment'),
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action',
                    disabled: () => actionStatus !== 'idle',
                    onclick: () => {
                        loadBlockComments(block, { force: true });
                        loadBookCommentsQueue({ force: true });
                    },
                }, 'Refresh')
            ),
            status === 'loading'
                ? _.div({ class: 'at-chatNotice' }, 'Loading comments...')
                : null,
            bookCommentsQueueStatus.value === 'loading'
                ? _.div({ class: 'at-chatNotice' }, 'Loading book comment queue...')
                : null,
            bookCommentsQueueError.value
                ? _.div({ class: 'at-chatError' }, bookCommentsQueueError.value)
                : null,
            comments.length || queueCounts.all ? _.div({ class: 'at-commentFilters' }, commentFilterOptions.map((option) => _.button({
                type: 'button',
                class: option.value === blockCommentFilter.value ? 'at-commentFilter is-active' : 'at-commentFilter',
                onclick: () => setBlockCommentFilter(option.value),
            },
                _.span(option.label),
                _.strong(String(counts[option.value] || 0))
            ))) : null,
            comments.length || queueCounts.all ? _.div({ class: 'at-commentFilters is-anchor' }, commentAnchorFilterOptions.map((option) => _.button({
                type: 'button',
                class: option.value === blockCommentAnchorFilter.value ? 'at-commentFilter is-active' : 'at-commentFilter',
                onclick: () => setBlockCommentAnchorFilter(option.value),
            },
                _.span(option.label),
                _.strong(String(anchorCounts[option.value] || 0))
            ))) : null,
            commentCards()
        ),
        visibleQueue.length ? _.div({ class: 'at-commentReviewNav' },
            _.button({
                type: 'button',
                class: 'at-commentNavBtn',
                disabled: !visibleQueue.length,
                onclick: () => navigateBlockComment(block, -1),
            }, 'Previous'),
            _.span(visibleQueue.length
                ? `${Math.max(activeCommentIndex, 0) + 1} / ${visibleQueue.length}`
                : '0 / 0'),
            _.button({
                type: 'button',
                class: 'at-commentNavBtn',
                disabled: !visibleQueue.length,
                onclick: () => navigateBlockComment(block, 1),
            }, 'Next')
        ) : null
    );
}

function voicesPanel(block, keyBook) {
    const profiles = voiceProfiles.value;
    const assignment = voiceAssignment.value;
    const assignedProfile = assignment?.voice_profile
        || profiles.find((profile) => String(profile.id) === String(selectedVoiceProfileId.value))
        || null;
    const profileOptions = [
        { label: 'No voice assigned', value: '' },
        ...profiles.map((profile) => ({
            label: `${profile.name}${profile.role ? ` · ${profile.role}` : ''}`,
            value: String(profile.id),
        })),
    ];

    if (voiceProfilesStatus.value === 'loading') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Characters and voices'),
            _.p('Loading voice profiles...')
        );
    }

    if (voiceProfilesStatus.value === 'error') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Characters and voices'),
            _.p(voiceProfilesError.value || 'Unable to load voice profiles.'),
            _.div({ class: 'at-rightWorkspace-actions is-inline' },
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action is-primary',
                    onclick: () => loadVoiceProfiles(keyBook, { force: true }),
                }, 'Retry')
            )
        );
    }

    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('Characters and voices'),
        !block ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Select a block to assign a voice.') : null,
        block?.dirty ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Save the selected block before assigning a voice.') : null,
        block && !block.current_version_id ? _.div({ class: 'at-rightWorkspace-note warning' }, 'This block needs a saved version before voice assignment can be tracked.') : null,
        _.div({ class: 'at-voiceCurrent' },
            _.span('Current voice'),
            assignedProfile
                ? _.strong(`${assignedProfile.name}${assignedProfile.voice_id ? ` · ${assignedProfile.voice_id}` : ''}`)
                : _.strong('Not assigned'),
            assignedProfile?.voice_provider ? _.small(assignedProfile.voice_provider) : null
        ),
        _.Select({
            label: 'Assign to selected block',
            icon: 'record_voice_over',
            model: selectedVoiceProfileId,
            options: () => profileOptions,
            onChange: (value) => {
                selectedVoiceProfileId.value = selectChangeValue(value, selectedVoiceProfileId.value);
            },
        }),
        () => voiceAssignmentError.value ? _.div({ class: 'at-chatError' }, voiceAssignmentError.value) : null,
        _.div({ class: 'at-rightWorkspace-actions is-top' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action is-primary',
                disabled: () => !block
                    || block.dirty
                    || !block.current_version_id
                    || !selectedVoiceProfileId.value
                    || voiceAssignmentActionStatus.value !== 'idle',
                onclick: () => saveBlockVoiceAssignment(block),
            }, voiceAssignmentActionStatus.value === 'saving' ? 'Assigning...' : 'Assign voice'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: () => !block
                    || !assignment
                    || voiceAssignmentActionStatus.value !== 'idle',
                onclick: () => clearBlockVoiceAssignment(block),
            }, voiceAssignmentActionStatus.value === 'clearing' ? 'Clearing...' : 'Clear'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                onclick: () => openVoiceProfileDialog(keyBook),
            }, 'Create character')
        ),
        voiceAssignmentStatus.value === 'loading'
            ? _.div({ class: 'at-chatNotice' }, 'Loading block voice...')
            : null,
        profiles.length
            ? _.div({ class: 'at-voiceList' }, profiles.map((profile) => _.div({
                class: assignedProfile?.id === profile.id ? 'at-voiceItem is-active' : 'at-voiceItem',
            },
                _.div({ class: 'at-voiceItem-head' },
                    _.strong(profile.name),
                    _.span(profile.role || 'character')
                ),
                _.div({ class: 'at-voiceItem-meta' },
                    profile.voice_provider || 'No provider',
                    profile.voice_id ? ` · ${profile.voice_id}` : '',
                    profile.language ? ` · ${profile.language}` : ''
                ),
                profile.notes ? _.p(profile.notes) : null
            )))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No voices yet'),
                _.p('Create a narrator or character voice profile before assigning it to blocks.')
            )
    );
}

function formatAudioDuration(ms) {
    if (!ms) return 'Duration pending';

    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return minutes ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}s`;
}

function audioPanel(block, keyBook) {
    const segments = audioSegments.value;
    const assignment = voiceAssignment.value;
    const assignedProfile = assignment?.voice_profile || null;
    const aiSummary = audioAiSummary();
    const isGenerating = audioActionStatus.value === 'generating';

    if (!block) {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Audio production'),
            _.p('Select a block to generate and inspect audio segments.')
        );
    }

    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('Audio production'),
        block.dirty ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Save the selected block before generating audio.') : null,
        !block.current_version_id ? _.div({ class: 'at-rightWorkspace-note warning' }, 'This block needs a saved version before audio can be generated.') : null,
        !assignedProfile ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Assign a voice before generating audio.') : null,
        _.div({ class: aiSummary.missingApiKey ? 'at-correctionProvider has-warning' : 'at-correctionProvider' },
            _.div({ class: 'at-correctionProvider-main' },
                _.span('Provider'),
                _.strong(`${aiSummary.providerName}${aiSummary.model ? ` · ${aiSummary.model}` : ''}`)
            ),
            aiSummary.missingApiKey ? _.button({
                type: 'button',
                class: 'at-correctionProvider-action',
                onclick: () => openToolAiSettingsDialog(keyBook, 'audio', 'Audio'),
            }, 'Configure AI settings') : null
        ),
        _.div({ class: 'at-voiceCurrent' },
            _.span('Assigned voice'),
            assignedProfile
                ? _.strong(`${assignedProfile.name}${assignedProfile.voice_id ? ` · ${assignedProfile.voice_id}` : ''}`)
                : _.strong('Not assigned'),
            assignedProfile?.voice_provider ? _.small(assignedProfile.voice_provider) : null
        ),
        () => audioError.value ? _.div({ class: 'at-chatError' }, audioError.value) : null,
        _.div({ class: 'at-rightWorkspace-actions is-top' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action is-primary',
                disabled: () => !block
                    || block.dirty
                    || !block.current_version_id
                    || !voiceAssignment.value
                    || audioAiSummary().missingApiKey
                    || audioActionStatus.value !== 'idle',
                onclick: () => runPanelAction('generate_audio', {
                    context: block.label || 'Selected block',
                    preview: block.label,
                }, () => generateBlockAudio(block)),
            }, isGenerating ? `Generating with ${aiSummary.providerName}...` : 'Generate block audio'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: () => audioActionStatus.value !== 'idle',
                onclick: () => loadBlockAudio(block, { force: true }),
            }, 'Refresh')
        ),
        audioStatus.value === 'loading'
            ? _.div({ class: 'at-chatNotice' }, 'Loading audio segments...')
            : null,
        segments.length
            ? _.div({ class: 'at-audioList' }, segments.map((segment) => _.div({
                class: segment.is_current_version ? 'at-audioItem' : 'at-audioItem is-stale',
            },
                _.div({ class: 'at-audioItem-head' },
                    _.strong(segment.voice_profile?.name || 'Audio segment'),
                    _.span(segment.status || 'completed')
                ),
                _.div({ class: 'at-audioItem-meta' },
                    formatAudioDuration(segment.duration_ms),
                    segment.version_number ? ` · v${segment.version_number}${segment.is_current_version ? ' current' : ' stale'}` : '',
                    segment.provider_key ? ` · ${segment.provider_key}` : '',
                    segment.model ? ` · ${segment.model}` : ''
                ),
                _.div({ class: 'at-audioPath' }, segment.audio_path || 'No audio file path yet'),
                _.p(segment.text_plain || '')
            )))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No audio segments yet'),
                _.p('Generate audio after assigning a voice to the selected block.')
            )
    );
}

function translatePanel(block, keyBook) {
    const translations = blockTranslations.value;
    const aiSummary = translateAiSummary();
    const isTranslating = blockTranslationActionStatus.value === 'translating';

    if (!block) {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('Translation'),
            _.p('Select a block to translate and review localized drafts.')
        );
    }

    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('Translation'),
        block.dirty ? _.div({ class: 'at-rightWorkspace-note warning' }, 'Save the selected block before translating.') : null,
        !block.current_version_id ? _.div({ class: 'at-rightWorkspace-note warning' }, 'This block needs a saved version before translation can be tracked.') : null,
        _.div({ class: aiSummary.missingApiKey ? 'at-correctionProvider has-warning' : 'at-correctionProvider' },
            _.div({ class: 'at-correctionProvider-main' },
                _.span('Provider'),
                _.strong(`${aiSummary.providerName}${aiSummary.model ? ` · ${aiSummary.model}` : ''}`)
            ),
            aiSummary.missingApiKey ? _.button({
                type: 'button',
                class: 'at-correctionProvider-action',
                onclick: () => openToolAiSettingsDialog(keyBook, 'translate', 'Translate'),
            }, 'Configure AI settings') : null
        ),
        _.Select({
            label: 'Target language',
            icon: 'translate',
            model: translationTargetLocale,
            options: translationLocaleOptions,
            onChange: (value) => {
                setTranslationTargetLocale(selectChangeValue(value, translationTargetLocale.value));
            },
        }),
        () => blockTranslationsError.value ? _.div({ class: 'at-chatError' }, blockTranslationsError.value) : null,
        _.div({ class: 'at-rightWorkspace-actions is-top' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action is-primary',
                disabled: () => !block
                    || block.dirty
                    || !block.current_version_id
                    || !translationTargetLocale.value
                    || translateAiSummary().missingApiKey
                    || blockTranslationActionStatus.value !== 'idle',
                onclick: () => createBlockTranslation(block),
            }, isTranslating ? `Translating with ${aiSummary.providerName}...` : 'Translate block'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: () => blockTranslationActionStatus.value !== 'idle',
                onclick: () => loadBlockTranslations(block, { force: true }),
            }, 'Refresh')
        ),
        blockTranslationsStatus.value === 'loading'
            ? _.div({ class: 'at-chatNotice' }, 'Loading translations...')
            : null,
        translations.length
            ? _.div({ class: 'at-translationList' }, translations.map((translation) => {
                const isDraft = (translation.status || 'draft') === 'draft';
                const isBusy = blockTranslationActionStatus.value === `updating:${translation.id}`;
                const canResolve = isDraft && translation.is_current_version && !block.dirty;

                return _.div({
                    class: translation.is_current_version ? 'at-translationItem' : 'at-translationItem is-stale',
                },
                    _.div({ class: 'at-translationItem-head' },
                        _.strong(translation.target_locale || 'translation'),
                        _.span({ class: `at-translationStatus status-${translation.status}` }, translation.status || 'draft')
                    ),
                    _.div({ class: 'at-translationItem-meta' },
                        translation.version_number ? `v${translation.version_number}${translation.is_current_version ? ' current' : ' stale'}` : '',
                        translation.provider_key ? ` · ${translation.provider_key}` : '',
                        translation.model ? ` · ${translation.model}` : ''
                    ),
                    _.div({ class: 'at-translationText' },
                        _.span('Source'),
                        _.p(translation.source_text || '')
                    ),
                    _.div({ class: 'at-translationText' },
                        _.span('Translated'),
                        _.p(translation.translated_text || '')
                    ),
                    isDraft ? _.div({ class: 'at-reviewItem-actions' },
                        _.button({
                            type: 'button',
                            class: 'at-reviewItem-action is-apply',
                            disabled: !canResolve || blockTranslationActionStatus.value !== 'idle',
                            onclick: () => runPanelAction('approve_translation', {
                                context: `Translate · ${translation.target_locale || 'draft'}`,
                                preview: translation.translated_text || translation.source_text || '',
                            }, () => updateBlockTranslationStatus(block, translation, 'approved')),
                        }, isBusy ? 'Saving...' : 'Approve'),
                        _.button({
                            type: 'button',
                            class: 'at-reviewItem-action',
                            disabled: !canResolve || blockTranslationActionStatus.value !== 'idle',
                            onclick: () => runPanelAction('reject_translation', {
                                context: `Translate · ${translation.target_locale || 'draft'}`,
                                preview: translation.translated_text || translation.source_text || '',
                                primary: false,
                            }, () => updateBlockTranslationStatus(block, translation, 'rejected')),
                        }, isBusy ? 'Saving...' : 'Reject')
                    ) : null
                );
            }))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No translations yet'),
                _.p('Create a translation draft for the selected block version.')
            )
    );
}

function correctionPanel(block, keyBook) {
    if (!block) {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('AI correction'),
            _.p('Select a block to inspect corrections and prepare AI checks.')
        );
    }

    const status = blockReviewsStatus.value;

    if (status === 'loading') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('AI correction'),
            _.p('Loading corrections...')
        );
    }

    if (status === 'error') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('AI correction'),
            _.p(blockReviewsError.value || 'Unable to load corrections for this block.')
        );
    }

    const reviews = blockReviews.value;
    const isChecking = blockReviewActionStatus.value === 'checking';
    const reviewActionBusy = blockReviewActionStatus.value !== 'idle';
    const aiSummary = correctionAiSummary();

    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('AI correction'),
        _.div({ class: aiSummary.missingApiKey ? 'at-correctionProvider has-warning' : 'at-correctionProvider' },
            _.div({ class: 'at-correctionProvider-main' },
                _.span('Provider'),
                _.strong(`${aiSummary.providerName}${aiSummary.model ? ` · ${aiSummary.model}` : ''}`)
            ),
            aiSummary.missingApiKey ? _.button({
                type: 'button',
                class: 'at-correctionProvider-action',
                onclick: () => openToolAiSettingsDialog(keyBook, 'correction', 'Correct'),
            }, 'Configure AI settings') : null
        ),
        _.div({ class: 'at-rightWorkspace-actions is-top' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action is-primary',
                disabled: !block || block.dirty || reviewActionBusy,
                onclick: () => createBlockReview(block, 'grammar'),
            }, isChecking ? `Checking with ${aiSummary.providerName}...` : 'Check selected block'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: true,
            }, 'Suggest rewrite')
        ),
        reviews.length
            ? _.div({ class: 'at-reviewList' }, reviews.map((review) => {
                const isDraft = (review.status || 'draft') === 'draft';
                const canResolve = isDraft && review.is_current_version && !block.dirty;
                const isApplying = blockReviewActionStatus.value === `applying:${review.id}`;
                const isRejecting = blockReviewActionStatus.value === `rejecting:${review.id}`;
                const isBusy = blockReviewActionStatus.value !== 'idle';
                const reviewProvider = review.notes_json?.provider_name || review.notes_json?.provider_key || review.source || 'AI';
                const reviewModel = review.notes_json?.model || '';

                return _.div({
                    class: review.is_current_version ? 'at-reviewItem' : 'at-reviewItem is-stale',
                },
                    _.div({ class: 'at-reviewItem-head' },
                        _.strong(review.type || 'review'),
                        _.span({ class: 'at-reviewItem-provider' }, reviewModel ? `${reviewProvider} · ${reviewModel}` : reviewProvider),
                        _.span({ class: `at-reviewStatus status-${review.status}` }, review.status || 'draft')
                    ),
                    _.div({ class: 'at-reviewItem-version' }, review.version_number
                        ? `v${review.version_number}${review.is_current_version ? ' current' : ' stale'}`
                        : ''
                    ),
                    reviewDiff(review.original_text, review.suggested_text),
                    isDraft ? _.div({ class: 'at-reviewItem-actions' },
                        _.button({
                            type: 'button',
                            class: 'at-reviewItem-action is-apply',
                            disabled: !canResolve || isBusy,
                            onclick: () => runPanelAction('apply_review', {
                                context: `${review.type || 'Correction'} · v${review.version_number || ''}`,
                                preview: review.suggested_text || review.original_text || '',
                            }, () => applyBlockReview(block, review)),
                        }, isApplying ? 'Applying...' : 'Apply'),
                        _.button({
                            type: 'button',
                            class: 'at-reviewItem-action',
                            disabled: !canResolve || isBusy,
                            onclick: () => runPanelAction('reject_review', {
                                context: `${review.type || 'Correction'} · v${review.version_number || ''}`,
                                preview: review.original_text || review.suggested_text || '',
                                primary: false,
                            }, () => rejectBlockReview(block, review)),
                        }, isRejecting ? 'Rejecting...' : 'Reject')
                    ) : null
                );
            }))
            : _.div({ class: 'at-rightWorkspace-emptyState' },
                _.strong('No corrections yet'),
                _.p('Corrections will be linked to this block version before AI changes are applied.')
            )
    );
}

function aiSettingsPanel(keyBook, options = {}) {
    const serviceLocked = options.serviceLocked || false;
    const status = aiProviderStatus.value;
    const provider = selectedAiProvider();
    const models = selectedAiModelOptions();

    if (status === 'loading') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('AI providers'),
            _.p('Loading provider settings...')
        );
    }

    if (status === 'error') {
        return _.div({ class: 'at-rightWorkspace-section' },
            _.h3('AI providers'),
            _.p('Unable to load AI provider settings.'),
            _.div({ class: 'at-rightWorkspace-actions is-inline' },
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action is-primary',
                    onclick: () => loadAiProviders(keyBook, aiProviderSetting.value.service),
                }, 'Retry')
            )
        );
    }

    return _.div({ class: 'at-rightWorkspace-section' },
        _.div({ class: 'at-aiSettings-head' },
            _.h3('AI providers'),
            _.button({
                type: 'button',
                class: 'at-aiSettings-promptBtn',
                title: 'System prompt',
                onclick: () => openSystemPromptDialog(keyBook, aiProviderSetting.value.service),
            }, _.Icon ? _.Icon({ name: 'terminal', class: 'at-aiSettings-promptIcon' }) : 'Prompt')
        ),
        _.div({ class: 'at-aiSettings' },
            serviceLocked ? _.div({ class: 'at-aiSettings-providerCard' },
                _.span('Service'),
                _.strong(aiServices.value.find((service) => service.key === aiProviderSetting.value.service)?.label || options.serviceLabel || aiProviderSetting.value.service),
                _.small('This setting belongs only to this tool')
            ) : _.Select({
                label: 'Service',
                icon: 'apps',
                model: aiServiceModel,
                options: () => aiServices.value.map((service) => ({
                    label: service.label,
                    value: service.key,
                })),
                onChange: (value) => {
                    const nextService = selectChangeValue(value, aiProviderSetting.value.service);
                    if (!nextService || nextService === aiProviderSetting.value.service) return;

                    loadAiProviders(keyBook, nextService);
                },
            }),
            _.Select({
                label: 'Provider',
                icon: 'hub',
                model: aiProviderModel,
                options: () => aiProviders.value.filter((item) => item.is_selectable !== false).map((item) => ({
                    label: item.is_custom ? `${item.name} · Custom` : item.name,
                    value: item.provider_key,
                })),
                onChange: (value) => {
                    const nextProviderKey = selectChangeValue(value, aiProviderSetting.value.provider_key);
                    if (!nextProviderKey || nextProviderKey === aiProviderSetting.value.provider_key) return;

                    const nextProvider = aiProviders.value.find((item) => item.provider_key === nextProviderKey);
                    setAiProviderSetting({
                        ...aiProviderSetting.value,
                        provider_key: nextProviderKey,
                        model: nextProvider?.default_model || nextProvider?.models?.[0] || '',
                    });
                    aiProviderApiKey.value = '';
                },
            }),
            _.Select({
                label: 'Model',
                icon: 'memory',
                model: aiModelModel,
                options: () => models.map((model) => ({
                    label: model,
                    value: model,
                })),
                onChange: (value) => {
                    const nextModel = selectChangeValue(value, aiProviderSetting.value.model);
                    if (!nextModel || nextModel === aiProviderSetting.value.model) return;

                    setAiProviderSetting({
                        ...aiProviderSetting.value,
                        model: nextModel,
                    });
                },
            }),
            provider?.connection_mode !== 'managed' ? _.Input({
                label: provider?.has_api_key ? 'API key saved' : 'API key',
                icon: 'key',
                model: aiProviderApiKey,
                type: 'password',
                placeholder: provider?.has_api_key ? 'Leave empty to keep current key' : 'Paste provider API key',
                autocomplete: 'off',
            }) : null,
            _.div({ class: 'at-aiSettings-providerCard' },
                _.span('Hosting'),
                _.strong(provider?.base_url || 'Internal mock provider'),
                _.small(provider?.connection_mode === 'managed'
                    ? provider?.is_configured ? 'Managed by Audiobook Tools · no personal key required' : 'Managed provider coming soon'
                    : provider?.has_api_key ? 'Credential stored' : 'No credential stored'),
                _.small(provider?.connection_mode === 'managed'
                    ? (provider?.supports_background_jobs ? 'Background workflows supported' : 'Interactive workflow only')
                    : provider?.is_custom ? 'Custom provider' : 'Personal provider')
            ),
            _.div({ class: 'at-rightWorkspace-actions is-inline' },
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action is-primary',
                    disabled: savingAiSetting.value || !aiProviderSetting.value.provider_key || !aiProviderSetting.value.model || provider?.is_selectable === false,
                    onclick: () => saveAiProviderSetting(keyBook),
                }, savingAiSetting.value ? 'Saving...' : 'Save provider setting'),
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action',
                    onclick: () => openCustomProviderDialog(keyBook),
                }, 'Add custom provider')
            )
        )
    );
}

function rightWorkspaceBody(tool, block, keyBook) {
    const placeholders = {
        chat: {
            title: 'AI conversation',
            body: 'Chat will use the selected block, chapter, or full book as context.',
            actions: ['Ask about selected block', 'Summarize chapter'],
        },
        comments: {
            title: 'Editorial comments',
            body: 'Block comments and review notes will live here.',
            actions: ['Add comment', 'Resolve thread'],
        },
        correct: {
            title: 'AI correction',
            body: 'Grammar, style, continuity and readability corrections will be generated per block.',
            actions: ['Check selected block', 'Suggest rewrite'],
        },
        voices: {
            title: 'Characters and voices',
            body: 'Characters, narrator profiles and voice assignments will be managed here.',
            actions: ['Assign narrator', 'Create character'],
        },
        audio: {
            title: 'Audio production',
            body: 'Generate and inspect audio segments linked to block versions.',
            actions: ['Generate block audio', 'Open timeline'],
        },
        translate: {
            title: 'Translation',
            body: 'Translations will be tracked against the exact source block version.',
            actions: ['Translate block', 'Compare languages'],
        },
        versions: {
            title: 'Version history',
            body: 'Every manual edit, AI rewrite, correction and restore will be visible here.',
            actions: ['View changes', 'Restore version'],
        },
        activity: {
            title: 'Review queue',
            body: 'Book-wide editorial, correction, translation and audio work queue.',
            actions: ['Open next item', 'Refresh'],
        },
        settings: {
            title: 'Tool settings',
            body: 'Workspace preferences, provider options and book-level automation settings.',
            actions: ['Configure tools', 'Automation rules'],
        },
    };
    const content = placeholders[tool.id] || placeholders.chat;

    if (tool.id === 'activity') {
        runUntracked(() => loadBookActivity(keyBook));

        return _.div({ class: 'at-rightWorkspace-body is-activityReview' },
            blockContextSummary(block),
            activityPanel(keyBook)
        );
    }

    if (tool.id === 'versions') {
        loadBlockVersions(block);
        runUntracked(() => loadAiProviders(keyBook, 'versions'));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            versionsPanel(block, keyBook)
        );
    }

    if (tool.id === 'chat') {
        runUntracked(() => loadAiProviders(keyBook, 'chat'));
        runUntracked(() => loadAiChatMessages(block));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            aiChatPanel(block, keyBook)
        );
    }

    if (tool.id === 'comments') {
        runUntracked(() => loadBlockComments(block));
        runUntracked(() => loadBookCommentsQueue());

        return _.div({ class: 'at-rightWorkspace-body is-commentsReview' },
            blockContextSummary(block),
            commentsPanel(block)
        );
    }

    if (tool.id === 'voices') {
        runUntracked(() => loadVoiceProfiles(keyBook));
        runUntracked(() => loadBlockVoiceAssignment(block));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            voicesPanel(block, keyBook)
        );
    }

    if (tool.id === 'audio') {
        runUntracked(() => loadAiProviders(keyBook, 'audio'));
        runUntracked(() => loadBlockVoiceAssignment(block));
        runUntracked(() => loadBlockAudio(block));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            audioPanel(block, keyBook)
        );
    }

    if (tool.id === 'translate') {
        runUntracked(() => loadAiProviders(keyBook, 'translate'));
        runUntracked(() => loadBlockTranslations(block));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            translatePanel(block, keyBook)
        );
    }

    if (tool.id === 'correct') {
        loadBlockReviews(block);

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            correctionPanel(block, keyBook)
        );
    }

    if (tool.id === 'settings') {
        runUntracked(() => loadAiProviders(keyBook, aiProviderSetting.value.service));

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            aiSettingsPanel(keyBook)
        );
    }

    return _.div({ class: 'at-rightWorkspace-body' },
        blockContextSummary(block),
        _.div({ class: 'at-rightWorkspace-section' },
            _.h3(content.title),
            _.p(content.body),
            _.div({ class: 'at-rightWorkspace-actions' },
                content.actions.map((action) => _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action',
                    disabled: true,
                }, action))
            )
        )
    );
}

function rightWorkspace(keyBook) {
    return _.div({ class: () => !commandView.value ? 'at-navCommand cms-d-none' : 'at-navCommand', area: 'navCommand' },
        _.div({ class: 'at-rightWorkspace' },
            _.div({ class: 'at-rightWorkspace-rail' },
                rightWorkspaceTools.map((tool) => _.Button({
                    icon: tool.icon,
                    class: () => rightWorkspaceTool.value === tool.id
                        ? 'at-rightWorkspace-railBtn is-active'
                        : 'at-rightWorkspace-railBtn',
                    onclick: () => setRightWorkspaceTool(tool.id),
                    title: tool.label,
                }))
            ),
            _.div({ class: 'at-rightWorkspace-panel' }, () => {
                const tool = rightWorkspaceTools.find((item) => item.id === rightWorkspaceTool.value) || rightWorkspaceTools[0];
                const block = activeOutlineItem();

                return [
                    rightWorkspaceHeader(tool, block, keyBook),
                    rightWorkspaceBody(tool, block, keyBook),
                ];
            })
        )
    );
}

function editorText(keyBook) {
    let editor = null;
    let currentEditorBlocks = [];
    let autosaveTimer = null;
    let saveInFlight = false;
    let pendingSave = false;
    let autosaveBlocked = false;
    let isApplyingRemoteContent = false;
    let inlineCommentMarkerFrame = null;
    const blockMeta = new Map();

    const editorMount = _.div({
        class: () => `at-tiptap-editor page-${editorPageFormat.value}`,
        role: 'textbox',
        'aria-label': 'Book content editor',
    });

    const clearInlineCommentMarkers = () => {
        editorMount.querySelectorAll('[data-comment-marker="1"]').forEach((element) => {
            element.classList.remove(
                'has-editor-comments',
                'comment-state-open',
                'comment-state-stale',
                'comment-state-resolved'
            );
            delete element.dataset.commentMarker;
            delete element.dataset.commentCount;
            element.removeAttribute('title');
        });
    };

    const clearActiveActivityMarker = () => {
        editorMount.querySelectorAll('[data-activity-marker="1"]').forEach((element) => {
            element.classList.remove('has-active-activity');
            delete element.dataset.activityMarker;
        });
    };

    const activeBookActivityItem = () => {
        const activeId = activeBookActivityItemId.value;
        if (!activeId) return null;

        return (bookActivityItems.value || []).find((item) => item.id === activeId) || null;
    };

    const refreshActiveActivityMarker = () => {
        clearActiveActivityMarker();

        if (!editor?.view?.dom) return;

        const activeItem = activeBookActivityItem();
        if (!activeItem?.block_uuid) return;

        const blockElement = editor.view.dom.querySelector(`[data-block-id="${cssSelectorEscape(activeItem.block_uuid)}"]`);
        if (!blockElement) return;

        blockElement.classList.add('has-active-activity');
        blockElement.dataset.activityMarker = '1';
    };

    const refreshCurrentInlineCommentMarkers = () => {
        clearInlineCommentMarkers();

        if (!editor?.view?.dom) return;

        const markerBlockUuids = new Set([
            ...Object.keys(blockCommentSummaries.value),
            blockCommentContextBlockUuid(),
        ].filter(Boolean));

        markerBlockUuids.forEach((blockUuid) => {
            const marker = commentMarkerStateForBlock(blockUuid);
            if (!marker) return;

            const blockElement = editor.view.dom.querySelector(`[data-block-id="${cssSelectorEscape(blockUuid)}"]`);
            if (!blockElement) return;

            blockElement.classList.add('has-editor-comments', `comment-state-${marker.state}`);
            blockElement.dataset.commentMarker = '1';
            blockElement.dataset.commentCount = String(marker.count);
            blockElement.title = marker.title;
        });
    };

    refreshInlineCommentMarkers = refreshCurrentInlineCommentMarkers;

    const scheduleInlineCommentMarkerRefresh = () => {
        if (inlineCommentMarkerFrame !== null) return;

        inlineCommentMarkerFrame = requestAnimationFrame(() => {
            inlineCommentMarkerFrame = null;
            refreshCurrentInlineCommentMarkers();
        });
    };

    const handleInlineCommentMarkerClick = (event) => {
        const anchorElement = event.target?.closest?.('[data-comment-anchor-id]');
        if (anchorElement && editorMount.contains(anchorElement)) {
            const commentId = Number(anchorElement.dataset.commentAnchorId || 0);
            const comment = blockComments.value.find((item) => Number(item.id) === commentId);
            if (!comment) return;

            const blockUuid = comment.block_uuid || commentAnchor(comment)?.block_uuid;
            const block = blockMeta.get(blockUuid) || currentEditorBlocks.find((item) => item.block_uuid === blockUuid);
            if (!block) return;

            event.preventDefault();
            activeBlockCommentId.value = comment.id;
            setRightWorkspaceTool('comments');
            focusEditorBlock(blockUuid);
            loadBlockComments(block);

            requestAnimationFrame(() => {
                document
                    .querySelector(`[data-comment-item-id="${cssSelectorEscape(comment.id)}"]`)
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
            return;
        }

        const markerElement = event.target?.closest?.('[data-comment-marker="1"]');
        if (!markerElement || !editorMount.contains(markerElement)) return;

        const blockUuid = markerElement.dataset.blockId;
        const block = blockMeta.get(blockUuid) || currentEditorBlocks.find((item) => item.block_uuid === blockUuid);
        if (!block) return;

        event.preventDefault();
        setRightWorkspaceTool('comments');
        focusEditorBlock(blockUuid);
        loadBlockComments(block);
    };

    editorMount.addEventListener('click', handleInlineCommentMarkerClick);

    const refreshEditorUi = () => {
        editorUiTick.value += 1;
    };

    const isActive = (name, attrs = null) => {
        editorUiTick.value;
        return editor ? editor.isActive(name, attrs || undefined) : false;
    };

    const runCommand = (command) => {
        if (!editor) return;
        command(editor.chain().focus()).run();
        refreshEditorUi();
    };

    const toolbarButton = ({ icon, title, active, action }) => {
        return _.Button({
            icon,
            title,
            class: () => active?.() ? 'at-editorToolbar-btn is-active' : 'at-editorToolbar-btn',
            disabled: () => !editorReady.value,
            onclick: () => runCommand(action),
        });
    };

    const toolbarDivider = () => _.span({
        class: 'at-editorToolbar-divider',
        'aria-hidden': 'true',
    });

    const pageFormatSelect = () => _.label({ class: 'at-pageFormatSelect' },
        _.span({ class: 'at-pageFormatSelect-label' }, 'Page'),
        _.select({
            value: editorPageFormat.value,
            title: 'Page preview',
            onchange: (event) => setEditorPageFormat(event.target.value),
        },
            pageFormatOptions.map((option) => _.option({
                value: option.value,
                selected: () => editorPageFormat.value === option.value,
            }, option.label))
        )
    );

    const setSceneBreak = (chain) => chain.setHorizontalRule();

    const clearFormatting = (chain) => chain.unsetAllMarks().clearNodes();

    const writerToolbar = () => [
        pageFormatSelect(),
        toolbarDivider(),
        toolbarButton({
            icon: 'undo',
            title: 'Undo',
            action: (chain) => chain.undo(),
        }),
        toolbarButton({
            icon: 'redo',
            title: 'Redo',
            action: (chain) => chain.redo(),
        }),
        toolbarDivider(),
        toolbarButton({
            icon: 'article',
            title: 'Paragraph',
            active: () => isActive('paragraph'),
            action: (chain) => chain.setParagraph(),
        }),
        toolbarButton({
            icon: 'title',
            title: 'Chapter title',
            active: () => isActive('heading', { level: 2 }),
            action: (chain) => chain.toggleHeading({ level: 2 }),
        }),
        toolbarButton({
            icon: 'format_quote',
            title: 'Quote',
            active: () => isActive('blockquote'),
            action: (chain) => chain.toggleBlockquote(),
        }),
        toolbarDivider(),
        toolbarButton({
            icon: 'format_bold',
            title: 'Bold',
            active: () => isActive('bold'),
            action: (chain) => chain.toggleBold(),
        }),
        toolbarButton({
            icon: 'format_italic',
            title: 'Italic',
            active: () => isActive('italic'),
            action: (chain) => chain.toggleItalic(),
        }),
        toolbarButton({
            icon: 'format_clear',
            title: 'Clear formatting',
            action: clearFormatting,
        }),
        toolbarDivider(),
        toolbarButton({
            icon: 'format_list_bulleted',
            title: 'Bullet list',
            active: () => isActive('bulletList'),
            action: (chain) => chain.toggleBulletList(),
        }),
        toolbarButton({
            icon: 'format_list_numbered',
            title: 'Ordered list',
            active: () => isActive('orderedList'),
            action: (chain) => chain.toggleOrderedList(),
        }),
        toolbarButton({
            icon: 'horizontal_rule',
            title: 'Scene break',
            action: setSceneBreak,
        }),
    ];

    const syncEditorBlocks = () => {
        if (!editor) return;
        currentEditorBlocks = extractEditorBlocks(editor.getJSON(), blockMeta);
        editorOutline.value = buildEditorOutline(currentEditorBlocks, blockMeta);
    };

    const updateActiveBlock = () => {
        if (!editor) return;

        const selection = editor.state.selection;
        let blockId = null;

        for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
            const node = selection.$from.node(depth);
            if (!isTrackableNode(node) || !node.attrs?.blockId) continue;

            blockId = node.attrs.blockId;
            break;
        }

        activeEditorBlockId.value = blockId;
    };

    const findTrackableSelectionBlock = () => {
        if (!editor) return null;

        const { selection } = editor.state;
        const findDepth = ($pos) => {
            for (let depth = $pos.depth; depth > 0; depth -= 1) {
                const node = $pos.node(depth);
                if (!isTrackableNode(node) || !node.attrs?.blockId) continue;

                return { depth, node, blockUuid: node.attrs.blockId, pos: $pos.before(depth) };
            }

            return null;
        };

        const fromBlock = findDepth(selection.$from);
        const toBlock = findDepth(selection.$to);
        if (!fromBlock || !toBlock || fromBlock.blockUuid !== toBlock.blockUuid) return null;

        return fromBlock;
    };

    const updateCommentSelectionAnchor = () => {
        if (!editor) {
            blockCommentSelectionAnchor.value = null;
            return;
        }

        const { selection, doc } = editor.state;
        if (selection.empty) {
            blockCommentSelectionAnchor.value = null;
            return;
        }

        const selectionBlock = findTrackableSelectionBlock();
        if (!selectionBlock) {
            blockCommentSelectionAnchor.value = null;
            return;
        }

        const selectedText = doc.textBetween(selection.from, selection.to, ' ').replace(/\s+/g, ' ').trim();
        if (!selectedText) {
            blockCommentSelectionAnchor.value = null;
            return;
        }

        const blockTextBefore = doc.textBetween(selectionBlock.pos + 1, selection.from, ' ');
        const offsetStart = blockTextBefore.length;

        blockCommentSelectionAnchor.value = {
            type: 'text-selection',
            block_uuid: selectionBlock.blockUuid,
            offset_start: offsetStart,
            offset_end: offsetStart + selectedText.length,
            text: selectedText,
        };
    };

    const textOffsetToDocPosition = (node, blockPos, targetOffset) => {
        let textOffset = 0;
        let docPosition = null;

        node.descendants((child, childPos) => {
            if (!child.isText) return true;

            const textLength = child.text?.length || 0;
            const nextOffset = textOffset + textLength;
            if (targetOffset <= nextOffset) {
                docPosition = blockPos + childPos + 1 + Math.max(0, targetOffset - textOffset);
                return false;
            }

            textOffset = nextOffset;
            return true;
        });

        return docPosition;
    };

    const resolveCommentAnchorRange = (comment, node, blockPos) => {
        const anchor = commentAnchor(comment);
        if (!anchor?.text) return null;

        let offsetStart = Number(anchor.offset_start || 0);
        let offsetEnd = Number(anchor.offset_end || 0);
        let reanchored = false;

        if (!comment.is_current_version) {
            const blockText = node.textBetween(0, node.content.size, ' ');
            const match = findApproximateTextMatch(blockText, anchor.text, offsetStart);
            if (!match) return null;

            offsetStart = match.start;
            offsetEnd = match.end;
            reanchored = true;
        }

        const from = textOffsetToDocPosition(node, blockPos, offsetStart);
        const to = textOffsetToDocPosition(node, blockPos, offsetEnd);
        if (from === null || to === null || to <= from) return null;

        return {
            from,
            to,
            reanchored,
            offset_start: offsetStart,
            offset_end: offsetEnd,
        };
    };

    const buildCommentAnchorDecorations = () => {
        if (!editor) return DecorationSet.empty;

        const decorations = [];
        const resolutions = {};
        const comments = blockComments.value || [];
        const doc = editor.state.doc;

        doc.descendants((node, pos) => {
            if (!isTrackableNode(node) || !node.attrs?.blockId) return true;

            comments
                .filter((comment) => commentAnchor(comment)?.block_uuid === node.attrs.blockId)
                .forEach((comment) => {
                    const anchor = commentAnchor(comment);
                    const range = resolveCommentAnchorRange(comment, node, pos);
                    if (!range) return;

                    resolutions[comment.id] = {
                        state: range.reanchored ? 'reanchored' : 'current',
                        block_uuid: node.attrs.blockId,
                        offset_start: range.offset_start,
                        offset_end: range.offset_end,
                        text: doc.textBetween(range.from, range.to, ' ').replace(/\s+/g, ' ').trim() || anchor.text,
                    };

                    const classes = ['at-commentAnchorHighlight'];
                    if ((comment.status || 'open') !== 'open') classes.push('is-resolved');
                    if (!comment.is_current_version) classes.push('is-reanchored');

                    decorations.push(Decoration.inline(range.from, range.to, {
                        class: classes.join(' '),
                        'data-comment-anchor-id': String(comment.id),
                        title: range.reanchored
                            ? `Reanchored: ${anchorSnippet(anchor)}`
                            : anchorSnippet(anchor),
                    }));
                });

            return true;
        });

        return {
            decorations: DecorationSet.create(doc, decorations),
            resolutions,
        };
    };

    const refreshCommentAnchorDecorations = () => {
        if (!editor) return;

        const { decorations, resolutions } = buildCommentAnchorDecorations();
        blockCommentAnchorResolutions.value = resolutions;
        editor.view.dispatch(editor.state.tr.setMeta(commentAnchorPluginKey, decorations));
    };

    const textContent = (text) => text
        ? [{ type: 'text', text }]
        : [];

    const nodeWithSuggestedText = (node, suggestedText) => {
        if (node.type === 'blockquote') {
            return {
                ...node,
                content: [
                    {
                        type: 'paragraph',
                        content: textContent(suggestedText),
                    },
                ],
            };
        }

        if (node.type === 'horizontalRule') return node;

        return {
            ...node,
            content: textContent(suggestedText),
        };
    };

    const updateEditorBlockText = (blockUuid, suggestedText) => {
        if (!editor || !blockUuid) return false;

        let replaced = false;
        const document = editor.getJSON();
        const content = (document.content || []).map((node) => {
            if (!isTrackableNode(node) || node.attrs?.blockId !== blockUuid) return node;

            replaced = true;
            return nodeWithSuggestedText(node, suggestedText || '');
        });

        if (!replaced) return false;

        editor.commands.setContent({
            ...document,
            content,
        }, {
            emitUpdate: true,
            errorOnInvalidContent: true,
        });

        focusEditorBlock(blockUuid);
        return true;
    };

    focusEditorBlock = (blockUuid) => {
        if (!editor || !blockUuid) return;

        let targetPos = null;

        editor.state.doc.descendants((node, pos) => {
            if (!isTrackableNode(node) || node.attrs?.blockId !== blockUuid) return true;

            targetPos = pos;
            return false;
        });

        if (targetPos === null) return;

        editor.chain().focus(targetPos + 1).run();

        const blockElement = editor.view.dom.querySelector(`[data-block-id="${cssSelectorEscape(blockUuid)}"]`);
        blockElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });

        activeEditorBlockId.value = blockUuid;
        refreshActiveActivityMarker();
        refreshEditorUi();
    };

    const updateBlockMetaFromSaved = (savedBlocks, localBlocks = currentEditorBlocks) => {
        (savedBlocks || []).forEach((block) => {
            const localBlock = localBlocks.find((item) => item.block_uuid === block.block_uuid) || block;

            blockMeta.set(block.block_uuid, {
                ...block,
                signature: blockSignature(localBlock),
            });
        });
    };

    const dirtyBlocks = () => {
        return currentEditorBlocks.filter((block) => {
            const meta = blockMeta.get(block.block_uuid);

            return !meta || meta.signature !== blockSignature(block);
        });
    };

    const deletedBlockUuids = () => {
        const currentIds = new Set(currentEditorBlocks.map((block) => block.block_uuid));

        return Array.from(blockMeta.values())
            .filter((block) => block.status !== 'deleted' && !currentIds.has(block.block_uuid))
            .map((block) => block.block_uuid);
    };

    const setSaveStatus = (status) => {
        saveStatus.value = status;
    };

    const applyAiProviderPayload = (payload, service) => {
        const data = normalizeDataPayload(payload);

        aiProviders.value = data.providers || [];
        aiServices.value = data.services || [];
        setAiProviderSetting({
            service,
            provider_key: data.setting?.provider_key || 'mock',
            model: data.setting?.model || 'mock-correction-v1',
            system_prompt: data.setting?.system_prompt || '',
        });
        aiServiceSettings.value = {
            ...aiServiceSettings.value,
            [service]: aiProviderSetting.value,
        };
        aiProviderStatus.value = 'ready';
    };

    loadAiProviders = (bookKey = keyBook, service = 'correction', { force = false } = {}) => {
        const contextKey = `${bookKey || 'global'}:${service}`;
        if (!force && aiProviderContextKey.value === contextKey && aiProviderStatus.value === 'loading') return;
        if (!force && aiProviderContextKey.value === contextKey && aiProviderStatus.value !== 'error') return;

        aiProviderContextKey.value = contextKey;
        aiProviderStatus.value = 'loading';

        const params = new URLSearchParams({
            service,
        });

        if (bookKey) params.set('key_book', bookKey);

        return _.http.getJSON(`/dashboard/api/ai/providers?${params.toString()}`)
            .then((payload) => applyAiProviderPayload(payload, service))
            .catch(() => {
                aiProviders.value = [];
                aiProviderStatus.value = 'error';
            });
    };

    saveAiProviderSetting = async (bookKey = keyBook) => {
        if (savingAiSetting.value) return;

        savingAiSetting.value = true;

        try {
            const payload = await _.http.patchJSON('/dashboard/api/ai/settings', {
                service: aiProviderSetting.value.service,
                key_book: bookKey,
                provider_key: aiProviderSetting.value.provider_key,
                model: aiProviderSetting.value.model,
                api_key: aiProviderApiKey.value.trim() || null,
                system_prompt: aiProviderSystemPrompt.value.trim(),
            });
            const data = normalizeDataPayload(payload);

            if (data.setting) {
                setAiProviderSetting(data.setting);
                aiServiceSettings.value = {
                    ...aiServiceSettings.value,
                    [data.setting.service]: data.setting,
                };
            }

            aiProviderApiKey.value = '';
            loadAiProviders(bookKey, aiProviderSetting.value.service, { force: true });
        } finally {
            savingAiSetting.value = false;
        }
    };

    const customProviderForm = (bookKey, close) => _.form({
        action: '#',
        method: 'post',
        onSubmit: async (event) => {
            event.preventDefault();

            const models = customProviderModels.value
                .split(/[\n,]/)
                .map((model) => model.trim())
                .filter(Boolean);

            if (!customProviderName.value.trim() || !models.length) {
                customProviderStatus.value = {
                    type: 'warning',
                    title: 'Missing provider data',
                    message: 'Add a provider name and at least one model.',
                };
                return;
            }

            savingAiProvider.value = true;
            customProviderStatus.value = null;

            try {
                const payload = await _.http.postJSON('/dashboard/api/ai/providers', {
                    name: customProviderName.value.trim(),
                    base_url: customProviderBaseUrl.value.trim() || null,
                    models,
                    default_model: models[0],
                    api_key: customProviderApiKey.value.trim() || null,
                });
                const data = normalizeDataPayload(payload);

                await loadAiProviders(bookKey, aiProviderSetting.value.service, { force: true });

                if (data.provider) {
                    setAiProviderSetting({
                        ...aiProviderSetting.value,
                        provider_key: data.provider.provider_key,
                        model: data.provider.default_model || data.provider.models?.[0] || '',
                    });
                }

                close();
            } catch (error) {
                customProviderStatus.value = {
                    type: 'danger',
                    title: 'Provider not saved',
                    message: error.message || 'Unable to save custom provider.',
                };
            } finally {
                savingAiProvider.value = false;
            }
        },
    },
        _.Row({ gap: 'md' },
            _.Input({
                class: 'cms-col-24',
                label: 'Provider name',
                icon: 'badge',
                model: customProviderName,
            }),
            _.Input({
                class: 'cms-col-24',
                label: 'Hosting / base URL',
                icon: 'dns',
                model: customProviderBaseUrl,
            }),
            _.Textarea({
                class: 'cms-col-24',
                label: 'Models',
                icon: 'memory',
                rows: 5,
                model: customProviderModels,
            }),
            _.Input({
                class: 'cms-col-24',
                label: 'API key',
                icon: 'key',
                type: 'password',
                model: customProviderApiKey,
            }),
            _.div({ class: 'cms-col-24' }, () => customProviderStatus.value
                ? _.Alert(customProviderStatus.value)
                : null),
            _.div({ class: 'cms-col-24', align: 'right' },
                _.Btn({ type: 'button', class: 'cms-m-r-sm', color: 'secondary', onClick: close }, 'Close'),
                _.Btn({ type: 'submit', color: 'primary', loading: savingAiProvider }, 'Add provider')
            )
        )
    );

    openCustomProviderDialog = (bookKey = keyBook) => {
        customProviderName.value = '';
        customProviderBaseUrl.value = '';
        customProviderModels.value = '';
        customProviderApiKey.value = '';
        customProviderStatus.value = null;

        _.Dialog({
            size: 'lg',
            stickyActions: true,
            slots: {
                header: _.div(
                    _.h3('Add custom AI provider'),
                    _.span({ class: 'text-muted' }, 'Configure hosting and model names for a provider used by editor tools.'),
                ),
                content: ({ close }) => customProviderForm(bookKey, close),
            },
        }).open();
    };

    openSystemPromptDialog = (bookKey = keyBook, service = 'correction') => {
        loadAiProviders(bookKey, service);

        _.Dialog({
            size: 'lg',
            stickyActions: true,
            slots: {
                header: _.div(
                    _.h3('System prompt'),
                    _.span({ class: 'text-muted' }, 'Instruction used by this AI tool before the selected book content.'),
                ),
                content: ({ close }) => _.div({ class: 'at-systemPromptDialog' },
                    _.Textarea({
                        label: 'Prompt',
                        icon: 'terminal',
                        rows: 10,
                        model: aiProviderSystemPrompt,
                    }),
                    _.div({ class: 'at-systemPromptActions' },
                        _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Close'),
                        _.Btn({
                            type: 'button',
                            color: 'primary',
                            loading: savingAiSetting,
                            onClick: async () => {
                                await saveAiProviderSetting(bookKey);
                                close();
                            },
                        }, 'Save prompt')
                    )
                ),
            },
        }).open();
    };

    openToolAiSettingsDialog = (bookKey = keyBook, service = 'correction', label = 'Tool') => {
        aiProviderApiKey.value = '';
        loadAiProviders(bookKey, service, { force: true });

        _.Dialog({
            size: 'lg',
            stickyActions: true,
            slots: {
                header: _.div(
                    _.h3(`${label} AI settings`),
                    _.span({ class: 'text-muted' }, 'Provider, model and credential used only by this tool.'),
                ),
                content: () => _.div({ class: 'at-aiSettingsDialog' }, () => (
                    aiSettingsPanel(bookKey, {
                        serviceLocked: true,
                        serviceLabel: label,
                    })
                )),
            },
        }).open();
    };

    loadBlockVersions = (block) => {
        if (!keyBook || !block?.block_uuid) {
            blockVersions.value = [];
            blockVersionsStatus.value = 'idle';
            blockVersionsContextKey.value = null;
            blockVersionsError.value = null;
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (blockVersionsContextKey.value === contextKey && blockVersionsStatus.value !== 'error') return;

        blockVersionsContextKey.value = contextKey;
        blockVersions.value = [];
        blockVersionsError.value = null;

        if (!block.current_version_id) {
            blockVersionsStatus.value = 'ready';
            return;
        }

        blockVersionsStatus.value = 'loading';

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/versions`)
            .then((payload) => {
                if (blockVersionsContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                blockVersions.value = data.versions || [];
                blockVersionsStatus.value = 'ready';
            })
            .catch((error) => {
                if (blockVersionsContextKey.value !== contextKey) return;

                const statusCode = error?.response?.status || error?.status;
                if (statusCode === 404) {
                    blockVersions.value = [];
                    blockVersionsStatus.value = 'ready';
                    blockVersionsError.value = null;
                    return;
                }

                blockVersions.value = [];
                blockVersionsStatus.value = 'error';
                blockVersionsError.value = 'Unable to load versions for this block.';
            });
    };

    explainBlockVersion = async (block, version, compareVersion = null) => {
        if (!keyBook || !block?.block_uuid || !version?.id) return;
        if (blockVersionActionStatus.value !== 'idle') return;

        const aiSummary = versionsAiSummary();
        if (aiSummary.missingApiKey) {
            blockVersionsError.value = 'Configure the Versions AI provider before explaining changes.';
            return;
        }

        blockVersionActionStatus.value = `explaining:${version.id}`;
        blockVersionsError.value = null;

        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/versions/explain`, {
                version_id: version.id,
                compare_version_id: compareVersion?.id || null,
                provider_key: aiSummary.setting.provider_key,
                model: aiSummary.model,
            });
            const data = normalizeDataPayload(payload);

            blockVersions.value = blockVersions.value.map((item) => item.id === version.id
                ? {
                    ...item,
                    explanation: data.explanation || item.explanation || null,
                    activity: {
                        ...(item.activity || {}),
                        ai_chats: ((item.activity || {}).ai_chats || 0) + 1,
                    },
                    has_activity: true,
                }
                : item);
            blockVersionsContextKey.value = null;
            loadBlockVersions(block);
        } catch (error) {
            blockVersionsError.value = requestErrorMessage(error, 'Unable to explain version changes.');
        } finally {
            blockVersionActionStatus.value = 'idle';
            refreshEditorUi();
        }
    };

    restoreBlockVersion = async (block, version) => {
        if (!keyBook || !block?.block_uuid || !version?.id) return;
        if (version.is_current || blockVersionActionStatus.value !== 'idle') return;

        blockVersionActionStatus.value = `restoring:${version.id}`;

        try {
            clearTimeout(autosaveTimer);
            const saved = await saveDirtyBlocks();
            if (!saved) throw new Error('Unable to save pending changes before restore.');

            const payload = await _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/versions/restore`, {
                version_id: version.id,
            });
            const data = normalizeDataPayload(payload);
            const restoredBlock = data.block || {
                ...block,
                current_version_id: data.version?.id || block.current_version_id,
            };

            await applyRemoteContent();
            blockVersionsContextKey.value = null;
            loadBlockVersions(restoredBlock);
            setSaveStatus('saved');
        } catch {
            blockVersionsStatus.value = 'error';
            setSaveStatus('error');
        } finally {
            blockVersionActionStatus.value = 'idle';
            refreshEditorUi();
        }
    };

    loadBlockReviews = (block) => {
        if (!keyBook || !block?.block_uuid) {
            blockReviews.value = [];
            blockReviewsStatus.value = 'idle';
            blockReviewsContextKey.value = null;
            blockReviewsError.value = null;
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (blockReviewsContextKey.value === contextKey && blockReviewsStatus.value !== 'error') return;

        blockReviewsContextKey.value = contextKey;
        blockReviews.value = [];
        blockReviewsError.value = null;

        if (!block.current_version_id) {
            blockReviewsStatus.value = 'ready';
            return;
        }

        blockReviewsStatus.value = 'loading';

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/reviews`)
            .then((payload) => {
                if (blockReviewsContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                blockReviews.value = data.reviews || [];
                blockReviewsError.value = null;
                blockReviewsStatus.value = 'ready';
            })
            .catch((error) => {
                if (blockReviewsContextKey.value !== contextKey) return;

                const statusCode = error?.response?.status || error?.status;
                if (statusCode === 404) {
                    blockReviews.value = [];
                    blockReviewsError.value = null;
                    blockReviewsStatus.value = 'ready';
                    return;
                }

                blockReviews.value = [];
                blockReviewsError.value = requestErrorMessage(error, 'Unable to load corrections for this block.');
                blockReviewsStatus.value = 'error';
            });
    };

    const upsertReviewInList = (review) => {
        if (!review) return;

        blockReviews.value = [
            review,
            ...blockReviews.value.filter((item) => item.id !== review.id),
        ];
        blockReviewsError.value = null;
        blockReviewsStatus.value = 'ready';
    };

    const patchBlockReview = async (block, review, payload) => {
        const response = await _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/reviews/${review.id}`, payload);
        const data = normalizeDataPayload(response);

        if (data.review) {
            upsertReviewInList(data.review);
        } else {
            loadBlockReviews(block);
        }
    };

    const setBlockCommentSummary = (blockUuid, summary) => {
        if (!blockUuid) return;

        const normalizedSummary = normalizeBlockCommentSummary(summary);
        const nextSummaries = { ...blockCommentSummaries.value };

        if (normalizedSummary.all) {
            nextSummaries[blockUuid] = normalizedSummary;
        } else {
            delete nextSummaries[blockUuid];
        }

        blockCommentSummaries.value = nextSummaries;
        scheduleInlineCommentMarkerRefresh();
    };

    const setBlockCommentSummaryFromComments = (blockUuid, comments) => {
        setBlockCommentSummary(blockUuid, summarizeBlockComments(comments));
    };

    const loadBlockCommentSummaries = () => {
        if (!keyBook) {
            blockCommentSummaries.value = {};
            scheduleInlineCommentMarkerRefresh();
            return;
        }

        _.http.getJSON(`/dashboard/api/books/${keyBook}/comments/summary`)
            .then((payload) => {
                const data = normalizeDataPayload(payload);
                const summaries = {};

                (data.summaries || []).forEach((summary) => {
                    if (!summary.block_uuid) return;

                    const normalizedSummary = normalizeBlockCommentSummary(summary);
                    if (normalizedSummary.all) {
                        summaries[summary.block_uuid] = normalizedSummary;
                    }
                });

                blockCommentSummaries.value = summaries;
                scheduleInlineCommentMarkerRefresh();
            })
            .catch(() => {
                blockCommentSummaries.value = {};
                scheduleInlineCommentMarkerRefresh();
            });
    };

    loadBookActivity = (bookKey = keyBook, { force = false } = {}) => {
        if (!bookKey) {
            bookActivityItems.value = [];
            bookActivitySummary.value = { all: 0, action: 0, review: 0, stale: 0 };
            bookActivityStatus.value = 'idle';
            bookActivityContextKey.value = null;
            bookActivityError.value = null;
            activeBookActivityItemId.value = null;
            return;
        }

        const contextKey = `${bookKey}:activity`;
        if (!force && bookActivityContextKey.value === contextKey && bookActivityStatus.value !== 'error') return;

        bookActivityContextKey.value = contextKey;
        bookActivityStatus.value = 'loading';
        bookActivityError.value = null;

        _.http.getJSON(`/dashboard/api/books/${bookKey}/activity?limit=200`)
            .then((payload) => {
                if (bookActivityContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                bookActivityItems.value = data.items || [];
                if (activeBookActivityItemId.value && !bookActivityItems.value.some((item) => item.id === activeBookActivityItemId.value)) {
                    activeBookActivityItemId.value = null;
                }
                refreshActiveActivityMarker();
                bookActivitySummary.value = {
                    all: Number(data.summary?.all || 0),
                    action: Number(data.summary?.action || 0),
                    review: Number(data.summary?.review || 0),
                    stale: Number(data.summary?.stale || 0),
                };
                bookActivityStatus.value = 'ready';
            })
            .catch((error) => {
                if (bookActivityContextKey.value !== contextKey) return;

                bookActivityItems.value = [];
                bookActivitySummary.value = { all: 0, action: 0, review: 0, stale: 0 };
                activeBookActivityItemId.value = null;
                refreshActiveActivityMarker();
                bookActivityError.value = requestErrorMessage(error, 'Unable to load book activity.');
                bookActivityStatus.value = 'error';
            });
    };

    navigateBookActivityItem = (direction = 1) => {
        const items = visibleBookActivityItems();
        if (!items.length) return;

        const currentIndex = items.findIndex((item) => item.id === activeBookActivityItemId.value);
        const fallbackIndex = direction > 0 ? -1 : 0;
        const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction;
        const normalizedIndex = (nextIndex + items.length) % items.length;
        const nextItem = items[normalizedIndex];

        openBookActivityItem(nextItem, { openTool: false, preserveScroll: false });

        requestAnimationFrame(() => {
            document
                .querySelector(`[data-activity-item-id="${cssSelectorEscape(nextItem.id)}"]`)
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    };

    loadBookCommentsQueue = ({ force = false } = {}) => {
        if (!keyBook) {
            bookCommentsQueue.value = [];
            bookCommentsQueueStatus.value = 'idle';
            bookCommentsQueueContextKey.value = null;
            bookCommentsQueueError.value = null;
            return;
        }

        const contextKey = `${keyBook}:comments`;
        if (!force && bookCommentsQueueContextKey.value === contextKey && bookCommentsQueueStatus.value !== 'error') return;

        bookCommentsQueueContextKey.value = contextKey;
        bookCommentsQueueStatus.value = 'loading';
        bookCommentsQueueError.value = null;

        _.http.getJSON(`/dashboard/api/books/${keyBook}/comments?limit=200`)
            .then((payload) => {
                if (bookCommentsQueueContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                bookCommentsQueue.value = data.comments || [];
                bookCommentsQueueStatus.value = 'ready';
            })
            .catch((error) => {
                if (bookCommentsQueueContextKey.value !== contextKey) return;

                bookCommentsQueue.value = [];
                bookCommentsQueueError.value = requestErrorMessage(error, 'Unable to load book comment queue.');
                bookCommentsQueueStatus.value = 'error';
            });
    };

    loadBlockComments = (block, { force = false } = {}) => {
        if (!keyBook) {
            blockComments.value = [];
            bookCommentsQueue.value = [];
            bookCommentsQueueStatus.value = 'idle';
            bookCommentsQueueContextKey.value = null;
            bookCommentsQueueError.value = null;
            blockCommentsStatus.value = 'idle';
            blockCommentsContextKey.value = null;
            blockCommentsError.value = null;
            blockCommentSummaries.value = {};
            blockCommentSelectionAnchor.value = null;
            blockCommentAnchorResolutions.value = {};
            activeBlockCommentId.value = null;
            refreshCommentAnchorDecorations();
            scheduleInlineCommentMarkerRefresh();
            return;
        }

        if (!block?.block_uuid) {
            blockComments.value = [];
            blockCommentsStatus.value = 'idle';
            blockCommentsContextKey.value = null;
            blockCommentsError.value = null;
            blockCommentSelectionAnchor.value = null;
            blockCommentAnchorResolutions.value = {};
            activeBlockCommentId.value = null;
            refreshCommentAnchorDecorations();
            scheduleInlineCommentMarkerRefresh();
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (!force && blockCommentsContextKey.value === contextKey && blockCommentsStatus.value !== 'error') return;

        blockCommentsContextKey.value = contextKey;
        blockComments.value = [];
        blockCommentsError.value = null;

        if (!block.current_version_id) {
            blockCommentsStatus.value = 'ready';
            setBlockCommentSummary(block.block_uuid, { all: 0, open: 0, resolved: 0, stale: 0 });
            refreshCommentAnchorDecorations();
            scheduleInlineCommentMarkerRefresh();
            return;
        }

        blockCommentsStatus.value = 'loading';

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/comments`)
            .then((payload) => {
                if (blockCommentsContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                blockComments.value = data.comments || [];
                if (activeBlockCommentId.value && !blockComments.value.some((comment) => comment.id === activeBlockCommentId.value)) {
                    activeBlockCommentId.value = null;
                }
                blockCommentsStatus.value = 'ready';
                setBlockCommentSummaryFromComments(block.block_uuid, blockComments.value);
                refreshCommentAnchorDecorations();
                scheduleInlineCommentMarkerRefresh();
            })
            .catch((error) => {
                if (blockCommentsContextKey.value !== contextKey) return;

                const statusCode = error?.response?.status || error?.status;
                if (statusCode === 404) {
                    blockComments.value = [];
                    blockCommentsError.value = null;
                    blockCommentsStatus.value = 'ready';
                    setBlockCommentSummary(block.block_uuid, { all: 0, open: 0, resolved: 0, stale: 0 });
                    refreshCommentAnchorDecorations();
                    scheduleInlineCommentMarkerRefresh();
                    return;
                }

                blockComments.value = [];
                blockCommentsError.value = requestErrorMessage(error, 'Unable to load comments for this block.');
                blockCommentsStatus.value = 'error';
                refreshCommentAnchorDecorations();
                scheduleInlineCommentMarkerRefresh();
            });
    };

    const upsertCommentInList = (comment) => {
        if (!comment) return;

        blockComments.value = [
            comment,
            ...blockComments.value.filter((item) => item.id !== comment.id),
        ].sort((a, b) => {
            if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
            return (b.id || 0) - (a.id || 0);
        });
        blockCommentsError.value = null;
        blockCommentsStatus.value = 'ready';
        setBlockCommentSummaryFromComments(comment.block_uuid, blockComments.value);
        bookCommentsQueue.value = [
            comment,
            ...bookCommentsQueue.value.filter((item) => item.id !== comment.id),
        ].sort((a, b) => {
            if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
            if ((a.block_sort_order || 0) !== (b.block_sort_order || 0)) return (a.block_sort_order || 0) - (b.block_sort_order || 0);
            return (b.id || 0) - (a.id || 0);
        });
        bookCommentsQueueStatus.value = 'ready';
        bookCommentsQueueError.value = null;
        refreshCommentAnchorDecorations();
        scheduleInlineCommentMarkerRefresh();
    };

    createBlockCommentFromSource = async (block, body, versionId = null, metadata = null) => {
        const commentBody = String(body || '').trim();
        if (!keyBook || !block?.block_uuid || !commentBody || block.dirty || !block.current_version_id || blockCommentActionStatus.value !== 'idle') return;

        blockCommentActionStatus.value = 'creating';
        blockCommentsError.value = null;

        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/comments`, {
                body: commentBody,
                book_block_version_id: versionId || null,
                metadata_json: metadata || null,
            });
            const data = normalizeDataPayload(payload);

            if (data.comment) {
                blockCommentsContextKey.value = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
                upsertCommentInList(data.comment);
                loadBlockCommentSummaries();
                loadBookCommentsQueue({ force: true });
                loadBookActivity(keyBook, { force: true });
                setRightWorkspaceTool('comments');
            } else {
                loadBlockComments(block, { force: true });
            }
        } catch (error) {
            blockCommentsError.value = requestErrorMessage(error, 'Unable to create comment.');
            blockCommentsStatus.value = 'error';
            setRightWorkspaceTool('comments');
        } finally {
            blockCommentActionStatus.value = 'idle';
        }
    };

    createBlockComment = async (block) => {
        const body = blockCommentDraft.value.trim();
        const anchor = blockCommentSelectionAnchor.value?.block_uuid === block.block_uuid
            ? blockCommentSelectionAnchor.value
            : null;

        await createBlockCommentFromSource(block, body, null, anchor ? { anchor } : null);

        if (blockCommentsStatus.value !== 'error') {
            blockCommentDraft.value = '';
            blockCommentSelectionAnchor.value = null;
        }
    };

    updateBlockCommentStatus = (block, comment, status) => {
        if (!keyBook || !block?.block_uuid || !comment?.id || blockCommentActionStatus.value !== 'idle') return;

        blockCommentActionStatus.value = `updating:${comment.id}`;
        blockCommentsError.value = null;

        _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/comments/${comment.id}`, {
            status,
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);

                if (data.comment) {
                    upsertCommentInList(data.comment);
                    loadBlockCommentSummaries();
                    loadBookCommentsQueue({ force: true });
                    loadBookActivity(keyBook, { force: true });
                    refreshCommentAnchorDecorations();
                } else {
                    loadBlockComments(block, { force: true });
                }
            })
            .catch((error) => {
                blockCommentsError.value = requestErrorMessage(error, 'Unable to update comment.');
                blockCommentsStatus.value = 'error';
            })
            .finally(() => {
                blockCommentActionStatus.value = 'idle';
            });
    };

    updateBlockCommentAnchor = (block, comment, resolution) => {
        if (!keyBook || !block?.block_uuid || !comment?.id || !resolution || blockCommentActionStatus.value !== 'idle') return;

        const metadata = {
            ...(comment.metadata_json || {}),
            anchor: {
                type: 'text-selection',
                block_uuid: block.block_uuid,
                offset_start: resolution.offset_start,
                offset_end: resolution.offset_end,
                text: resolution.text || commentAnchor(comment)?.text || '',
            },
        };

        blockCommentActionStatus.value = `anchoring:${comment.id}`;
        blockCommentsError.value = null;

        _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/comments/${comment.id}`, {
            book_block_version_id: block.current_version_id,
            metadata_json: metadata,
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);

                if (data.comment) {
                    activeBlockCommentId.value = data.comment.id;
                    upsertCommentInList(data.comment);
                    loadBlockCommentSummaries();
                    loadBookCommentsQueue({ force: true });
                    loadBookActivity(keyBook, { force: true });
                    refreshCommentAnchorDecorations();
                } else {
                    loadBlockComments(block, { force: true });
                }
            })
            .catch((error) => {
                blockCommentsError.value = requestErrorMessage(error, 'Unable to update comment anchor.');
                blockCommentsStatus.value = 'error';
            })
            .finally(() => {
                blockCommentActionStatus.value = 'idle';
            });
    };

    navigateBlockComment = (block, direction = 1) => {
        const comments = visibleBookCommentsQueue();
        if (!comments.length) return;

        const currentIndex = comments.findIndex((comment) => comment.id === activeBlockCommentId.value);
        const fallbackIndex = direction > 0 ? -1 : 0;
        const nextIndex = (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction;
        const normalizedIndex = (nextIndex + comments.length) % comments.length;
        const nextComment = comments[normalizedIndex];
        const blockUuid = nextComment.block_uuid || block?.block_uuid || commentAnchor(nextComment)?.block_uuid;

        activeBlockCommentId.value = nextComment.id;
        if (blockUuid) {
            focusEditorBlock(blockUuid);

            const targetBlock = editorOutline.value.find((item) => item.block_uuid === blockUuid) || block;
            if (targetBlock?.block_uuid && targetBlock.block_uuid !== blockCommentContextBlockUuid()) {
                loadBlockComments(targetBlock);
            }
        }

        requestAnimationFrame(() => {
            document
                .querySelector(`[data-comment-item-id="${cssSelectorEscape(nextComment.id)}"]`)
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    };

    loadVoiceProfiles = (bookKey = keyBook, { force = false } = {}) => {
        if (!bookKey) {
            voiceProfiles.value = [];
            voiceProfilesStatus.value = 'idle';
            voiceProfilesContextKey.value = null;
            voiceProfilesError.value = null;
            return;
        }

        if (!force && voiceProfilesContextKey.value === bookKey && voiceProfilesStatus.value !== 'error') return;

        voiceProfilesContextKey.value = bookKey;
        voiceProfilesStatus.value = 'loading';
        voiceProfilesError.value = null;

        _.http.getJSON(`/dashboard/api/books/${bookKey}/voices`)
            .then((payload) => {
                if (voiceProfilesContextKey.value !== bookKey) return;

                const data = normalizeDataPayload(payload);
                voiceProfiles.value = data.profiles || [];
                voiceProfilesStatus.value = 'ready';
            })
            .catch((error) => {
                if (voiceProfilesContextKey.value !== bookKey) return;

                voiceProfiles.value = [];
                voiceProfilesError.value = requestErrorMessage(error, 'Unable to load voice profiles.');
                voiceProfilesStatus.value = 'error';
            });
    };

    loadBlockVoiceAssignment = (block, { force = false } = {}) => {
        if (!keyBook || !block?.block_uuid) {
            voiceAssignment.value = null;
            voiceAssignmentStatus.value = 'idle';
            voiceAssignmentContextKey.value = null;
            voiceAssignmentError.value = null;
            selectedVoiceProfileId.value = '';
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (!force && voiceAssignmentContextKey.value === contextKey && voiceAssignmentStatus.value !== 'error') return;

        voiceAssignmentContextKey.value = contextKey;
        voiceAssignment.value = null;
        selectedVoiceProfileId.value = '';
        voiceAssignmentStatus.value = 'loading';
        voiceAssignmentError.value = null;

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`)
            .then((payload) => {
                if (voiceAssignmentContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                voiceAssignment.value = data.assignment || null;
                selectedVoiceProfileId.value = data.assignment?.voice_profile_id
                    ? String(data.assignment.voice_profile_id)
                    : '';
                voiceAssignmentStatus.value = 'ready';
                loadBookActivity(keyBook, { force: true });
            })
            .catch((error) => {
                if (voiceAssignmentContextKey.value !== contextKey) return;

                voiceAssignment.value = null;
                selectedVoiceProfileId.value = '';
                voiceAssignmentError.value = requestErrorMessage(error, 'Unable to load voice assignment.');
                voiceAssignmentStatus.value = 'error';
            });
    };

    saveBlockVoiceAssignment = (block) => {
        if (!keyBook || !block?.block_uuid || !selectedVoiceProfileId.value || block.dirty || !block.current_version_id || voiceAssignmentActionStatus.value !== 'idle') return;

        voiceAssignmentActionStatus.value = 'saving';
        voiceAssignmentError.value = null;

        _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`, {
            voice_profile_id: Number(selectedVoiceProfileId.value),
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);

                voiceAssignment.value = data.assignment || null;
                selectedVoiceProfileId.value = data.assignment?.voice_profile_id
                    ? String(data.assignment.voice_profile_id)
                    : '';
                voiceAssignmentStatus.value = 'ready';
            })
            .catch((error) => {
                voiceAssignmentError.value = requestErrorMessage(error, 'Unable to assign voice.');
                voiceAssignmentStatus.value = 'error';
            })
            .finally(() => {
                voiceAssignmentActionStatus.value = 'idle';
            });
    };

    clearBlockVoiceAssignment = (block) => {
        if (!keyBook || !block?.block_uuid || voiceAssignmentActionStatus.value !== 'idle') return;

        voiceAssignmentActionStatus.value = 'clearing';
        voiceAssignmentError.value = null;

        _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`, {
            voice_profile_id: null,
        })
            .then(() => {
                voiceAssignment.value = null;
                selectedVoiceProfileId.value = '';
                voiceAssignmentStatus.value = 'ready';
                loadBookActivity(keyBook, { force: true });
            })
            .catch((error) => {
                voiceAssignmentError.value = requestErrorMessage(error, 'Unable to clear voice assignment.');
                voiceAssignmentStatus.value = 'error';
            })
            .finally(() => {
                voiceAssignmentActionStatus.value = 'idle';
            });
    };

    loadBlockAudio = (block, { force = false } = {}) => {
        if (!keyBook || !block?.block_uuid) {
            audioSegments.value = [];
            audioStatus.value = 'idle';
            audioContextKey.value = null;
            audioError.value = null;
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (!force && audioContextKey.value === contextKey && audioStatus.value !== 'error') return;

        audioContextKey.value = contextKey;
        audioSegments.value = [];
        audioStatus.value = 'loading';
        audioError.value = null;

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/audio`)
            .then((payload) => {
                if (audioContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                audioSegments.value = data.segments || [];

                if (data.assignment) {
                    voiceAssignment.value = data.assignment;
                    selectedVoiceProfileId.value = data.assignment.voice_profile_id
                        ? String(data.assignment.voice_profile_id)
                        : '';
                    voiceAssignmentStatus.value = 'ready';
                }

                audioStatus.value = 'ready';
            })
            .catch((error) => {
                if (audioContextKey.value !== contextKey) return;

                audioSegments.value = [];
                audioError.value = requestErrorMessage(error, 'Unable to load audio segments.');
                audioStatus.value = 'error';
            });
    };

    generateBlockAudio = (block) => {
        if (!keyBook || !block?.block_uuid || block.dirty || !block.current_version_id || !voiceAssignment.value || audioActionStatus.value !== 'idle') return;

        const audioSetting = audioAiSetting();
        audioActionStatus.value = 'generating';
        audioError.value = null;

        _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generate`, {
            provider_key: audioSetting.provider_key,
            model: audioSetting.model,
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);

                if (data.segment) {
                    audioSegments.value = [
                        data.segment,
                        ...audioSegments.value.filter((segment) => segment.id !== data.segment.id),
                    ];
                    audioStatus.value = 'ready';
                    loadBookActivity(keyBook, { force: true });
                } else {
                    loadBlockAudio(block, { force: true });
                    loadBookActivity(keyBook, { force: true });
                }
            })
            .catch((error) => {
                audioError.value = requestErrorMessage(error, 'Unable to generate audio.');
                audioStatus.value = 'error';
            })
            .finally(() => {
                audioActionStatus.value = 'idle';
            });
    };

    loadBlockTranslations = (block, { force = false } = {}) => {
        if (!keyBook || !block?.block_uuid) {
            blockTranslations.value = [];
            blockTranslationsStatus.value = 'idle';
            blockTranslationsContextKey.value = null;
            blockTranslationsError.value = null;
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (!force && blockTranslationsContextKey.value === contextKey && blockTranslationsStatus.value !== 'error') return;

        blockTranslationsContextKey.value = contextKey;
        blockTranslations.value = [];
        blockTranslationsStatus.value = 'loading';
        blockTranslationsError.value = null;

        loadBookBlockTranslations(keyBook, block.block_uuid)
            .then((payload) => {
                if (blockTranslationsContextKey.value !== contextKey) return;

                blockTranslations.value = payload.translations || [];
                blockTranslationsStatus.value = 'ready';
            })
            .catch((error) => {
                if (blockTranslationsContextKey.value !== contextKey) return;

                blockTranslations.value = [];
                blockTranslationsError.value = requestErrorMessage(error, 'Unable to load translations.');
                blockTranslationsStatus.value = 'error';
            });
    };

    const upsertTranslationInList = (translation) => {
        if (!translation) return;

        blockTranslations.value = [
            translation,
            ...blockTranslations.value.filter((item) => item.id !== translation.id),
        ].sort((a, b) => {
            if ((a.status === 'draft') !== (b.status === 'draft')) return a.status === 'draft' ? -1 : 1;
            return (b.id || 0) - (a.id || 0);
        });
        blockTranslationsError.value = null;
        blockTranslationsStatus.value = 'ready';
    };

    createBlockTranslation = (block) => {
        if (!keyBook || !block?.block_uuid || block.dirty || !block.current_version_id || blockTranslationActionStatus.value !== 'idle') return;

        const translateSetting = translateAiSetting();
        blockTranslationActionStatus.value = 'translating';
        blockTranslationsError.value = null;

        createAiBookBlockTranslation(keyBook, block.block_uuid, {
            targetLocale: translationTargetLocale.value,
            providerKey: translateSetting.provider_key,
            model: translateSetting.model,
        })
            .then((payload) => {
                const data = payload;

                if (data.translation) {
                    upsertTranslationInList(data.translation);
                    loadBookActivity(keyBook, { force: true });
                } else {
                    loadBlockTranslations(block, { force: true });
                    loadBookActivity(keyBook, { force: true });
                }
            })
            .catch((error) => {
                blockTranslationsError.value = requestErrorMessage(error, 'Unable to create translation.');
                blockTranslationsStatus.value = 'error';
            })
            .finally(() => {
                blockTranslationActionStatus.value = 'idle';
            });
    };

    updateBlockTranslationStatus = (block, translation, status) => {
        if (!keyBook || !block?.block_uuid || !translation?.id || blockTranslationActionStatus.value !== 'idle') return;

        blockTranslationActionStatus.value = `updating:${translation.id}`;
        blockTranslationsError.value = null;

        resolveBookBlockTranslation(keyBook, block.block_uuid, translation.id, status)
            .then((payload) => {
                const data = payload;

                if (data.translation) {
                    upsertTranslationInList(data.translation);
                    loadBookActivity(keyBook, { force: true });
                } else {
                    loadBlockTranslations(block, { force: true });
                    loadBookActivity(keyBook, { force: true });
                }
            })
            .catch((error) => {
                blockTranslationsError.value = requestErrorMessage(error, 'Unable to update translation.');
                blockTranslationsStatus.value = 'error';
            })
            .finally(() => {
                blockTranslationActionStatus.value = 'idle';
            });
    };

    const voiceProfileForm = (bookKey, close) => _.form({
        action: '#',
        method: 'post',
        onSubmit: async (event) => {
            event.preventDefault();

            if (!voiceProfileName.value.trim()) {
                voiceProfileDialogStatus.value = {
                    type: 'warning',
                    title: 'Missing voice name',
                    message: 'Add a narrator or character name.',
                };
                return;
            }

            savingVoiceProfile.value = true;
            voiceProfileDialogStatus.value = null;

            try {
                const payload = await _.http.postJSON(`/dashboard/api/books/${bookKey}/voices`, {
                    name: voiceProfileName.value.trim(),
                    role: voiceProfileRole.value || 'character',
                    voice_provider: voiceProfileProvider.value.trim() || null,
                    voice_id: voiceProfileVoiceId.value.trim() || null,
                    language: voiceProfileLanguage.value.trim() || null,
                    notes: voiceProfileNotes.value.trim() || null,
                });
                const data = normalizeDataPayload(payload);

                if (data.profile) {
                    voiceProfiles.value = [
                        data.profile,
                        ...voiceProfiles.value.filter((profile) => profile.id !== data.profile.id),
                    ].sort((a, b) => {
                        if ((a.role === 'narrator') !== (b.role === 'narrator')) return a.role === 'narrator' ? -1 : 1;
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    selectedVoiceProfileId.value = String(data.profile.id);
                    voiceProfilesStatus.value = 'ready';
                } else {
                    await loadVoiceProfiles(bookKey, { force: true });
                }

                close();
            } catch (error) {
                voiceProfileDialogStatus.value = {
                    type: 'danger',
                    title: 'Voice not saved',
                    message: requestErrorMessage(error, 'Unable to save voice profile.'),
                };
            } finally {
                savingVoiceProfile.value = false;
            }
        },
    },
        _.Row({ gap: 'md' },
            _.Input({
                class: 'cms-col-24',
                label: 'Name',
                icon: 'badge',
                model: voiceProfileName,
                placeholder: 'Narrator or character name',
            }),
            _.Select({
                class: 'cms-col-24',
                label: 'Role',
                icon: 'record_voice_over',
                model: voiceProfileRole,
                options: voiceRoleOptions,
                onChange: (value) => {
                    voiceProfileRole.value = selectChangeValue(value, voiceProfileRole.value);
                },
            }),
            _.Input({
                class: 'cms-col-24',
                label: 'Voice provider',
                icon: 'hub',
                model: voiceProfileProvider,
                placeholder: 'OpenAI, ElevenLabs, local, ...',
            }),
            _.Input({
                class: 'cms-col-24',
                label: 'Voice ID',
                icon: 'fingerprint',
                model: voiceProfileVoiceId,
                placeholder: 'Provider voice identifier',
            }),
            _.Input({
                class: 'cms-col-24',
                label: 'Language',
                icon: 'translate',
                model: voiceProfileLanguage,
                placeholder: 'it, en, es...',
            }),
            _.Textarea({
                class: 'cms-col-24',
                label: 'Notes',
                icon: 'notes',
                rows: 4,
                model: voiceProfileNotes,
                placeholder: 'Tone, age, accent, performance notes',
            }),
            _.div({ class: 'cms-col-24' }, () => voiceProfileDialogStatus.value
                ? _.Alert(voiceProfileDialogStatus.value)
                : null),
            _.div({ class: 'cms-col-24', align: 'right' },
                _.Btn({ type: 'button', class: 'cms-m-r-sm', color: 'secondary', onClick: close }, 'Close'),
                _.Btn({ type: 'submit', color: 'primary', loading: savingVoiceProfile }, 'Create voice')
            )
        )
    );

    openVoiceProfileDialog = (bookKey = keyBook) => {
        voiceProfileName.value = '';
        voiceProfileRole.value = 'character';
        voiceProfileProvider.value = '';
        voiceProfileVoiceId.value = '';
        voiceProfileLanguage.value = '';
        voiceProfileNotes.value = '';
        voiceProfileDialogStatus.value = null;

        _.Dialog({
            size: 'lg',
            stickyActions: true,
            slots: {
                header: _.div(
                    _.h3('Create voice profile'),
                    _.span({ class: 'text-muted' }, 'Define a narrator or character voice for this book.'),
                ),
                content: ({ close }) => voiceProfileForm(bookKey, close),
            },
        }).open();
    };

    loadAiChatMessages = (block, { force = false } = {}) => {
        if (!keyBook) {
            aiChatMessages.value = [];
            aiChatContextKey.value = null;
            aiChatStatus.value = 'idle';
            aiChatError.value = null;
            return;
        }

        const scope = block?.block_uuid ? 'block' : 'book';
        const blockUuid = block?.block_uuid || '';
        const versionId = block?.current_version_id || 'book';
        const contextKey = `${keyBook}:${scope}:${blockUuid || 'book'}:${versionId}`;

        if (!force && aiChatContextKey.value === contextKey && aiChatStatus.value !== 'error') return;

        aiChatContextKey.value = contextKey;
        aiChatStatus.value = 'loading';
        aiChatError.value = null;

        const params = new URLSearchParams({ scope });
        if (blockUuid) params.set('block_uuid', blockUuid);

        _.http.getJSON(`/dashboard/api/books/${keyBook}/ai/chat?${params.toString()}`)
            .then((payload) => {
                if (aiChatContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                aiChatMessages.value = data.messages || [];
                aiChatStatus.value = 'idle';
            })
            .catch((error) => {
                if (aiChatContextKey.value !== contextKey) return;

                aiChatMessages.value = [];
                aiChatError.value = requestErrorMessage(error, 'Unable to load AI Chat messages.');
                aiChatStatus.value = 'error';
            });
    };

    askAiChat = (block) => {
        const question = aiChatDraft.value.trim();
        if (!keyBook || !question || aiChatStatus.value === 'asking') return;

        const chatSetting = chatAiSetting();
        aiChatStatus.value = 'asking';
        aiChatError.value = null;

        _.http.postJSON(`/dashboard/api/books/${keyBook}/ai/chat`, {
            scope: block?.block_uuid ? 'block' : 'book',
            block_uuid: block?.block_uuid || null,
            message: question,
            provider_key: chatSetting.provider_key,
            model: chatSetting.model,
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);
                const message = data.message;

                if (!message) throw new Error('AI Chat returned an empty response.');

                aiChatMessages.value = data.messages || [
                    {
                        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        question,
                        answer: message.answer || '',
                        provider_name: message.provider_name || message.provider_key || 'AI',
                        model: message.model || '',
                        metadata: message.metadata || {},
                    },
                    ...aiChatMessages.value,
                ];
                aiChatDraft.value = '';
            })
            .catch((error) => {
                aiChatError.value = requestErrorMessage(error, 'Unable to ask AI Chat.');
            })
            .finally(() => {
                aiChatStatus.value = 'idle';
            });
    };

    createBlockReview = (block, type = 'grammar') => {
        if (!keyBook || !block?.block_uuid || block.dirty || blockReviewActionStatus.value !== 'idle') return;

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        const correctionSetting = correctionAiSetting();
        blockReviewActionStatus.value = 'checking';

        _.http.postJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/reviews`, {
            type,
            provider_key: correctionSetting.provider_key,
            model: correctionSetting.model,
        })
            .then((payload) => {
                const data = normalizeDataPayload(payload);
                const review = data.review;

                if (review) {
                    blockReviewsContextKey.value = contextKey;
                    upsertReviewInList(review);
                    loadBookActivity(keyBook, { force: true });
                } else {
                    blockReviewsContextKey.value = null;
                    loadBlockReviews(block);
                    loadBookActivity(keyBook, { force: true });
                }
            })
            .catch((error) => {
                blockReviewsError.value = requestErrorMessage(error, 'Unable to create AI correction.');
                blockReviewsStatus.value = 'error';
            })
            .finally(() => {
                blockReviewActionStatus.value = 'idle';
            });
    };

    applyBlockReview = async (block, review) => {
        if (!keyBook || !block?.block_uuid || !review?.id || blockReviewActionStatus.value !== 'idle') return false;
        if (block.dirty || !review.is_current_version || review.status !== 'draft') return false;

        blockReviewActionStatus.value = `applying:${review.id}`;
        let documentSaved = false;

        try {
            const changed = updateEditorBlockText(block.block_uuid, review.suggested_text || '');
            if (!changed) throw new Error('Unable to update selected block.');

            clearTimeout(autosaveTimer);
            const saved = await saveDirtyBlocks();
            if (!saved) throw new Error('Unable to save applied correction.');
            documentSaved = true;

            const updatedBlock = blockMeta.get(block.block_uuid);
            await patchBlockReview(block, review, {
                status: 'applied',
                applied_book_block_version_id: updatedBlock?.current_version_id || block.current_version_id || null,
            });

            blockVersionsContextKey.value = null;
            loadBlockVersions({
                ...block,
                current_version_id: updatedBlock?.current_version_id || block.current_version_id || null,
            });
            loadBookActivity(keyBook, { force: true });
            return true;
        } catch {
            if (documentSaved) {
                blockReviewsStatus.value = 'error';
            } else {
                setSaveStatus('error');
            }
            return false;
        } finally {
            blockReviewActionStatus.value = 'idle';
            refreshEditorUi();
        }
    };

    rejectBlockReview = async (block, review) => {
        if (!keyBook || !block?.block_uuid || !review?.id || blockReviewActionStatus.value !== 'idle') return false;
        if (block.dirty || !review.is_current_version || review.status !== 'draft') return false;

        blockReviewActionStatus.value = `rejecting:${review.id}`;

        try {
            await patchBlockReview(block, review, {
                status: 'rejected',
            });
            loadBookActivity(keyBook, { force: true });
            return true;
        } catch {
            blockReviewsStatus.value = 'error';
            return false;
        } finally {
            blockReviewActionStatus.value = 'idle';
            refreshEditorUi();
        }
    };

    const refreshBlockMeta = async () => {
        const payload = await _.http.getJSON(`/dashboard/api/books/${keyBook}/editor`);
        const data = normalizeEditorPayload(payload);
        const documentContent = data.document?.content || [];

        blockMeta.clear();
        (data.blocks || []).forEach((block) => {
            blockMeta.set(block.block_uuid, {
                ...block,
                signature: blockSignature({
                    ...block,
                    content_json: documentContent.find((node) => node.attrs?.blockId === block.block_uuid) || block.content_json || null,
                }),
            });
        });
    };

    const saveDirtyBlocks = async ({ retryOnConflict = true } = {}) => {
        if (!keyBook || autosaveBlocked) return false;

        if (saveInFlight) {
            pendingSave = true;
            return false;
        }

        syncEditorBlocks();

        const blocks = dirtyBlocks();
        const deleted_block_uuids = deletedBlockUuids();

        if (!blocks.length && !deleted_block_uuids.length) {
            setSaveStatus('saved');
            return true;
        }

        saveInFlight = true;
        pendingSave = false;
        setSaveStatus('saving');
        let retryAfterConflict = false;

        try {
            const payload = await _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks`, {
                source: 'manual',
                blocks,
                deleted_block_uuids,
            });
            const data = normalizeEditorPayload(payload);

            updateBlockMetaFromSaved(data.blocks || [], blocks);
            (data.deleted_block_uuids || []).forEach((blockUuid) => {
                const meta = blockMeta.get(blockUuid);
                if (!meta) return;

                blockMeta.set(blockUuid, {
                    ...meta,
                    status: 'deleted',
                });
            });
            syncEditorBlocks();
            refreshCommentAnchorDecorations();
            loadBlockCommentSummaries();
            setSaveStatus('saved');
            return true;
        } catch (error) {
            const statusCode = error?.response?.status || error?.status;

            if (statusCode === 409 && retryOnConflict) {
                try {
                    await refreshBlockMeta();
                    setSaveStatus('dirty');
                    pendingSave = false;
                    retryAfterConflict = true;
                } catch {
                    autosaveBlocked = true;
                    setSaveStatus('conflict');
                }
            } else if (statusCode === 409) {
                autosaveBlocked = true;
                setSaveStatus('conflict');
            } else {
                setSaveStatus('error');
            }
        } finally {
            saveInFlight = false;

            if (retryAfterConflict && !autosaveBlocked) {
                return saveDirtyBlocks({ retryOnConflict: false });
            }

            if (pendingSave && !autosaveBlocked) {
                pendingSave = false;
                return saveDirtyBlocks();
            }

            return false;
        }
    };

    const scheduleAutosave = () => {
        if (!keyBook || autosaveBlocked) return;

        setSaveStatus('dirty');
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(saveDirtyBlocks, AUTOSAVE_DELAY);
    };

    const afterEditorChange = () => {
        if (isApplyingRemoteContent) {
            syncEditorBlocks();
            updateActiveBlock();
            refreshEditorUi();
            return;
        }

        syncEditorBlocks();
        updateActiveBlock();
        scheduleAutosave();
        refreshEditorUi();
    };

    const afterEditorCreate = () => {
        syncEditorBlocks();
        updateActiveBlock();
        refreshEditorUi();
    };

    const loadEditorDocument = async () => {
        if (!keyBook) return defaultDocument();

        editorStatus.value = { type: 'loading', message: 'Loading editor...' };

        try {
            const payload = await _.http.getJSON(`/dashboard/api/books/${keyBook}/editor`);
            const data = normalizeEditorPayload(payload);
            const content = data.document?.content?.length
                ? withBlockIds(data.document)
                : documentFromBlocks(data.blocks);

            editorBook.value = data.book || null;
            blockMeta.clear();
            (data.blocks || []).forEach((block) => {
                blockMeta.set(block.block_uuid, {
                    ...block,
                    signature: blockSignature({
                        ...block,
                        content_json: (data.document?.content || []).find((node) => node.attrs?.blockId === block.block_uuid) || null,
                    }),
                });
            });

            setSaveStatus('saved');
            editorStatus.value = null;

            return content;
        } catch (error) {
            editorStatus.value = {
                type: 'danger',
                message: error.message || 'Unable to load editor.',
            };

            return defaultDocument();
        }
    };

    const applyRemoteContent = async () => {
        const content = await loadEditorDocument();
        if (!editor || !editorMount.isConnected) return;

        try {
            isApplyingRemoteContent = true;
            editor.commands.setContent(content, {
                emitUpdate: false,
                errorOnInvalidContent: true,
            });
        } catch (error) {
            editorStatus.value = {
                type: 'danger',
                message: error.message || 'Unable to render editor content.',
            };
        } finally {
            isApplyingRemoteContent = false;
        }

        syncEditorBlocks();
        updateActiveBlock();
        editorReady.value = true;
        loadBookActivity(keyBook, { force: true });
        loadBlockCommentSummaries();
        loadBookCommentsQueue({ force: true });
        scheduleInlineCommentMarkerRefresh();
        refreshEditorUi();
    };

    const destroyEditor = () => {
        if (inlineCommentMarkerFrame !== null) {
            cancelAnimationFrame(inlineCommentMarkerFrame);
            inlineCommentMarkerFrame = null;
        }
        editorMount.removeEventListener('click', handleInlineCommentMarkerClick);
        clearInlineCommentMarkers();
        clearActiveActivityMarker();
        editorReady.value = false;
        editorUiTick.value += 1;
        editorStatus.value = null;
        saveStatus.value = 'idle';
        editorBook.value = null;
        clearTimeout(autosaveTimer);
        blockMeta.clear();
        currentEditorBlocks = [];
        editorOutline.value = [];
        activeEditorBlockId.value = null;
        blockVersions.value = [];
        blockVersionsStatus.value = 'idle';
        blockVersionsContextKey.value = null;
        blockVersionActionStatus.value = 'idle';
        blockVersionsError.value = null;
        bookActivityItems.value = [];
        bookActivitySummary.value = { all: 0, action: 0, review: 0, stale: 0 };
        bookActivityStatus.value = 'idle';
        bookActivityContextKey.value = null;
        bookActivityError.value = null;
        activeBookActivityItemId.value = null;
        bookActivityActionStatus.value = 'idle';
        bookActivityFeedback.value = null;
        if (bookActivityFeedbackTimer) {
            clearTimeout(bookActivityFeedbackTimer);
            bookActivityFeedbackTimer = null;
        }
        blockReviews.value = [];
        blockReviewsStatus.value = 'idle';
        blockReviewsContextKey.value = null;
        blockReviewsError.value = null;
        blockReviewActionStatus.value = 'idle';
        blockComments.value = [];
        bookCommentsQueue.value = [];
        bookCommentsQueueStatus.value = 'idle';
        bookCommentsQueueContextKey.value = null;
        bookCommentsQueueError.value = null;
        blockCommentSummaries.value = {};
        blockCommentSelectionAnchor.value = null;
        blockCommentAnchorResolutions.value = {};
        activeBlockCommentId.value = null;
        blockCommentDraft.value = '';
        blockCommentsStatus.value = 'idle';
        blockCommentsContextKey.value = null;
        blockCommentsError.value = null;
        blockCommentActionStatus.value = 'idle';
        voiceProfiles.value = [];
        voiceProfilesStatus.value = 'idle';
        voiceProfilesContextKey.value = null;
        voiceProfilesError.value = null;
        voiceAssignment.value = null;
        voiceAssignmentStatus.value = 'idle';
        voiceAssignmentContextKey.value = null;
        voiceAssignmentError.value = null;
        voiceAssignmentActionStatus.value = 'idle';
        selectedVoiceProfileId.value = '';
        voiceProfileDialogStatus.value = null;
        savingVoiceProfile.value = false;
        audioSegments.value = [];
        audioStatus.value = 'idle';
        audioContextKey.value = null;
        audioError.value = null;
        audioActionStatus.value = 'idle';
        blockTranslations.value = [];
        blockTranslationsStatus.value = 'idle';
        blockTranslationsContextKey.value = null;
        blockTranslationsError.value = null;
        blockTranslationActionStatus.value = 'idle';
        translationTargetLocale.value = 'en';
        aiChatMessages.value = [];
        aiChatDraft.value = '';
        aiChatStatus.value = 'idle';
        aiChatError.value = null;
        aiChatContextKey.value = null;
        aiProviders.value = [];
        aiProviderStatus.value = 'idle';
        aiProviderContextKey.value = null;
        setAiProviderSetting({ service: 'correction', provider_key: 'mock', model: 'mock-correction-v1' });
        aiServiceSettings.value = {};
        aiProviderApiKey.value = '';
        aiProviderSystemPrompt.value = '';
        customProviderApiKey.value = '';
        focusEditorBlock = () => { };
        loadBlockVersions = () => { };
        loadBlockReviews = () => { };
        createBlockReview = () => { };
        applyBlockReview = () => { };
        rejectBlockReview = () => { };
        loadBookActivity = () => { };
        navigateBookActivityItem = () => { };
        loadBlockComments = () => { };
        loadBookCommentsQueue = () => { };
        createBlockComment = () => { };
        createBlockCommentFromSource = () => { };
        updateBlockCommentStatus = () => { };
        updateBlockCommentAnchor = () => { };
        navigateBlockComment = () => { };
        refreshInlineCommentMarkers = () => { };
        loadVoiceProfiles = () => { };
        loadBlockVoiceAssignment = () => { };
        saveBlockVoiceAssignment = () => { };
        clearBlockVoiceAssignment = () => { };
        openVoiceProfileDialog = () => { };
        loadBlockAudio = () => { };
        generateBlockAudio = () => { };
        loadBlockTranslations = () => { };
        createBlockTranslation = () => { };
        updateBlockTranslationStatus = () => { };
        askAiChat = () => { };
        loadAiChatMessages = () => { };
        loadAiProviders = () => { };
        saveAiProviderSetting = () => { };
        openCustomProviderDialog = () => { };
        openToolAiSettingsDialog = () => { };
        openSystemPromptDialog = () => { };
        editor?.destroy();
        editor = null;
    };

    setTimeout(async () => {
        if (!editorMount.isConnected) return;

        editor = new Editor({
            element: editorMount,
            extensions: [
                StarterKit,
                TrackableBlocks,
                CommentAnchors,
            ],
            content: defaultDocument(),
            onCreate: afterEditorCreate,
            onUpdate: afterEditorChange,
            onSelectionUpdate: () => {
                updateActiveBlock();
                updateCommentSelectionAnchor();
                refreshEditorUi();
            },
        });

        applyRemoteContent();
        loadAiProviders(keyBook, aiProviderSetting.value.service);
        refreshEditorUi();
    }, 0);

    const editorWrapper = _.div({ class: 'at-editorText', area: 'editorText' },
        _.div({ class: 'at-editorText-inner' },
            _.div({ class: 'at-editorToolbar' },
                writerToolbar()
            ),
            () => editorStatus.value
                ? _.div({ class: `at-editorStatus ${editorStatus.value.type}` }, editorStatus.value.message)
                : null,
            editorMount
        )
    );

    _._registerCleanup?.(editorWrapper, destroyEditor);

    return editorWrapper;
}
function content(keyBook) {
    return _.div({ class: 'at-content', area: 'content' },
        _.div({ class: 'at-topBar' },
            _.Button({ onclick: () => setIndexView(!indexView.value), icon: 'menu' }),
            _.div({ class: 'at-topBar-title' }, 'Content'),
            _.Button({ onclick: () => setCommandView(!commandView.value), icon: 'auto_awesome' })
        ),
        editorText(keyBook)
    );
}
function bottomBar() {
    return _.div({ class: 'at-bottomBar', area: 'bottomBar' },
        _.div({ class: 'at-bottomBar-left' },
            _.span({ class: 'at-bottomBar-item is-strong' }, () => editorBook.value?.name || 'No book loaded'),
            _.span({ class: 'at-bottomBar-item' }, () => {
                const outline = editorOutline.value;
                const chapterCount = outline.filter((item) => item.isChapter).length;

                return chapterCount
                    ? `${chapterCount} ch / ${outline.length} blocks`
                    : `${outline.length} blocks`;
            }),
            _.span({ class: 'at-bottomBar-item' }, () => {
                const block = activeOutlineItem();

                return block
                    ? `${outlineKindLabel(block)} · ${block.label}`
                    : 'No block selected';
            })
        ),
        _.div({ class: 'at-bottomBar-center' },
            _.span({ class: () => `at-bottomBar-server is-${serverHealthStatus()}` },
                _.span({ class: 'at-bottomBar-dot' }),
                _.span(() => {
                    const events = activeServerEvents();

                    return events.length ? events.slice(0, 2).join(' · ') : 'Server ready';
                })
            ),
            _.span({ class: 'at-bottomBar-item' }, () => `Tool: ${activeToolLabel()}`),
            _.span({ class: 'at-bottomBar-item' }, () => {
                const counts = bookCommentSummaryCounts();

                return counts.all
                    ? `Comments: ${counts.open} open, ${counts.stale} stale`
                    : 'Comments: 0';
            }),
            _.span({ class: 'at-bottomBar-item' }, () => {
                const counts = bookActivityCounts();
                const item = activeBookActivityItem();
                const feedback = bookActivityFeedback.value;

                if (feedback?.message) return `Activity: ${feedback.message}`;

                if (item) return `Activity: ${activitySummaryLabel(item)}`;

                return counts.all
                    ? `Activity: ${counts.action} action, ${counts.stale} stale`
                    : 'Activity: 0';
            }),
            _.span({ class: 'at-bottomBar-item' }, () => {
                const block = activeOutlineItem();
                const text = block?.label || '';
                const tokens = estimateTokens(text);

                return tokens ? `~${tokens} tokens selected` : '0 tokens selected';
            })
        ),
        _.div({ class: 'at-bottomBar-right' },
            _.span({
                class: () => `at-saveStatusIcon ${saveStatus.value}`,
                title: () => saveStatusLabel(saveStatus.value),
                'aria-label': () => saveStatusLabel(saveStatus.value),
                role: 'status',
            }, () => _.Icon
                ? _.Icon({ name: saveStatusIcon(saveStatus.value), class: 'at-saveStatusIcon-symbol' })
                : saveStatusLabel(saveStatus.value)
            )
        )
    );
}
export default function bookEditor(ctx = null) {
    const keyBook = readRouteBookKey(ctx);
    restoreEditorPreferences();

    return _.div({
        class: 'at-page-bookEditor',
    }, _.div({ class: 'at-content-editor' },
        indexBook(), content(keyBook), rightWorkspace(keyBook)
    ), bottomBar());
}
