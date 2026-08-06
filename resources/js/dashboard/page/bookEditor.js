import { Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';


const indexView = _.rod(false);
const commandView = _.rod(false);
const editorReady = _.rod(false);
const editorUiTick = _.rod(0);
const editorPageFormat = _.rod('book');
const editorStatus = _.rod(null);
const saveStatus = _.rod('idle');

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
        .map(withBlockIds);

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
    }, 'Index Book');
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

    const saveDirtyBlocks = async () => {
        if (!keyBook || autosaveBlocked) return;

        if (saveInFlight) {
            pendingSave = true;
            return;
        }

        syncEditorBlocks();

        const blocks = dirtyBlocks();
        const deleted_block_uuids = deletedBlockUuids();

        if (!blocks.length && !deleted_block_uuids.length) {
            setSaveStatus('saved');
            return;
        }

        saveInFlight = true;
        pendingSave = false;
        setSaveStatus('saving');

        try {
            const payload = await _.http.patchJSON(`/dashboard/api/books/${keyBook}/blocks`, {
                source: 'manual',
                blocks,
                deleted_block_uuids,
            });

            updateBlockMetaFromSaved(payload.data?.blocks || [], blocks);
            (payload.data?.deleted_block_uuids || []).forEach((blockUuid) => {
                const meta = blockMeta.get(blockUuid);
                if (!meta) return;

                blockMeta.set(blockUuid, {
                    ...meta,
                    status: 'deleted',
                });
            });
            setSaveStatus('saved');
        } catch (error) {
            const statusCode = error?.response?.status || error?.status;

            if (statusCode === 409) {
                autosaveBlocked = true;
                setSaveStatus('conflict');
            } else {
                setSaveStatus('error');
            }
        } finally {
            saveInFlight = false;

            if (pendingSave && !autosaveBlocked) {
                pendingSave = false;
                saveDirtyBlocks();
            }
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
            refreshEditorUi();
            return;
        }

        syncEditorBlocks();
        scheduleAutosave();
        refreshEditorUi();
    };

    const afterEditorCreate = () => {
        syncEditorBlocks();
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
            onSelectionUpdate: refreshEditorUi,
        });

        applyRemoteContent();
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
function navCommand() {
    return _.div({ class: () => !commandView.value ? 'at-navCommand cms-d-none' : 'at-navCommand', area: 'navCommand' }, 'Nav Command');
}
function bottomBar() {
    return _.div({ class: 'at-bottomBar', area: 'bottomBar' }, 'Bottom Bar');
}
export default function bookEditor(ctx = null) {
    const keyBook = readRouteBookKey(ctx);

    return _.div({
        class: 'at-page-bookEditor',
    }, _.div({ class: 'at-content-editor' },
        indexBook(), content(keyBook), navCommand()
    ), bottomBar());
}
