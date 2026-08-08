import { Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';


const indexView = _.rod(true);
const commandView = _.rod(true);
const editorReady = _.rod(false);
const editorUiTick = _.rod(0);
const editorPageFormat = _.rod('book');
const editorStatus = _.rod(null);
const saveStatus = _.rod('idle');
const editorOutline = _.rod([]);
const activeEditorBlockId = _.rod(null);
const rightWorkspaceTool = _.rod('chat');
const blockVersions = _.rod([]);
const blockVersionsStatus = _.rod('idle');
const blockVersionsContextKey = _.rod(null);
const blockReviews = _.rod([]);
const blockReviewsStatus = _.rod('idle');
const blockReviewsContextKey = _.rod(null);
const blockReviewsError = _.rod(null);
const blockReviewActionStatus = _.rod('idle');
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
let loadBlockReviews = () => { };
let createBlockReview = () => { };
let applyBlockReview = () => { };
let rejectBlockReview = () => { };
let loadAiProviders = () => { };
let saveAiProviderSetting = () => { };
let openCustomProviderDialog = () => { };
let openToolAiSettingsDialog = () => { };
let openSystemPromptDialog = () => { };

const AUTOSAVE_DELAY = 1200;

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
    { id: 'settings', icon: 'tune', label: 'Settings' },
];

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
            tool.id !== 'settings' ? _.button({
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

function versionsPanel(block) {
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

    return _.div({ class: 'at-rightWorkspace-section' },
        _.h3('Version history'),
        versions.length
            ? _.div({ class: 'at-versionList' }, versions.map((version) => _.div({
                class: version.is_current ? 'at-versionItem is-current' : 'at-versionItem',
            },
                _.div({ class: 'at-versionItem-head' },
                    _.strong(`v${version.version_number}`),
                    _.span(version.source || 'manual'),
                    version.is_current ? _.span({ class: 'at-versionBadge' }, 'Current') : null
                ),
                _.div({ class: 'at-versionItem-date' }, version.created_at
                    ? new Date(version.created_at).toLocaleString()
                    : ''
                ),
                _.div({ class: 'at-versionItem-preview' }, version.text_plain || 'Empty block')
            )))
            : _.p('No versions saved for this block yet.'),
        _.div({ class: 'at-rightWorkspace-actions' },
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: true,
            }, 'View changes'),
            _.button({
                type: 'button',
                class: 'at-rightWorkspace-action',
                disabled: true,
            }, 'Restore version')
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
                            onclick: () => applyBlockReview(block, review),
                        }, isApplying ? 'Applying...' : 'Apply'),
                        _.button({
                            type: 'button',
                            class: 'at-reviewItem-action',
                            disabled: !canResolve || isBusy,
                            onclick: () => rejectBlockReview(block, review),
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
                options: () => aiProviders.value.map((item) => ({
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
            _.Input({
                label: provider?.has_api_key ? 'API key saved' : 'API key',
                icon: 'key',
                model: aiProviderApiKey,
                type: 'password',
                placeholder: provider?.has_api_key ? 'Leave empty to keep current key' : 'Paste provider API key',
                autocomplete: 'off',
            }),
            _.div({ class: 'at-aiSettings-providerCard' },
                _.span('Hosting'),
                _.strong(provider?.base_url || 'Internal mock provider'),
                _.small(provider?.has_api_key ? 'Credential stored' : 'No credential stored'),
                _.small(provider?.is_custom ? 'Custom provider' : 'Built-in provider')
            ),
            _.div({ class: 'at-rightWorkspace-actions is-inline' },
                _.button({
                    type: 'button',
                    class: 'at-rightWorkspace-action is-primary',
                    disabled: savingAiSetting.value || !aiProviderSetting.value.provider_key || !aiProviderSetting.value.model,
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
        settings: {
            title: 'Tool settings',
            body: 'Workspace preferences, provider options and book-level automation settings.',
            actions: ['Configure tools', 'Automation rules'],
        },
    };
    const content = placeholders[tool.id] || placeholders.chat;

    if (tool.id === 'versions') {
        loadBlockVersions(block);

        return _.div({ class: 'at-rightWorkspace-body' },
            blockContextSummary(block),
            versionsPanel(block)
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
        loadAiProviders(keyBook, aiProviderSetting.value.service);

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
                    onclick: () => rightWorkspaceTool.value = tool.id,
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
    const blockMeta = new Map();

    const editorMount = _.div({
        class: () => `at-tiptap-editor page-${editorPageFormat.value}`,
        role: 'textbox',
        'aria-label': 'Book content editor',
    });

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
            onchange: (event) => editorPageFormat.value = event.target.value,
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

        const escapedBlockUuid = globalThis.CSS?.escape
            ? globalThis.CSS.escape(blockUuid)
            : blockUuid.replace(/"/g, '\\"');
        const blockElement = editor.view.dom.querySelector(`[data-block-id="${escapedBlockUuid}"]`);
        blockElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });

        activeEditorBlockId.value = blockUuid;
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
            return;
        }

        const contextKey = `${keyBook}:${block.block_uuid}:${block.current_version_id || 'new'}`;
        if (blockVersionsContextKey.value === contextKey && blockVersionsStatus.value !== 'error') return;

        blockVersionsContextKey.value = contextKey;
        blockVersions.value = [];
        blockVersionsStatus.value = 'loading';

        _.http.getJSON(`/dashboard/api/books/${keyBook}/blocks/${encodeURIComponent(block.block_uuid)}/versions`)
            .then((payload) => {
                if (blockVersionsContextKey.value !== contextKey) return;

                const data = normalizeDataPayload(payload);
                blockVersions.value = data.versions || [];
                blockVersionsStatus.value = 'ready';
            })
            .catch(() => {
                if (blockVersionsContextKey.value !== contextKey) return;

                blockVersions.value = [];
                blockVersionsStatus.value = 'error';
            });
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
        blockReviewsStatus.value = 'loading';
        blockReviewsError.value = null;

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
                } else {
                    blockReviewsContextKey.value = null;
                    loadBlockReviews(block);
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
        if (!keyBook || !block?.block_uuid || !review?.id || blockReviewActionStatus.value !== 'idle') return;
        if (block.dirty || !review.is_current_version || review.status !== 'draft') return;

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
        } catch {
            if (documentSaved) {
                blockReviewsStatus.value = 'error';
            } else {
                setSaveStatus('error');
            }
        } finally {
            blockReviewActionStatus.value = 'idle';
            refreshEditorUi();
        }
    };

    rejectBlockReview = async (block, review) => {
        if (!keyBook || !block?.block_uuid || !review?.id || blockReviewActionStatus.value !== 'idle') return;
        if (block.dirty || !review.is_current_version || review.status !== 'draft') return;

        blockReviewActionStatus.value = `rejecting:${review.id}`;

        try {
            await patchBlockReview(block, review, {
                status: 'rejected',
            });
        } catch {
            blockReviewsStatus.value = 'error';
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
        refreshEditorUi();
    };

    const destroyEditor = () => {
        editorReady.value = false;
        editorUiTick.value += 1;
        editorStatus.value = null;
        saveStatus.value = 'idle';
        clearTimeout(autosaveTimer);
        blockMeta.clear();
        currentEditorBlocks = [];
        editorOutline.value = [];
        activeEditorBlockId.value = null;
        blockVersions.value = [];
        blockVersionsStatus.value = 'idle';
        blockVersionsContextKey.value = null;
        blockReviews.value = [];
        blockReviewsStatus.value = 'idle';
        blockReviewsContextKey.value = null;
        blockReviewsError.value = null;
        blockReviewActionStatus.value = 'idle';
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
            ],
            content: defaultDocument(),
            onCreate: afterEditorCreate,
            onUpdate: afterEditorChange,
            onSelectionUpdate: () => {
                updateActiveBlock();
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
                writerToolbar(),
                _.span({ class: () => `at-saveStatus ${saveStatus.value}` }, () => {
                    const labels = {
                        idle: '',
                        dirty: 'Unsaved changes',
                        saving: 'Saving...',
                        saved: 'Saved',
                        error: 'Save failed',
                        conflict: 'Conflict detected',
                    };

                    return labels[saveStatus.value] || '';
                })
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
            _.Button({ onclick: () => indexView.value = !indexView.value, icon: 'menu' }),
            _.div({ class: 'at-topBar-title' }, 'Content'),
            _.Button({ onclick: () => commandView.value = !commandView.value, icon: 'auto_awesome' })
        ),
        editorText(keyBook)
    );
}
function bottomBar() {
    return _.div({ class: 'at-bottomBar', area: 'bottomBar' }, 'Bottom Bar');
}
export default function bookEditor(ctx = null) {
    const keyBook = readRouteBookKey(ctx);

    return _.div({
        class: 'at-page-bookEditor',
    }, _.div({ class: 'at-content-editor' },
        indexBook(), content(keyBook), rightWorkspace(keyBook)
    ), bottomBar());
}
