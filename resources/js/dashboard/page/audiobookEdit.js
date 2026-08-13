import '../../../css/audiobookEdit.css';

const audiobookBook = _.rod(null);
const audiobookBlocks = _.rod([]);
const activeBlockIndex = _.rod(0);
const activeTab = _.rod('editing');
const audiobookViewMode = _.rod('developer');
const voiceName = _.rod('Narrator');
const voiceTone = _.rod('Warm, cinematic, intimate');
const deliveryNotes = _.rod('Keep a natural pace. Pause briefly after dialogue and preserve the emotional tone.');
const fontSize = _.rod('18');
const lineHeight = _.rod('1.62');
const textColor = _.rod('#182033');
const blockPadding = _.rod('24');
const audioStatus = _.rod(null);
const audioSegments = _.rod([]);
const audioGenerating = _.rod(false);
const ttsProvider = _.rod('coqui-local');
const coquiVoiceId = _.rod('');
const timelineCues = _.rod([]);
const timelineZoom = _.rod(1);
const timelineItems = _.rod([]);
const timelinePlayhead = _.rod(0);
const selectedTimelineItemKey = _.rod(null);
const timelineIsPlaying = _.rod(false);
const trackState = _.rod({ voice: { muted: false, solo: false, locked: false, volume: 80 }, music: { muted: false, solo: false, locked: false, volume: 80 }, fx: { muted: false, solo: false, locked: false, volume: 80 } });
const timelinePlayers = new Map();
let timelineFrame = null;
let timelineStartedAt = 0;
let renderTimeline = null;

function bookKey(ctx) {
    return ctx?.params?.key_book
        || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/audiobook\/edit/)?.[1]
        || null;
}

function activeBlock() {
    return audiobookBlocks.value[activeBlockIndex.value] || null;
}

function wordCount(text) {
    const value = String(text || '').trim();
    return value ? value.split(/\s+/).length : 0;
}

function audioData(payload) {
    if (payload?.data?.data) return payload.data.data;
    if (payload?.data) return payload.data;
    return payload || {};
}

function estimatedSeconds() {
    return Math.max(3, Math.ceil(wordCount(activeBlock()?.text_plain) / 2.35));
}

function editorNodeText(node) {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return Array.isArray(node.content) ? node.content.map(editorNodeText).join('') : '';
}

function audiobookPayload(payload) {
    const topLevel = payload?.data || payload || {};
    const data = topLevel?.data || topLevel || {};
    const blocks = Array.isArray(data.blocks) ? data.blocks : (data.document?.content || []).map((node, index) => ({
        block_uuid: node.attrs?.blockId || `document-${index}`,
        type: node.type === 'heading' ? 'heading' : 'paragraph',
        sort_order: index,
        text_plain: editorNodeText(node),
    }));

    return { book: data.book || null, blocks: blocks.filter((block) => String(block.text_plain || '').trim()) };
}

function selectAudiobookBlock(index, keyBook, openCreateAudio = true) {
    if (!audiobookBlocks.value[index]) return;
    activeBlockIndex.value = index;
    if (openCreateAudio) activeTab.value = 'create';
    loadBlockAudio(keyBook);
    window.requestAnimationFrame(() => document.querySelector(`[data-audiobook-block-index="${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function loadAudiobook(keyBook) {
    if (!keyBook || audiobookBook.value?.key_book === keyBook) return;

    _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/editor`)
        .then((payload) => {
            const data = audiobookPayload(payload);
            audiobookBook.value = data.book;
            audiobookBlocks.value = data.blocks;
            activeBlockIndex.value = 0;
            loadBlockAudio(keyBook);
        })
        .catch((error) => {
            audioStatus.value = { type: 'danger', message: error.message || 'Unable to load the audiobook workspace.' };
        });
}

async function loadTimeline(keyBook) {
    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-timeline`);
        timelineItems.value = audioData(payload).items || [];
        renderTimeline?.();
    } catch { }
}
async function saveTimeline(keyBook, showStatus = true) {
    try {
        const payload = await _.http.putJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-timeline`, { items: timelineItems.value });
        timelineItems.value = audioData(payload).items || timelineItems.value;
        renderTimeline?.();
        if (showStatus) audioStatus.value = { type: 'success', message: 'Timeline saved.' };
        return true;
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to save timeline.' };
        return false;
    }
}
function timelineItemKey(item) { return String(item.id ?? item.client_key ?? ''); }
function timelineSnap(seconds) { return Math.round(Math.max(0, seconds) * 4) / 4; }
function selectedTimelineItem() { return timelineItems.value.find((item) => timelineItemKey(item) === selectedTimelineItemKey.value) || null; }
function updateTimelineItem(key, updater) { timelineItems.value = timelineItems.value.map((item) => timelineItemKey(item) === key ? updater(item) : item); }
function updateSelectedTimelineItem(updater) {
    const item = selectedTimelineItem();
    if (item) updateTimelineItem(timelineItemKey(item), updater);
}
function adjustSelectedTimelineItem(field, delta, max = Infinity) {
    updateSelectedTimelineItem((item) => ({ ...item, [field]: Math.max(0, Math.min(max, Number(item[field] || 0) + delta)) }));
}
function timelineAudioUrl(item) {
    const path = item.audio_path;
    if (!path || path.startsWith('mock://')) return null;
    if (/^https?:\/\//.test(path)) return path;
    return path.startsWith('/') ? path : `/storage/${path.replace(/^storage\//, '')}`;
}
function timelineEnd() { return Math.max(90, ...timelineItems.value.map((item) => (item.start_ms + item.duration_ms) / 1000)); }
function trackCanPlay(track) {
    const states = trackState.value;
    const hasSolo = Object.values(states).some((state) => state.solo);
    return !states[track]?.muted && (!hasSolo || states[track]?.solo);
}
function stopTimelinePlayers() {
    timelinePlayers.forEach((audio) => { audio.pause(); });
    timelinePlayers.clear();
}
function syncTimelinePlayers(playhead, seek = false) {
    const activeKeys = new Set();
    timelineItems.value.filter((item) => item.track === 'voice').forEach((item) => {
        const url = timelineAudioUrl(item);
        const start = item.start_ms / 1000;
        const end = start + item.duration_ms / 1000;
        const key = timelineItemKey(item);
        if (!url || item.muted || !trackCanPlay(item.track) || playhead < start || playhead >= end) {
            timelinePlayers.get(key)?.pause();
            return;
        }
        activeKeys.add(key);
        let audio = timelinePlayers.get(key);
        if (!audio) { audio = new Audio(url); audio.preload = 'auto'; timelinePlayers.set(key, audio); seek = true; }
        const elapsed = (playhead - start) * 1000;
        const remaining = (end - playhead) * 1000;
        const fadeIn = item.fade_in_ms ? Math.min(1, elapsed / item.fade_in_ms) : 1;
        const fadeOut = item.fade_out_ms ? Math.min(1, remaining / item.fade_out_ms) : 1;
        audio.volume = Math.max(0, Math.min(1, ((item.volume ?? 100) / 100) * ((trackState.value[item.track]?.volume ?? 100) / 100) * fadeIn * fadeOut));
        const offset = Math.max(0, (item.trim_start_ms || 0) / 1000 + playhead - start);
        if (seek || Math.abs(audio.currentTime - offset) > .35) {
            try { audio.currentTime = offset; } catch { }
        }
        if (audio.paused) audio.play().catch(() => { });
    });
    timelinePlayers.forEach((audio, key) => { if (!activeKeys.has(key)) { audio.pause(); timelinePlayers.delete(key); } });
}
function stopTimelinePlayback() {
    if (timelineFrame) window.cancelAnimationFrame(timelineFrame);
    timelineFrame = null;
    timelineIsPlaying.value = false;
    stopTimelinePlayers();
}
function startTimelinePlayback(render) {
    if (timelineIsPlaying.value) return;
    const available = timelineItems.value.some((item) => item.track === 'voice' && timelineAudioUrl(item));
    if (!available) audioStatus.value = { type: 'info', message: 'The playhead is running. Generated mock clips do not have a playable audio file yet.' };
    timelineIsPlaying.value = true;
    timelineStartedAt = performance.now() - timelinePlayhead.value * 1000;
    const tick = (now) => {
        const next = (now - timelineStartedAt) / 1000;
        if (next >= timelineEnd()) { timelinePlayhead.value = timelineEnd(); stopTimelinePlayback(); render(); return; }
        timelinePlayhead.value = next;
        syncTimelinePlayers(next);
        render();
        timelineFrame = window.requestAnimationFrame(tick);
    };
    syncTimelinePlayers(timelinePlayhead.value, true);
    timelineFrame = window.requestAnimationFrame(tick);
}
function addTimelineItem(track) {
    const clientKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    timelineItems.value = [...timelineItems.value, { client_key: clientKey, track, label: track === 'music' ? 'Music cue' : track === 'fx' ? 'FX cue' : 'Voice cue', start_ms: timelineItems.value.length * 5000, duration_ms: 5000, trim_start_ms: 0, trim_end_ms: 0, fade_in_ms: 0, fade_out_ms: 0, volume: 80, muted: false }];
    selectedTimelineItemKey.value = clientKey;
}

async function loadBlockAudio(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid) return;

    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio`);
        const data = audioData(payload);
        audioSegments.value = data.segments || [];
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load generated audio clips.' };
    }
}

async function generateSelectedAudio(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid || audioGenerating.value) return;
    const providerKey = ttsProvider.value;
    const model = providerKey === 'coqui-local' ? 'xtts-v2' : 'mock-tts-v1';

    if (providerKey === 'coqui-local' && !coquiVoiceId.value.trim()) {
        audioStatus.value = { type: 'danger', message: 'Enter the Coqui voice reference ID before generating audio.' };
        return;
    }

    audioGenerating.value = true;
    audioStatus.value = { type: 'info', message: 'Coqui is generating the WAV file. Longer paragraphs can take a minute or more.' };
    try {
        const voicesPayload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices`);
        const voices = audioData(voicesPayload).profiles || [];
        let voice = voices.find((profile) => profile.voice_provider === providerKey && profile.voice_id === (providerKey === 'coqui-local' ? coquiVoiceId.value.trim() : 'mock-narrator-01'))
            || voices.find((profile) => profile.voice_provider === providerKey && profile.name.toLowerCase() === voiceName.value.trim().toLowerCase());

        if (!voice) {
            const created = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices`, {
                name: voiceName.value.trim() || 'Narrator',
                role: 'narrator',
                voice_provider: providerKey,
                voice_id: providerKey === 'coqui-local' ? coquiVoiceId.value.trim() : 'mock-narrator-01',
                language: audiobookBook.value?.lang || 'en',
                notes: `${voiceTone.value}\n${deliveryNotes.value}`.trim(),
            });
            voice = audioData(created).profile || null;
        }

        if (!voice?.id) {
            throw new Error('The voice profile was not created correctly. Please try again.');
        }

        await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`, {
            voice_profile_id: voice.id,
        });
        const generated = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generate`, {
            provider_key: providerKey,
            model,
        }, providerKey === 'coqui-local' ? { timeout: 900000, retry: { attempts: 0 } } : undefined);
        const data = audioData(generated);
        audioSegments.value = [data.segment, ...audioSegments.value.filter((segment) => segment.id !== data.segment?.id)];
        const clientKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const startMs = timelineItems.value.length * 4000;
        timelineItems.value = [...timelineItems.value, { client_key: clientKey, book_audio_segment_id: data.segment?.id, audio_path: data.segment?.audio_path, track: 'voice', label: voiceName.value || 'Narration', start_ms: startMs, duration_ms: data.segment?.duration_ms || estimatedSeconds() * 1000, trim_start_ms: 0, trim_end_ms: 0, fade_in_ms: 0, fade_out_ms: 0, volume: 100, muted: false }];
        selectedTimelineItemKey.value = clientKey;
        await saveTimeline(keyBook, false);
        const savedItem = timelineItems.value.find((item) => item.book_audio_segment_id === data.segment?.id);
        selectedTimelineItemKey.value = timelineItemKey(savedItem || { client_key: clientKey });
        timelinePlayhead.value = startMs / 1000;
        renderTimeline?.();
        window.requestAnimationFrame(() => document.querySelector('.at-audioTimelineCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        audioStatus.value = { type: 'success', message: 'Audio clip generated, saved and selected in the Voice track. Press Play in the timeline to listen.' };
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to generate audio for this block.' };
    } finally {
        audioGenerating.value = false;
    }
}

function audioTabs() {
    const tabs = [
        ['editing', 'Audio direction'],
        ['text', 'Style text'],
        ['block', 'Style block'],
        ['create', 'Create audio'],
    ];

    return _.div({ class: 'at-audioTabs' }, tabs.map(([key, label]) => _.button({
        type: 'button',
        class: () => activeTab.value === key ? 'is-active' : '',
        onclick: () => { activeTab.value = key; },
    }, label)));
}

function audioDirection() {
    return _.div({ class: 'at-audioForm' },
        _.Input({ label: 'Character / narrator', model: voiceName, icon: 'record_voice_over' }),
        _.Input({ label: 'Voice direction', model: voiceTone, icon: 'graphic_eq' }),
        _.Textarea({ label: 'Performance prompt', model: deliveryNotes, rows: 7, icon: 'auto_awesome' }),
        _.div({ class: 'at-audioHint' }, 'This direction is attached to the selected manuscript block and is used when the voice is generated.'),
    );
}

function textStyle() {
    return _.div({ class: 'at-audioForm at-audioForm--compact' },
        _.Input({ label: 'Font size', type: 'number', model: fontSize, suffix: 'px' }),
        _.Input({ label: 'Line height', type: 'number', model: lineHeight }),
        _.Input({ label: 'Text color', model: textColor, type: 'color' }),
        _.div({ class: 'at-audioHint' }, 'These styles control the listening preview and the public audiobook reading view.'),
    );
}

function blockStyle() {
    return _.div({ class: 'at-audioForm at-audioForm--compact' },
        _.Input({ label: 'Block padding', type: 'number', model: blockPadding, suffix: 'px' }),
        _.Select({ label: 'Block alignment', options: [{ label: 'Left', value: 'left' }, { label: 'Justified', value: 'justify' }, { label: 'Centered', value: 'center' }] }),
        _.div({ class: 'at-audioHint' }, 'Block style remains separate from the manuscript. It changes only the audiobook player experience.'),
    );
}

function createAudio() {
    const words = wordCount(activeBlock()?.text_plain);
    const seconds = estimatedSeconds();

    return _.div({ class: 'at-audioCreate' },
        _.Select({
            label: 'TTS provider',
            model: ttsProvider,
            options: [
                { label: 'Coqui local · XTTS v2', value: 'coqui-local' },
                { label: 'Test mode · no audio file', value: 'mock' },
            ],
        }),
        () => ttsProvider.value === 'coqui-local' ? _.Input({ label: 'Coqui voice reference ID', model: coquiVoiceId, icon: 'voice_selection', placeholder: 'ID returned by the Coqui TTS service' }) : null,
        _.div({ class: 'at-audioCostGrid' },
            _.div(_.span('Selected text'), _.strong(`${words} words`)),
            _.div(_.span('Estimated duration'), _.strong(`~${seconds}s`)),
            _.div(_.span('AT estimate'), _.strong('1 credit')),
        ),
        _.Alert({ type: 'info', title: 'Draft audio', message: () => ttsProvider.value === 'coqui-local' ? 'Coqui generates a real WAV file for the selected text. The clip is then added to Voice in the timeline.' : 'The generated clip can be repositioned, trimmed or layered with music and effects in the timeline below.' }),
        _.Btn({ color: 'primary', dense: true, icon: 'play_circle', loading: audioGenerating, onClick: () => generateSelectedAudio(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Generate selected audio'),
    );
}

function editorCard() {
    const content = () => ({
        editing: audioDirection,
        text: textStyle,
        block: blockStyle,
        create: createAudio,
    }[activeTab.value] || audioDirection)();

    return _.section({ class: 'at-audioEditorCard' },
        audioTabs(),
        _.div({ class: 'at-audioEditorBody' },
            _.div({ class: 'at-audioBlockMeta' },
                _.span(() => `Block ${activeBlockIndex.value + 1} of ${audiobookBlocks.value.length}`),
                _.strong(() => activeBlock()?.type === 'heading' ? 'Heading' : 'Narration'),
            ),
            () => content(),
        ),
    );
}

function previewCard() {
    const style = () => `font-size:${fontSize.value}px;line-height:${lineHeight.value};color:${textColor.value};padding:${blockPadding.value}px;`;
    const keyBook = window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1];

    return _.section({ class: () => audiobookViewMode.value === 'developer' ? 'at-audioPreviewCard is-developer' : 'at-audioPreviewCard' },
        _.article({ class: 'at-audioReading', style }, () => audiobookBlocks.value.length
            ? audiobookBlocks.value.map((block, index) => _.button({
                type: 'button',
                class: () => `at-audioReadingBlock ${index === activeBlockIndex.value ? 'is-selected' : ''} ${block.type === 'heading' ? 'is-heading' : ''}`,
                'data-audiobook-block-index': index,
                title: 'Select this text to create its audio',
                onclick: () => selectAudiobookBlock(index, keyBook),
            }, block.text_plain))
            : _.p({ class: 'at-audioReadingEmpty' }, audiobookBook.value ? 'This manuscript has no text blocks yet.' : 'Loading manuscript…'),
        ),
    );
}

function drawTimeline(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const labelWidth = 170;
    const rulerHeight = 34;
    const tracks = [['Voice', '#2563eb'], ['Music', '#a855f7'], ['FX', '#f59e0b']];
    const rowHeight = (height - rulerHeight) / tracks.length;
    const duration = 90 / timelineZoom.value;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#172033'; ctx.fillRect(0, 0, labelWidth, height);
    ctx.fillStyle = '#111827'; ctx.fillRect(labelWidth, 0, width - labelWidth, rulerHeight);
    ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'middle';
    for (let second = 0; second <= duration; second += 5) {
        const x = labelWidth + ((width - labelWidth) * second / duration);
        ctx.strokeStyle = second % 10 === 0 ? 'rgba(148,163,184,.34)' : 'rgba(148,163,184,.16)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.fillText(`${second}s`, x + 4, 17);
    }
    tracks.forEach(([name, color], index) => {
        const y = rulerHeight + index * rowHeight;
        ctx.fillStyle = index % 2 ? '#111b2b' : '#142033'; ctx.fillRect(labelWidth, y, width - labelWidth, rowHeight - 1);
        const state = trackState.value[name.toLowerCase()];
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(name, 18, y + rowHeight / 2);
        ctx.fillStyle = state.muted ? '#ef4444' : '#94a3b8'; ctx.fillText('M', 72, y + rowHeight / 2);
        ctx.fillStyle = state.solo ? '#fbbf24' : '#64748b'; ctx.fillText('S', 94, y + rowHeight / 2);
        ctx.fillStyle = state.locked ? '#fbbf24' : '#64748b'; ctx.fillText('L', 116, y + rowHeight / 2);
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, y + rowHeight - 17); ctx.lineTo(128, y + rowHeight - 17); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(18 + (110 * state.volume / 100), y + rowHeight - 17, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.font = '18px Inter, sans-serif'; ctx.fillText('+', 145, y + rowHeight / 2); ctx.font = '11px Inter, sans-serif';
        timelineItems.value.filter((item) => item.track === name.toLowerCase()).forEach((item) => {
            const x = labelWidth + ((width - labelWidth) * (item.start_ms / 1000) / duration);
            const clipWidth = Math.max(28, ((width - labelWidth) * (item.duration_ms / 1000) / duration));
            const selected = timelineItemKey(item) === selectedTimelineItemKey.value;
            ctx.fillStyle = item.muted ? '#64748b' : color; ctx.fillRect(x, y + 9, clipWidth, rowHeight - 19);
            if (selected) {
                ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 10, Math.max(1, clipWidth - 2), rowHeight - 21);
                ctx.fillStyle = '#f8fafc'; ctx.fillRect(x, y + 9, 5, rowHeight - 19); ctx.fillRect(x + clipWidth - 5, y + 9, 5, rowHeight - 19);
            }
            ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let waveX = 6; waveX < clipWidth - 6; waveX += 4) { const waveY = y + rowHeight / 2 + Math.sin((waveX + item.start_ms / 17) * .34) * ((rowHeight - 26) / 4); waveX === 6 ? ctx.moveTo(x + waveX, waveY) : ctx.lineTo(x + waveX, waveY); }
            ctx.stroke();
            const fadeInWidth = Math.min(clipWidth / 2, clipWidth * ((item.fade_in_ms || 0) / Math.max(1, item.duration_ms)));
            const fadeOutWidth = Math.min(clipWidth / 2, clipWidth * ((item.fade_out_ms || 0) / Math.max(1, item.duration_ms)));
            if (fadeInWidth || fadeOutWidth) {
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.25; ctx.beginPath();
                if (fadeInWidth) { ctx.moveTo(x + 2, y + rowHeight - 13); ctx.lineTo(x + fadeInWidth, y + 13); }
                if (fadeOutWidth) { ctx.moveTo(x + clipWidth - fadeOutWidth, y + 13); ctx.lineTo(x + clipWidth - 2, y + rowHeight - 13); }
                ctx.stroke();
            }
            ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillText(item.label, x + 6, y + rowHeight / 2);
        });
    });
    timelineCues.value.forEach((cue) => {
        const x = labelWidth + ((width - labelWidth) * cue / duration);
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 7); ctx.closePath(); ctx.fill();
    });
    const playheadX = labelWidth + ((width - labelWidth) * timelinePlayhead.value / duration);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, height); ctx.stroke();
}

function timelineCard() {
    const canvas = document.createElement('canvas');
    canvas.className = 'at-audioTimelineCanvas';
    const render = () => drawTimeline(canvas);
    renderTimeline = render;
    let drag = null;
    const geometry = (event) => {
        const rect = canvas.getBoundingClientRect();
        const duration = 90 / timelineZoom.value;
        const rowHeight = (rect.height - 34) / 3;
        const track = ['voice', 'music', 'fx'][Math.max(0, Math.min(2, Math.floor((event.clientY - rect.top - 34) / rowHeight)))];
        const seconds = ((event.clientX - rect.left - 170) / (rect.width - 170)) * duration;
        return { rect, duration, rowHeight, track, seconds };
    };
    canvas.addEventListener('pointerdown', (event) => {
        const rect = canvas.getBoundingClientRect();
        const headerX = event.clientX - rect.left;
        const headerY = event.clientY - rect.top;
        if (headerY < 34) {
            const { seconds } = geometry(event);
            timelinePlayhead.value = timelineSnap(seconds);
            if (timelineIsPlaying.value) syncTimelinePlayers(timelinePlayhead.value, true);
            render(); return;
        }
        const { duration, rowHeight, track: trackAt, seconds } = geometry(event);
        if (headerX < 170 && event.clientY - rect.top >= 34) {
            const next = { ...trackState.value, [trackAt]: { ...trackState.value[trackAt] } };
            const trackY = event.clientY - rect.top - 34 - Math.floor((event.clientY - rect.top - 34) / rowHeight) * rowHeight;
            if (trackY > rowHeight - 30 && headerX <= 130) next[trackAt].volume = Math.round(Math.max(0, Math.min(100, ((headerX - 18) / 110) * 100)));
            else if (headerX >= 62 && headerX < 84) next[trackAt].muted = !next[trackAt].muted;
            else if (headerX >= 84 && headerX < 106) next[trackAt].solo = !next[trackAt].solo;
            else if (headerX >= 106 && headerX < 130) next[trackAt].locked = !next[trackAt].locked;
            else if (headerX >= 130) addTimelineItem(trackAt);
            trackState.value = next; render(); return;
        }
        const item = [...timelineItems.value].reverse().find((candidate) => candidate.track === trackAt && seconds >= candidate.start_ms / 1000 && seconds <= (candidate.start_ms + candidate.duration_ms) / 1000);
        if (item) {
            const key = timelineItemKey(item);
            selectedTimelineItemKey.value = key;
            if (!trackState.value[trackAt].locked) {
                const edgeSeconds = Math.max(.35, duration * 10 / Math.max(1, rect.width - 170));
                const clipStart = item.start_ms / 1000;
                const clipEnd = clipStart + item.duration_ms / 1000;
                const mode = seconds - clipStart < edgeSeconds ? 'trim-start' : clipEnd - seconds < edgeSeconds ? 'trim-end' : 'move';
                drag = { key, item, mode, offset: seconds - clipStart, end: clipEnd };
                canvas.setPointerCapture(event.pointerId);
            }
            render(); return;
        }
        selectedTimelineItemKey.value = null;
        timelinePlayhead.value = Math.max(0, timelineSnap(seconds));
        if (timelineIsPlaying.value) syncTimelinePlayers(timelinePlayhead.value, true);
        const cue = Math.round(seconds);
        timelineCues.value = [...timelineCues.value, Math.max(0, cue)].sort((a, b) => a - b);
        render();
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const { track, seconds } = geometry(event);
        const key = drag.key;
        if (drag.mode === 'move') {
            const start = timelineSnap(Math.max(0, seconds - drag.offset));
            updateTimelineItem(key, (item) => ({ ...item, track, start_ms: Math.round(start * 1000) }));
        } else if (drag.mode === 'trim-start') {
            const start = Math.min(drag.end - .25, timelineSnap(seconds));
            updateTimelineItem(key, (item) => ({ ...item, start_ms: Math.round(start * 1000), duration_ms: Math.round((drag.end - start) * 1000), trim_start_ms: Math.max(0, Math.round((item.trim_start_ms || 0) + (start - item.start_ms / 1000) * 1000)) }));
        } else {
            const end = Math.max(drag.item.start_ms / 1000 + .25, timelineSnap(seconds));
            updateTimelineItem(key, (item) => ({ ...item, duration_ms: Math.round((end - item.start_ms / 1000) * 1000), trim_end_ms: Math.max(0, Math.round((drag.item.start_ms / 1000 + drag.item.duration_ms / 1000 - end) * 1000)) }));
        }
        render();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    window.requestAnimationFrame(render);
    window.addEventListener('resize', render, { passive: true });

    return _.section({ class: 'at-audioTimelineCard' },
        _.div({ class: 'at-audioTimelineToolbar' },
            _.div({ class: 'at-audioTimelineTransport' },
                _.Btn({ dense: true, color: 'secondary', icon: 'skip_previous', title: 'Previous block', onClick: () => { activeBlockIndex.value = Math.max(0, activeBlockIndex.value - 1); } }),
                _.Btn({ dense: true, color: 'primary', icon: 'play_arrow', title: 'Play or pause timeline', onClick: () => timelineIsPlaying.value ? stopTimelinePlayback() : startTimelinePlayback(render) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'stop', title: 'Stop timeline', onClick: () => { stopTimelinePlayback(); timelinePlayhead.value = 0; audioStatus.value = null; render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'skip_next', title: 'Next block', onClick: () => { activeBlockIndex.value = Math.min(audiobookBlocks.value.length - 1, activeBlockIndex.value + 1); } }),
                _.span({ class: 'at-audioTimecode' }, () => `00:00:${String(Math.floor(timelinePlayhead.value)).padStart(2, '0')}`),
            ),
            _.div({ class: 'at-audioTimelineActions' },
                _.Btn({ dense: true, color: () => audiobookViewMode.value === 'developer' ? 'primary' : 'secondary', icon: 'code', title: 'Developer view', onClick: () => { audiobookViewMode.value = 'developer'; } }),
                _.Btn({ dense: true, color: () => audiobookViewMode.value === 'preview' ? 'primary' : 'secondary', icon: 'visibility', title: 'Preview view', onClick: () => { audiobookViewMode.value = 'preview'; } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'zoom_in', title: 'Zoom in', onClick: () => { timelineZoom.value = Math.min(2, timelineZoom.value + .25); render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'zoom_out', title: 'Zoom out', onClick: () => { timelineZoom.value = Math.max(.5, timelineZoom.value - .25); render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'library_music', title: 'Add music channel', onClick: () => { addTimelineItem('music'); render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'waves', title: 'Add FX channel', onClick: () => { addTimelineItem('fx'); render(); } }),
                _.Btn({ dense: true, color: 'primary', icon: 'save', title: 'Save timeline', onClick: () => saveTimeline(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }),
            ),
        ),
        _.div({ class: 'at-audioTimelineInspector' },
            _.span({ class: 'at-audioInspectorLabel' }, () => selectedTimelineItem() ? selectedTimelineItem().label : 'No clip selected'),
            _.span(() => selectedTimelineItem() ? `${selectedTimelineItem().track.toUpperCase()} · ${timelineSnap(selectedTimelineItem().start_ms / 1000).toFixed(2)}s` : 'Click a clip to edit'),
            _.span(() => selectedTimelineItem() ? `${timelineSnap(selectedTimelineItem().duration_ms / 1000).toFixed(2)}s` : 'Drag center to move · edges to trim'),
            _.div({ class: 'at-audioClipControls' },
                _.Btn({ dense: true, color: 'secondary', icon: 'volume_off', title: 'Toggle clip mute', onClick: () => updateSelectedTimelineItem((item) => ({ ...item, muted: !item.muted })) }),
                _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `Vol ${selectedTimelineItem().volume ?? 100}%` : 'Vol'),
                _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Lower clip volume', onClick: () => adjustSelectedTimelineItem('volume', -5, 100) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Raise clip volume', onClick: () => adjustSelectedTimelineItem('volume', 5, 100) }),
                _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `In ${selectedTimelineItem().fade_in_ms || 0}ms` : 'Fade in'),
                _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Reduce fade in', onClick: () => adjustSelectedTimelineItem('fade_in_ms', -100) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Increase fade in', onClick: () => { const item = selectedTimelineItem(); adjustSelectedTimelineItem('fade_in_ms', 100, Math.floor((item?.duration_ms || 0) / 2)); } }),
                _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `Out ${selectedTimelineItem().fade_out_ms || 0}ms` : 'Fade out'),
                _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Reduce fade out', onClick: () => adjustSelectedTimelineItem('fade_out_ms', -100) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Increase fade out', onClick: () => { const item = selectedTimelineItem(); adjustSelectedTimelineItem('fade_out_ms', 100, Math.floor((item?.duration_ms || 0) / 2)); } }),
            ),
            _.Btn({ dense: true, color: 'secondary', icon: 'delete_outline', title: 'Remove selected clip', onClick: () => {
                timelineItems.value = timelineItems.value.filter((item) => timelineItemKey(item) !== selectedTimelineItemKey.value);
                selectedTimelineItemKey.value = null;
                render();
            } }),
        ),
        canvas,
    );
}

export default function audiobookEdit(ctx) {
    const keyBook = bookKey(ctx);
    loadAudiobook(keyBook); loadTimeline(keyBook);
    loadBlockAudio(keyBook);

    return _.main({ class: 'at-audiobookPage' },
        _.div({ class: 'at-audiobookTopbar' },
            _.div(_.span({ class: 'at-audiobookEyebrow' }, 'Audiobook studio'), _.h2(() => audiobookBook.value?.name || 'Loading audiobook…')),
            _.div({ class: 'at-audiobookTopbarActions' },
                _.Btn({ color: 'secondary', dense: true, onClick: () => _.router.navigate(`/dashboard/book/${keyBook}/panel`) }, 'Book panel'),
                _.Btn({ color: 'primary', dense: true, icon: 'publish', onClick: () => { audioStatus.value = { type: 'info', message: 'Publishing will create the final Music, Voice and FX master channels.' }; } }, 'Publish audiobook'),
            ),
        ),
        () => audioStatus.value ? _.Alert({ type: audioStatus.value.type, message: audioStatus.value.message }) : null,
        _.div({ class: 'at-audiobookWorkspace' },
            editorCard(),
            previewCard(),
        ),
        () => audiobookBlocks.value.length ? _.div({ class: 'at-audioBlockStrip' }, audiobookBlocks.value.map((block, index) => _.button({ type: 'button', class: () => index === activeBlockIndex.value ? 'is-active' : '', onclick: () => selectAudiobookBlock(index, keyBook, false) }, `${index + 1}. ${block.type === 'heading' ? 'Heading' : 'Narration'}`))) : null,
        timelineCard(),
    );
}
