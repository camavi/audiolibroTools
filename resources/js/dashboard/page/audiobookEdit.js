import '../../../css/audiobookEdit.css';

const audiobookBook = _.rod(null);
const audiobookBlocks = _.rod([]);
const activeBlockIndex = _.rod(0);
const activeTab = _.rod('create');
const audiobookViewMode = _.rod('developer');
const voiceName = _.rod('Narrator');
const voiceTone = _.rod('Warm, cinematic, intimate');
const deliveryNotes = _.rod('Keep a natural pace. Pause briefly after dialogue and preserve the emotional tone.');
const bookDesign = _.rod(null);
const designStyleKey = _.rod('body');
const designSaving = _.rod(false);
const designStatus = _.rod(null);
const designFields = {
    font_family: _.rod('Instrument Sans'), font_size: _.rod('18'), line_height: _.rod('1.62'),
    font_weight: _.rod('400'), font_style: _.rod('normal'), color: _.rod('#182033'),
    text_align: _.rod('left'), letter_spacing: _.rod('0'), text_transform: _.rod('none'),
    space_before: _.rod('0'), space_after: _.rod('16'),
};
const layoutFields = { content_padding: _.rod('24'), paragraph_gap: _.rod('16'), content_width: _.rod('760') };
const audioStatus = _.rod(null);
const publishResult = _.rod(null);
const publishRunning = _.rod(false);
const audioSegments = _.rod([]);
const audioGroups = _.rod([]);
const expandedAudioGroupIds = _.rod([]);
const previewingAudioGroupId = _.rod(null);
let generatedAudioPreview = null;
let audioPollingTimer = null;
const audioGenerating = _.rod(false);
const qwenModel = _.rod('quality');
const bookAudioGenerating = _.rod(false);
const allAudioInserting = _.rod(false);
const selectedLibraryVoice = _.rod(null);
const voiceProfiles = _.rod([]);
const blockVoiceAssignment = _.rod(null);
const generatorSettings = _.rod(null);
const voiceProfilesLoading = _.rod(false);
const timelineCues = _.rod([]);
const timelineZoom = _.rod(1);
const timelineItems = _.rod([]);
const timelinePlayhead = _.rod(0);
const timelineLoopRange = _.rod(null);
const selectedTimelineItemKey = _.rod(null);
const selectedTimelineItemKeys = _.rod([]);
const expandedTimelineGroupKey = _.rod(null);
const timelineUndoStack = _.rod([]);
const timelineRedoStack = _.rod([]);
const timelineIsPlaying = _.rod(false);
const timelinePersistence = _.rod('saved');
const readingPlayback = _.rod(null);
const trackState = _.rod({ voice: { muted: false, solo: false, locked: false, volume: 80 }, music: { muted: false, solo: false, locked: false, volume: 80 }, fx: { muted: false, solo: false, locked: false, volume: 80 } });
const timelinePlayers = new Map();
const timelineWaveforms = new Map();
const pendingTimelineWaveforms = new Set();
let timelineAudioContext = null;
let timelineFrame = null;
let timelineStartedAt = 0;
let timelinePausedAt = null;
let renderTimeline = null;
let timelineSaveTimer = null;
const timelineTracks = [
    { key: 'voice', label: 'Voice', color: '#2563eb' },
    { key: 'music', label: 'Music', color: '#a855f7' },
    { key: 'fx', label: 'FX', color: '#f59e0b' },
];

function bookKey(ctx) {
    return ctx?.params?.key_book
        || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/audiobook\/edit/)?.[1]
        || null;
}

function activeBlock() {
    return audiobookBlocks.value[activeBlockIndex.value] || null;
}

const defaultBookDesign = () => ({
    version: 1,
    styles: {
        body: { font_family: 'Instrument Sans', font_size: 18, line_height: 1.62, font_weight: '400', font_style: 'normal', color: '#182033', text_align: 'left', letter_spacing: 0, text_transform: 'none', space_before: 0, space_after: 16 },
        chapter_title: { inherits: 'body', font_size: 34, line_height: 1.15, font_weight: '700', space_before: 36, space_after: 22 },
        heading: { inherits: 'body', font_size: 26, line_height: 1.25, font_weight: '700', space_before: 28, space_after: 14 },
        quote: { inherits: 'body', font_style: 'italic', color: '#405a7d', space_before: 18, space_after: 18 },
    },
    layout: { content_padding: 24, paragraph_gap: 16, content_width: 760 },
});

function cloneDesign(value) {
    return JSON.parse(JSON.stringify(value || defaultBookDesign()));
}

function resolvedBookStyle(styleKey, design = bookDesign.value) {
    const source = design || defaultBookDesign();
    return { ...(source.styles?.body || defaultBookDesign().styles.body), ...(styleKey === 'body' ? {} : (source.styles?.[styleKey] || {})) };
}

function hydrateDesignForm(styleKey = designStyleKey.value) {
    const style = resolvedBookStyle(styleKey);
    const layout = bookDesign.value?.layout || defaultBookDesign().layout;
    CMSwift.reactive.untracked(() => {
        Object.entries(designFields).forEach(([key, model]) => { model.value = String(style[key] ?? ''); });
        Object.entries(layoutFields).forEach(([key, model]) => { model.value = String(layout[key] ?? ''); });
    });
}

function setDesignStyle(styleKey) {
    designStyleKey.value = styleKey;
    hydrateDesignForm(styleKey);
}

function designWithDraft() {
    const design = cloneDesign(bookDesign.value);
    const key = designStyleKey.value;
    const numericStyleFields = ['font_size', 'line_height', 'letter_spacing', 'space_before', 'space_after'];
    const values = Object.fromEntries(Object.entries(designFields).map(([name, model]) => [name, numericStyleFields.includes(name) ? Number(model.value) : model.value]));
    const body = resolvedBookStyle('body', design);
    design.styles[key] = key === 'body'
        ? values
        : { inherits: 'body', ...Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== body[name])) };
    design.layout = Object.fromEntries(Object.entries(layoutFields).map(([name, model]) => [name, Number(model.value)]));
    return design;
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

function bookAudioMetrics() {
    const blocks = audiobookBlocks.value.filter((block) => String(block.text_plain || '').trim());
    const words = blocks.reduce((total, block) => total + wordCount(block.text_plain), 0);
    return { blocks: blocks.length, words, seconds: Math.max(0, Math.ceil(words / 2.35)), credits: blocks.length };
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

function selectAudiobookBlock(index, keyBook) {
    if (!audiobookBlocks.value[index]) return;
    activeBlockIndex.value = index;
    loadBlockAudio(keyBook);
    window.requestAnimationFrame(() => document.querySelector(`[data-audiobook-block-index="${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

async function loadVoiceProfiles(keyBook) {
    if (!keyBook || voiceProfilesLoading.value) return;
    voiceProfilesLoading.value = true;
    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices`);
        voiceProfiles.value = audioData(payload).profiles || [];
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load characters and voices.' };
    } finally {
        voiceProfilesLoading.value = false;
    }
}

function loadAudiobook(keyBook) {
    if (!keyBook || audiobookBook.value?.key_book === keyBook) return;

    _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/editor`)
        .then((payload) => {
            const data = audiobookPayload(payload);
            audiobookBook.value = data.book;
            bookDesign.value = cloneDesign(data.book?.book_design_json);
            hydrateDesignForm();
            audiobookBlocks.value = data.blocks;
            activeBlockIndex.value = 0;
            loadVoiceProfiles(keyBook);
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
        selectedTimelineItemKey.value = null;
        selectedTimelineItemKeys.value = [];
        timelineUndoStack.value = [];
        timelineRedoStack.value = [];
        renderTimeline?.();
    } catch { }
}
async function saveTimeline(keyBook, showStatus = true) {
    timelinePersistence.value = 'saving';
    try {
        const payload = await _.http.putJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-timeline`, { items: timelineItems.value });
        timelineItems.value = audioData(payload).items || timelineItems.value;
        timelinePersistence.value = 'saved';
        renderTimeline?.();
        if (showStatus) audioStatus.value = { type: 'success', message: 'Timeline saved.' };
        return true;
    } catch (error) {
        timelinePersistence.value = 'error';
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to save timeline.' };
        return false;
    }
}
function scheduleTimelineSave(keyBook) {
    if (!keyBook) return;
    if (timelineSaveTimer) window.clearTimeout(timelineSaveTimer);
    timelinePersistence.value = 'saving';
    timelineSaveTimer = window.setTimeout(() => {
        timelineSaveTimer = null;
        saveTimeline(keyBook, false);
    }, 550);
}
function timelineItemKey(item) { return String(item.id ?? item.client_key ?? ''); }
function newTimelineClientKey() { return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function timelineSnapshot() { return JSON.parse(JSON.stringify(timelineItems.value)); }
function rememberTimelineSnapshot(snapshot = timelineSnapshot()) {
    const previous = timelineUndoStack.value.at(-1);
    if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
    timelineUndoStack.value = [...timelineUndoStack.value.slice(-49), snapshot];
    timelineRedoStack.value = [];
}
function restoreTimelineSnapshot(snapshot, keyBook) {
    const currentIds = new Set(timelineItems.value.map((item) => Number(item.id)).filter(Boolean));
    timelineItems.value = snapshot.map((item) => item.id && !currentIds.has(Number(item.id))
        ? { ...item, id: null, client_key: newTimelineClientKey() }
        : { ...item });
    selectedTimelineItemKey.value = null;
    selectedTimelineItemKeys.value = [];
    renderTimeline?.();
    scheduleTimelineSave(keyBook);
}
function undoTimeline(keyBook) {
    const snapshot = timelineUndoStack.value.at(-1);
    if (!snapshot) return;
    timelineRedoStack.value = [...timelineRedoStack.value.slice(-49), timelineSnapshot()];
    timelineUndoStack.value = timelineUndoStack.value.slice(0, -1);
    restoreTimelineSnapshot(snapshot, keyBook);
    audioStatus.value = { type: 'info', message: 'Timeline change undone.' };
}
function redoTimeline(keyBook) {
    const snapshot = timelineRedoStack.value.at(-1);
    if (!snapshot) return;
    timelineUndoStack.value = [...timelineUndoStack.value.slice(-49), timelineSnapshot()];
    timelineRedoStack.value = timelineRedoStack.value.slice(0, -1);
    restoreTimelineSnapshot(snapshot, keyBook);
    audioStatus.value = { type: 'info', message: 'Timeline change restored.' };
}
function timelineSnap(seconds) { return Math.round(Math.max(0, seconds) * 4) / 4; }
function timelineLaneLayout() {
    return timelineTracks.flatMap((track) => {
        const count = Math.max(1, ...timelineItems.value.filter((item) => item.track === track.key).map((item) => Number(item.lane || 0) + 1));
        return Array.from({ length: count }, (_, lane) => ({ ...track, lane }));
    });
}
function rangesOverlap(startA, durationA, startB, durationB) {
    return startA < startB + durationB && startA + durationA > startB;
}
function timelineTrackOverlaps(track, startMs, durationMs, ignoreKey = null) {
    const ignoredKeys = new Set(Array.isArray(ignoreKey) ? ignoreKey : [ignoreKey]);
    return timelineItems.value.some((item) => !ignoredKeys.has(timelineItemKey(item))
        && item.track === track
        && rangesOverlap(startMs, durationMs, Number(item.start_ms || 0), Number(item.duration_ms || 0)));
}
function firstAvailableTimelineLane(track, startMs, durationMs, ignoreKey = null, preferredLane = null) {
    const ignoredKeys = new Set(Array.isArray(ignoreKey) ? ignoreKey : [ignoreKey]);
    const lanes = Array.from({ length: 41 }, (_, lane) => lane);
    if (Number.isInteger(preferredLane) && preferredLane >= 0 && preferredLane <= 40) {
        lanes.splice(lanes.indexOf(preferredLane), 1);
        lanes.unshift(preferredLane);
    }
    for (const lane of lanes) {
        const occupied = timelineItems.value.some((item) => !ignoredKeys.has(timelineItemKey(item)) && item.track === track && Number(item.lane || 0) === lane && rangesOverlap(startMs, durationMs, Number(item.start_ms || 0), Number(item.duration_ms || 0)));
        if (!occupied) return lane;
    }
    return 0;
}
function timelineMagnetPoints(ignoreKey = null) {
    const ignoredKeys = new Set(Array.isArray(ignoreKey) ? ignoreKey : [ignoreKey]);
    const points = [0, timelinePlayhead.value, ...timelineCues.value];
    timelineItems.value.forEach((item) => {
        if (ignoredKeys.has(timelineItemKey(item))) return;
        points.push(item.start_ms / 1000, (item.start_ms + item.duration_ms) / 1000);
        if (item.is_group) timelinePlayableParts(item).forEach((part) => points.push((item.start_ms + part.timeline_offset_ms) / 1000, (item.start_ms + part.timeline_offset_ms + part.playable_duration_ms) / 1000));
    });
    return points;
}
function magnetizeTimelineTime(seconds, duration, ignoreKey = null) {
    const threshold = Math.max(.08, .25 / timelineZoom.value);
    const target = timelineSnap(seconds);
    const closest = timelineMagnetPoints(ignoreKey)
        .map((point) => ({ point, distance: Math.abs(point - target) }))
        .sort((a, b) => a.distance - b.distance)[0];
    return closest && closest.distance <= threshold ? Math.max(0, closest.point) : target;
}
function selectedTimelineItems() {
    const keys = new Set(selectedTimelineItemKeys.value);
    return timelineItems.value.filter((item) => keys.has(timelineItemKey(item)));
}
function selectedTimelineItem() { return timelineItems.value.find((item) => timelineItemKey(item) === selectedTimelineItemKey.value) || selectedTimelineItems()[0] || null; }
function selectTimelineItem(item, additive = false) {
    const key = timelineItemKey(item);
    selectedTimelineItemKey.value = key;
    selectedTimelineItemKeys.value = additive
        ? (selectedTimelineItemKeys.value.includes(key) ? selectedTimelineItemKeys.value : [...selectedTimelineItemKeys.value, key])
        : [key];
    const blockIndex = audiobookBlocks.value.findIndex((block) => block.block_uuid === item.block_uuid);
    if (blockIndex >= 0) activeBlockIndex.value = blockIndex;
}
function isTimelineGroupExpanded(item) { return item?.is_group && expandedTimelineGroupKey.value === timelineItemKey(item); }
function toggleTimelineGroup(item) {
    if (!item?.is_group) return;
    const key = timelineItemKey(item);
    expandedTimelineGroupKey.value = expandedTimelineGroupKey.value === key ? null : key;
}
function updateTimelineItem(key, updater) { timelineItems.value = timelineItems.value.map((item) => timelineItemKey(item) === key ? updater(item) : item); }
function updateSelectedTimelineItem(updater) {
    const items = selectedTimelineItems();
    if (!items.length) return;
    const keys = new Set(items.map(timelineItemKey));
    rememberTimelineSnapshot();
    timelineItems.value = timelineItems.value.map((item) => keys.has(timelineItemKey(item)) ? updater(item) : item);
    scheduleTimelineSave(bookKey());
    renderTimeline?.();
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

function stopGeneratedAudioPreview() {
    if (generatedAudioPreview) {
        generatedAudioPreview.pause();
        generatedAudioPreview.onended = null;
        generatedAudioPreview.onerror = null;
        generatedAudioPreview = null;
    }
    previewingAudioGroupId.value = null;
}

function previewGeneratedAudioGroup(group) {
    if (Number(previewingAudioGroupId.value) === Number(group.id)) {
        stopGeneratedAudioPreview();
        return;
    }

    stopGeneratedAudioPreview();
    const urls = (group.segments || []).map(timelineAudioUrl).filter(Boolean);
    if (!urls.length) {
        audioStatus.value = { type: 'warning', message: 'This generated master has no playable audio.' };
        return;
    }

    let index = 0;
    previewingAudioGroupId.value = Number(group.id);
    const playNext = () => {
        if (Number(previewingAudioGroupId.value) !== Number(group.id)) return;
        const player = new Audio(urls[index]);
        generatedAudioPreview = player;
        player.onended = () => {
            index += 1;
            if (index < urls.length) playNext(); else stopGeneratedAudioPreview();
        };
        player.onerror = () => {
            audioStatus.value = { type: 'warning', message: 'Unable to play this generated audio preview.' };
            stopGeneratedAudioPreview();
        };
        player.play().catch(() => stopGeneratedAudioPreview());
    };
    playNext();
}
function timelineAudioParts(item) {
    const parts = Array.isArray(item.group_segments) && item.group_segments.length ? item.group_segments : [item];
    let offset = 0;
    return parts.map((part) => {
        const explicitOffset = Number(part.timeline_offset_ms);
        const output = { ...part, offset_ms: Number.isFinite(explicitOffset) ? explicitOffset : offset };
        offset = Math.max(offset, output.offset_ms + Number(part.duration_ms || 0) + Number(part.pause_after_ms || 0));
        return output;
    });
}
function timelineSourceDuration(item) {
    return Number(item.duration_ms || 0) + Number(item.trim_start_ms || 0) + Number(item.trim_end_ms || 0);
}
function timelinePlayableParts(item) {
    const trimStart = Math.max(0, Number(item.trim_start_ms || 0));
    const trimEnd = Math.max(trimStart, timelineSourceDuration(item) - Math.max(0, Number(item.trim_end_ms || 0)));
    return timelineAudioParts(item).flatMap((part) => {
        const partStart = Number(part.offset_ms || 0);
        const partEnd = partStart + Number(part.duration_ms || 0);
        const visibleStart = Math.max(trimStart, partStart);
        const visibleEnd = Math.min(trimEnd, partEnd);
        if (visibleEnd <= visibleStart) return [];
        return [{
            ...part,
            media_offset_ms: Number(part.media_offset_ms || 0) + visibleStart - partStart,
            timeline_offset_ms: visibleStart - trimStart,
            playable_duration_ms: visibleEnd - visibleStart,
        }];
    });
}

function timelineWaveform(url) {
    if (!url || timelineWaveforms.has(url) || pendingTimelineWaveforms.has(url)) return timelineWaveforms.get(url) || null;
    pendingTimelineWaveforms.add(url);
    // CMSwift's JSON helpers intentionally parse response bodies. A WAV must be
    // decoded as an ArrayBuffer by the browser Web Audio API, so this is the
    // one technical use of fetch in the dashboard.
    fetch(url)
        .then((response) => {
            if (!response.ok) throw new Error(`Unable to read audio (${response.status})`);
            return response.arrayBuffer();
        })
        .then(async (buffer) => {
            timelineAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
            const decoded = await timelineAudioContext.decodeAudioData(buffer.slice(0));
            const buckets = Math.min(360, Math.max(48, Math.ceil(decoded.duration * 90)));
            const samples = Array.from({ length: buckets }, (_, bucket) => {
                const start = Math.floor((bucket / buckets) * decoded.length);
                const end = Math.max(start + 1, Math.floor(((bucket + 1) / buckets) * decoded.length));
                let peak = 0;
                for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
                    const channelData = decoded.getChannelData(channel);
                    for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(channelData[index] || 0));
                }
                return peak;
            });
            timelineWaveforms.set(url, samples);
        })
        .catch(() => timelineWaveforms.set(url, []))
        .finally(() => {
            pendingTimelineWaveforms.delete(url);
            renderTimeline?.();
        });
    return null;
}

function drawWaveform(ctx, samples, x, y, width, height, tint) {
    const center = y + height / 2;
    const maxHeight = Math.max(3, height / 2 - 5);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 3, y + 3, Math.max(0, width - 6), Math.max(0, height - 6)); ctx.clip();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1;
    if (samples?.length) {
        samples.forEach((sample, index) => {
            const sampleX = x + 4 + ((width - 8) * index / Math.max(1, samples.length - 1));
            const amplitude = Math.max(1, sample * maxHeight);
            ctx.beginPath(); ctx.moveTo(sampleX, center - amplitude); ctx.lineTo(sampleX, center + amplitude); ctx.stroke();
        });
    } else {
        ctx.beginPath();
        for (let waveX = 6; waveX < width - 6; waveX += 4) {
            const waveY = center + Math.sin((waveX + x) * .34) * (maxHeight * .55);
            waveX === 6 ? ctx.moveTo(x + waveX, waveY) : ctx.lineTo(x + waveX, waveY);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawTimelineClipWaveforms(ctx, item, x, y, width, height) {
    const parts = timelinePlayableParts(item);
    parts.forEach((part) => {
        const partX = x + width * (part.timeline_offset_ms / Math.max(1, item.duration_ms));
        const partWidth = width * (Number(part.playable_duration_ms || 0) / Math.max(1, item.duration_ms));
        if (partWidth < 3) return;
        const url = timelineAudioUrl(part);
        const samples = url ? timelineWaveform(url) : null;
        drawWaveform(ctx, samples, partX, y, partWidth, height, 'rgba(255,255,255,.56)');
    });
}
function timelineContentEnd() { return Math.max(0, ...timelineItems.value.map((item) => (item.start_ms + item.duration_ms) / 1000)); }
function timelineEnd() { return Math.max(90, timelineContentEnd()); }
function timelineDisplayDuration() { return Math.max(90 / timelineZoom.value, timelineContentEnd() + 5); }
function timelineCanvasWidth(canvas, duration) {
    const viewportWidth = Math.max(1, canvas.parentElement?.clientWidth || canvas.clientWidth || 1);
    return Math.ceil(Math.max(viewportWidth, viewportWidth * timelineZoom.value * duration / 90));
}
function timelineClipGainY(clipY, clipHeight, volume) {
    const level = Math.max(0, Math.min(1, Number(volume ?? 100) / 100));
    return clipY + clipHeight * (1 - level);
}
function selectedTimelineLoopRange() {
    const selection = selectedTimelineItems();
    if (!selection.length) return null;
    const start = Math.min(...selection.map((item) => Number(item.start_ms || 0) / 1000));
    const end = Math.max(...selection.map((item) => (Number(item.start_ms || 0) + Number(item.duration_ms || 0)) / 1000));
    return end > start ? { start, end } : null;
}
function toggleTimelineLoop() {
    const range = selectedTimelineLoopRange();
    if (!range) {
        audioStatus.value = { type: 'info', message: 'Select one or more clips to set the loop range.' };
        return;
    }
    const current = timelineLoopRange.value;
    const sameRange = current && Math.abs(current.start - range.start) < .01 && Math.abs(current.end - range.end) < .01;
    timelineLoopRange.value = sameRange ? null : range;
    audioStatus.value = { type: 'info', message: sameRange ? 'Loop disabled.' : `Loop set from ${range.start.toFixed(2)}s to ${range.end.toFixed(2)}s.` };
    renderTimeline?.();
}
function trackCanPlay(track) {
    const states = trackState.value;
    const hasSolo = Object.values(states).some((state) => state.solo);
    return !states[track]?.muted && (!hasSolo || states[track]?.solo);
}
function pauseTimelinePlayers() {
    timelinePlayers.forEach((audio) => {
        audio.pause();
        if (audio._atSeekFallback) window.clearTimeout(audio._atSeekFallback);
        audio._atSeekFallback = null;
    });
}
function stopTimelinePlayers() {
    pauseTimelinePlayers();
    timelinePlayers.forEach((audio) => { audio._atTimelineActive = false; });
    timelinePlayers.clear();
}
function timelinePartPlayerKey(item, part) {
    return `${timelineItemKey(item)}:${part.id || part.offset_ms}`;
}
function prepareTimelinePlayer(key, url) {
    let audio = timelinePlayers.get(key);
    if (audio) return audio;
    audio = new Audio(url);
    audio.preload = 'auto';
    audio._atTimelineActive = false;
    audio._atTimelineTargetTime = 0;
    audio._atWaitingForSeek = false;
    audio._atSeekFallback = null;
    // Wait for the browser to finish seeking before calling play(). Starting
    // first can make some browsers briefly (or permanently) play from zero.
    audio.addEventListener('loadedmetadata', () => {
        resumeTimelinePlayerAfterSeek(audio);
    });
    audio.addEventListener('seeked', () => resumeTimelinePlayerAfterSeek(audio));
    audio.addEventListener('canplay', () => resumeTimelinePlayerAfterSeek(audio));
    audio.load();
    timelinePlayers.set(key, audio);
    return audio;
}
function playTimelinePlayer(audio) {
    if (audio._atTimelineActive && timelineIsPlaying.value && audio.paused) audio.play().catch(() => { });
}
function resumeTimelinePlayerAfterSeek(audio) {
    if (!audio._atTimelineActive || !timelineIsPlaying.value || !audio._atWaitingForSeek) return;
    const target = Number(audio._atTimelineTargetTime || 0);
    // The transport continues to advance while metadata loads. Seek once more
    // when necessary so the resumed sound follows the visible playhead.
    if (Math.abs(audio.currentTime - target) > .04) {
        try { audio.currentTime = target; } catch { }
        return;
    }
    audio._atWaitingForSeek = false;
    if (audio._atSeekFallback) window.clearTimeout(audio._atSeekFallback);
    audio._atSeekFallback = null;
    playTimelinePlayer(audio);
}
function seekTimelinePlayer(audio, mediaTime) {
    const duration = Number(audio.duration);
    const maximum = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - .01) : Infinity;
    audio._atTimelineTargetTime = Math.min(maximum, Math.max(0, mediaTime));
    if (audio.readyState < 1) {
        audio._atWaitingForSeek = true;
        return false;
    }
    if (Math.abs(audio.currentTime - audio._atTimelineTargetTime) <= .04) {
        audio._atWaitingForSeek = false;
        return true;
    }
    audio._atWaitingForSeek = true;
    if (audio._atSeekFallback) window.clearTimeout(audio._atSeekFallback);
    try { audio.currentTime = audio._atTimelineTargetTime; } catch {
        audio._atWaitingForSeek = false;
        return true;
    }
    // Some WAV/browser combinations update currentTime but do not dispatch
    // seeked. Do not leave the transport silent while it waits for that event.
    audio._atSeekFallback = window.setTimeout(() => resumeTimelinePlayerAfterSeek(audio), 180);
    return false;
}
function preloadTimelinePlayers() {
    timelineItems.value.forEach((item) => timelinePlayableParts(item).forEach((part) => {
        const url = timelineAudioUrl(part);
        if (url) prepareTimelinePlayer(timelinePartPlayerKey(item, part), url);
    }));
}
function syncTimelinePlayers(playhead, seek = false) {
    const activeKeys = new Set();
    let nextReading = null;
    // Every timeline channel uses the same transport. Voice additionally
    // updates the manuscript reading highlight, while Music and FX simply
    // mix into the playback at their own timeline positions.
    timelineItems.value.forEach((item) => timelinePlayableParts(item).forEach((part) => {
        const url = timelineAudioUrl(part);
        const start = (item.start_ms + part.timeline_offset_ms) / 1000;
        const end = start + Number(part.playable_duration_ms || 0) / 1000;
        const key = timelinePartPlayerKey(item, part);
        if (!url || item.muted || part.muted || !trackCanPlay(item.track) || playhead < start || playhead >= end) {
            const inactiveAudio = timelinePlayers.get(key);
            if (inactiveAudio) { inactiveAudio.pause(); inactiveAudio._atTimelineActive = false; }
            return;
        }
        activeKeys.add(key);
        const audio = prepareTimelinePlayer(key, url);
        const elapsedMs = Math.max(0, (playhead - item.start_ms / 1000) * 1000);
        const remainingMs = Math.max(0, Number(item.duration_ms || 0) - elapsedMs);
        const fadeInGain = Number(item.fade_in_ms || 0) > 0 ? Math.min(1, elapsedMs / Number(item.fade_in_ms)) : 1;
        const fadeOutGain = Number(item.fade_out_ms || 0) > 0 ? Math.min(1, remainingMs / Number(item.fade_out_ms)) : 1;
        const offset = Math.max(0, playhead - start);
        const partFadeInGain = Number(part.fade_in_ms || 0) > 0 ? Math.min(1, offset * 1000 / Number(part.fade_in_ms)) : 1;
        const partRemainingMs = Math.max(0, Number(part.playable_duration_ms || 0) - offset * 1000);
        const partFadeOutGain = Number(part.fade_out_ms || 0) > 0 ? Math.min(1, partRemainingMs / Number(part.fade_out_ms)) : 1;
        audio.volume = Math.max(0, Math.min(1, ((item.volume ?? 100) / 100) * ((part.volume ?? 100) / 100) * ((trackState.value[item.track]?.volume ?? 100) / 100) * fadeInGain * fadeOutGain * partFadeInGain * partFadeOutGain));
        const offsetMs = Math.round(part.media_offset_ms + offset * 1000);
        const word = item.track === 'voice' && Array.isArray(part.word_timings)
            ? part.word_timings.find((timing) => offsetMs >= Number(timing.start_ms || 0) && offsetMs < Number(timing.end_ms || 0))
            : null;
        if (word && item.block_uuid && Number.isInteger(Number(word.source_start)) && Number.isInteger(Number(word.source_end))) {
            nextReading = { blockUuid: item.block_uuid, start: Number(word.source_start), end: Number(word.source_end) };
        }
        const mediaTime = part.media_offset_ms / 1000 + offset;
        // Do not continuously compare currentTime to the requestAnimationFrame
        // transport. Browser decoding can lag a little; seeking every frame
        // then restarts the WAV over and over, producing a short sound followed
        // by silence. A clip only needs a seek when it becomes active or after
        // a deliberate playhead jump/loop.
        const needsSeek = seek || !audio._atTimelineActive;
        audio._atTimelineActive = true;
        if (needsSeek && !seekTimelinePlayer(audio, mediaTime)) return;
        if (audio._atWaitingForSeek) return;
        playTimelinePlayer(audio);
    }));
    timelinePlayers.forEach((audio, key) => {
        if (!activeKeys.has(key)) { audio.pause(); audio._atTimelineActive = false; }
    });
    const current = readingPlayback.value;
    if (!current || !nextReading || current.blockUuid !== nextReading.blockUuid || current.start !== nextReading.start || current.end !== nextReading.end) {
        readingPlayback.value = nextReading;
    }
}
function pauseTimelinePlayback() {
    if (timelineFrame) window.cancelAnimationFrame(timelineFrame);
    timelineFrame = null;
    timelineIsPlaying.value = false;
    // Keep the decoded media alive. Recreating an HTMLAudioElement at resume
    // can start it at zero before metadata makes the requested seek available.
    pauseTimelinePlayers();
    timelinePausedAt = timelinePlayhead.value;
    readingPlayback.value = null;
}
function stopTimelinePlayback() {
    pauseTimelinePlayback();
    stopTimelinePlayers();
    timelinePlayhead.value = 0;
    timelinePausedAt = null;
}
function setTimelinePlayhead(seconds) {
    timelinePlayhead.value = Math.max(0, timelineSnap(seconds));
    // A click is an explicit seek, not a continuation of the last Pause.
    timelinePausedAt = null;
    if (!timelineIsPlaying.value) return;
    timelineStartedAt = performance.now() - timelinePlayhead.value * 1000;
    syncTimelinePlayers(timelinePlayhead.value, true);
}
function startTimelinePlayback(render) {
    if (timelineIsPlaying.value) return;
    // A real resume must use the browser's retained currentTime. This avoids
    // re-seeking a WAV after Pause, which can cause playback to restart at 0.
    const resumePausedPlayers = timelinePausedAt !== null && Math.abs(timelinePlayhead.value - timelinePausedAt) < .04;
    timelinePausedAt = null;
    const available = timelineItems.value.some((item) => timelineAudioUrl(item));
    if (!available) audioStatus.value = { type: 'info', message: 'The playhead is running. There are no playable audio files in the timeline yet.' };
    // Qwen creates many short WAV parts. Preloading them prevents a network
    // and decoder gap each time playback moves to the next spoken segment.
    preloadTimelinePlayers();
    timelineIsPlaying.value = true;
    timelineStartedAt = performance.now() - timelinePlayhead.value * 1000;
    const tick = (now) => {
        let next = (now - timelineStartedAt) / 1000;
        const loop = timelineLoopRange.value;
        if (loop && next >= loop.end) {
            next = loop.start;
            timelineStartedAt = now - loop.start * 1000;
            syncTimelinePlayers(next, true);
        }
        if (next >= timelineEnd()) { timelinePlayhead.value = timelineEnd(); pauseTimelinePlayback(); render(); return; }
        timelinePlayhead.value = next;
        syncTimelinePlayers(next);
        render();
        timelineFrame = window.requestAnimationFrame(tick);
    };
    syncTimelinePlayers(timelinePlayhead.value, !resumePausedPlayers);
    timelineFrame = window.requestAnimationFrame(tick);
}
function addTimelineItem(track) {
    rememberTimelineSnapshot();
    const clientKey = newTimelineClientKey();
    const startMs = Math.round(timelinePlayhead.value * 1000);
    timelineItems.value = [...timelineItems.value, { client_key: clientKey, track, lane: firstAvailableTimelineLane(track, startMs, 5000), label: track === 'music' ? 'Music cue' : track === 'fx' ? 'FX cue' : 'Voice cue', start_ms: startMs, duration_ms: 5000, trim_start_ms: 0, trim_end_ms: 0, fade_in_ms: 0, fade_out_ms: 0, volume: 80, muted: false }];
    selectedTimelineItemKey.value = clientKey;
    selectedTimelineItemKeys.value = [clientKey];
    scheduleTimelineSave(bookKey());
}

function duplicateSelectedTimelineItem(keyBook) {
    const selected = selectedTimelineItems();
    if (!selected.length) return;
    const firstStart = Math.min(...selected.map((item) => Number(item.start_ms || 0)));
    const insertAt = Math.max(...selected.map((item) => Number(item.start_ms || 0) + Number(item.duration_ms || 0))) + 250;
    rememberTimelineSnapshot();
    const duplicates = selected.map((item) => {
        const duplicate = { ...item, id: null, client_key: newTimelineClientKey(), start_ms: insertAt + Number(item.start_ms || 0) - firstStart };
        duplicate.lane = firstAvailableTimelineLane(duplicate.track, duplicate.start_ms, duplicate.duration_ms, selected.map(timelineItemKey), Number(item.lane || 0));
        return duplicate;
    });
    timelineItems.value = [...timelineItems.value, ...duplicates];
    selectedTimelineItemKey.value = duplicates[0].client_key;
    selectedTimelineItemKeys.value = duplicates.map(timelineItemKey);
    scheduleTimelineSave(keyBook);
    renderTimeline?.();
}

function canGroupTimelineItems(items = selectedTimelineItems()) {
    if (items.length < 2 || items.some((item) => item.is_group || !item.id)) return false;
    const first = items[0];
    return items.every((item) => item.track === first.track && Number(item.lane || 0) === Number(first.lane || 0));
}

async function groupSelectedTimelineItems(keyBook) {
    const items = selectedTimelineItems();
    if (!canGroupTimelineItems(items)) {
        audioStatus.value = { type: 'info', message: 'Select at least two non-group clips in the same channel and lane.' };
        return;
    }
    try {
        const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-timeline/group`, {
            item_ids: items.map((item) => item.id),
        });
        const masterId = audioData(payload).master_id;
        await loadTimeline(keyBook);
        const master = timelineItems.value.find((item) => Number(item.id) === Number(masterId));
        if (master) {
            selectedTimelineItemKey.value = timelineItemKey(master);
            selectedTimelineItemKeys.value = [timelineItemKey(master)];
        }
        audioStatus.value = { type: 'success', message: `${items.length} clips grouped into a compound clip.` };
        renderTimeline?.();
    } catch (error) { audioStatus.value = { type: 'danger', message: error.message || 'Unable to group the selected clips.' }; }
}

function splitSelectedTimelineItem(keyBook) {
    const item = selectedTimelineItem();
    if (!item) return;
    if (selectedTimelineItems().length > 1) {
        audioStatus.value = { type: 'info', message: 'Select one clip to split it at the playhead.' };
        return;
    }
    if (item.is_group) {
        audioStatus.value = { type: 'info', message: 'Use Ungroup for a generated audio master before editing its individual clips.' };
        return;
    }
    const startMs = Number(item.start_ms || 0);
    const durationMs = Number(item.duration_ms || 0);
    const splitMs = Math.round(timelinePlayhead.value * 1000);
    if (splitMs <= startMs + 250 || splitMs >= startMs + durationMs - 250) {
        audioStatus.value = { type: 'info', message: 'Place the playhead inside the clip, at least 0.25s from either edge, to split it.' };
        return;
    }
    const firstDuration = splitMs - startMs;
    const secondDuration = durationMs - firstDuration;
    rememberTimelineSnapshot();
    const first = { ...item, duration_ms: firstDuration, trim_end_ms: Number(item.trim_end_ms || 0) + secondDuration };
    const second = {
        ...item,
        id: null,
        client_key: newTimelineClientKey(),
        start_ms: splitMs,
        duration_ms: secondDuration,
        trim_start_ms: Number(item.trim_start_ms || 0) + firstDuration,
    };
    second.lane = firstAvailableTimelineLane(second.track, second.start_ms, second.duration_ms, timelineItemKey(item), Number(item.lane || 0));
    timelineItems.value = timelineItems.value.flatMap((candidate) => timelineItemKey(candidate) === timelineItemKey(item) ? [first, second] : [candidate]);
    selectedTimelineItemKey.value = second.client_key;
    selectedTimelineItemKeys.value = [second.client_key];
    scheduleTimelineSave(keyBook);
    renderTimeline?.();
}

async function removeSelectedTimelineItem(keyBook) {
    const items = selectedTimelineItems();
    if (!items.length) {
        audioStatus.value = { type: 'info', message: 'Select a clip before removing it.' };
        return;
    }

    const keys = new Set(items.map(timelineItemKey));
    rememberTimelineSnapshot();
    keys.forEach((key) => { timelinePlayers.get(key)?.pause(); timelinePlayers.delete(key); });
    timelineItems.value = timelineItems.value.filter((timelineItem) => !keys.has(timelineItemKey(timelineItem)));
    selectedTimelineItemKey.value = null;
    selectedTimelineItemKeys.value = [];
    scheduleTimelineSave(keyBook);
    audioStatus.value = { type: 'success', message: `${items.length} clip${items.length === 1 ? '' : 's'} removed. Use Undo to restore ${items.length === 1 ? 'it' : 'them'}.` };
    renderTimeline?.();
}

async function ungroupSelectedTimelineItem(keyBook) {
    const item = selectedTimelineItem();
    if (!item?.is_group || !item.id) return;
    try {
        const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-timeline/${encodeURIComponent(item.id)}/ungroup`, {});
        timelineItems.value = audioData(payload).items || [];
        selectedTimelineItemKey.value = null;
        selectedTimelineItemKeys.value = [];
        audioStatus.value = { type: 'success', message: 'Audio group ungrouped into individual timeline clips.' };
        renderTimeline?.();
    } catch (error) { audioStatus.value = { type: 'danger', message: error.message || 'Unable to ungroup this clip.' }; }
}

async function loadBlockAudio(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid) return;
    if (!block.current_version_id) {
        audioSegments.value = [];
        audioGroups.value = [];
        blockVoiceAssignment.value = null;
        generatorSettings.value = null;
        selectedLibraryVoice.value = null;
        return;
    }

    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio`);
        const data = audioData(payload);
        audioSegments.value = data.segments || [];
        audioGroups.value = data.groups || [];
        blockVoiceAssignment.value = data.assignment || null;
        generatorSettings.value = data.generator_settings || null;
        selectedLibraryVoice.value = data.assignment?.voice_profile || null;
    } catch (error) {
        const statusCode = error?.response?.status || error?.status;
        if (statusCode === 404) {
            audioSegments.value = [];
            audioGroups.value = [];
            blockVoiceAssignment.value = null;
            generatorSettings.value = null;
            selectedLibraryVoice.value = null;
            return;
        }
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load generated audio clips.' };
    }
}

async function generateSelectedAudio(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid || audioGenerating.value) return;
    const providerKey = 'qwen-local';
    const model = qwenModel.value;

    if (!blockVoiceAssignment.value?.voice_profile?.voice_id) {
        audioStatus.value = { type: 'danger', message: 'Assign a direct voice, or configure a voice for the selected character before generating audio.' };
        return;
    }

    audioGenerating.value = true;
    audioStatus.value = { type: 'info', message: 'Audio generation queued. You can keep working while Qwen creates the WAV file.' };
    let pollingStarted = false;
    try {
        const generated = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generate`, {
            provider_key: providerKey,
            model,
        }, providerKey === 'qwen-local' ? { timeout: 900000, retry: { attempts: 0 } } : undefined);
        const data = audioData(generated);
        pollingStarted = true;
        startAudioPolling(keyBook, data.job?.id);
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to generate audio for this block.' };
    } finally {
        if (!pollingStarted) audioGenerating.value = false;
    }
}

function startAudioPolling(keyBook, jobId) {
    window.clearTimeout(audioPollingTimer);
    const poll = async () => {
        try {
            await loadBlockAudio(keyBook);
            const job = audioGroups.value.find((group) => Number(group.id) === Number(jobId));
            if (!job || ['queued', 'running'].includes(job.status)) {
                audioStatus.value = { type: 'info', message: job?.status === 'running' ? 'Qwen is generating the WAV file…' : 'Audio generation is waiting for the TTS worker…' };
                audioPollingTimer = window.setTimeout(poll, 3000);
                return;
            }
            if (job.status === 'completed') audioStatus.value = { type: 'success', message: `Audio group generated with ${job.segments?.length || 1} timed clips. Insert it in the timeline when you are ready.` };
            else audioStatus.value = { type: 'danger', message: job.error_message || 'Audio generation failed.' };
            audioGenerating.value = false;
        } catch (error) {
            audioStatus.value = { type: 'danger', message: error.message || 'Unable to check audio generation status.' };
            audioGenerating.value = false;
        }
    };
    audioPollingTimer = window.setTimeout(poll, 1000);
}

async function insertAudioGroup(keyBook, jobId, placement = 'paragraph') {
    const block = activeBlock();
    if (!block?.block_uuid) return false;
    try {
        const startMs = Math.round(Math.max(0, timelinePlayhead.value) * 1000);
        const group = audioGroups.value.find((candidate) => Number(candidate.id) === Number(jobId));
        const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/${encodeURIComponent(jobId)}/insert-timeline`, {
            placement,
            ...(placement === 'playhead' ? {
                start_ms: startMs,
                lane: firstAvailableTimelineLane('voice', startMs, Number(group?.duration_ms || 1000)),
            } : {}),
        });
        const result = audioData(payload);
        await loadTimeline(keyBook);
        const shifted = Number(result.shifted_items || 0);
        audioStatus.value = {
            type: 'success', message: result.replaced
                ? `Audio replaced in the Voice track${shifted ? ` · ${shifted} later Voice clip${shifted === 1 ? '' : 's'} adjusted` : ''}.`
                : placement === 'paragraph' && shifted
                    ? `Audio inserted in paragraph order. ${shifted} later Voice clip${shifted === 1 ? '' : 's'} moved right.`
                    : 'Audio group inserted into the Voice track.'
        };
        window.requestAnimationFrame(() => document.querySelector('.at-audioTimelineCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return true;
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to insert this audio group.' };
        return false;
    }
}

function isAudioGroupExpanded(jobId) {
    return expandedAudioGroupIds.value.includes(Number(jobId));
}

function toggleAudioGroup(jobId) {
    const id = Number(jobId);
    expandedAudioGroupIds.value = isAudioGroupExpanded(id)
        ? expandedAudioGroupIds.value.filter((value) => value !== id)
        : [...expandedAudioGroupIds.value, id];
}

function audioGroupDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

async function removeAudioGroup(keyBook, jobId) {
    const block = activeBlock();
    if (!block?.block_uuid) return;

    try {
        await _.http.delJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/${encodeURIComponent(jobId)}`);
        expandedAudioGroupIds.value = expandedAudioGroupIds.value.filter((id) => id !== Number(jobId));
        await loadBlockAudio(keyBook);
        audioStatus.value = { type: 'success', message: 'Generated audio deleted.' };
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'This audio cannot be deleted while it is used in the timeline.' };
    }
}

function deleteAudioGroup(keyBook, jobId) {
    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3('Delete generated audio?'),
                _.span({ class: 'text-muted' }, 'This action cannot be undone.'),
            ),
            content: ({ close }) => _.div({ class: 'at-audioDeleteConfirm' },
                _.p('This removes the master audio and all of its generated clips.'),
                _.div({ class: 'at-audioDeleteConfirmActions' },
                    _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                    _.Btn({ color: 'danger', icon: 'delete', onClick: () => { close(); removeAudioGroup(keyBook, jobId); } }, 'Delete audio'),
                ),
            ),
        },
    }).open();
}

function insertionPlacementHint(placement) {
    if (placement === 'replace') return 'Replaces the generated Voice master for this paragraph, keeping its position and timeline edits.';
    if (placement === 'playhead') return 'Starts at the red playhead. Existing clips keep their position.';
    if (placement === 'end') return 'Places this master after the last Voice clip.';
    return 'Matches this paragraph in book order and moves later Voice clips to the right.';
}

function audioGroupsList(keyBook, placement, close) {
    return () => audioGroups.value.length
        ? _.div({ class: 'at-audioGeneratedGroups' },
            _.div({ class: 'at-audioGeneratedGroupsHeader' }, _.strong('Available audio'), _.small(`${audioGroups.value.length} master${audioGroups.value.length === 1 ? '' : 's'}`)),
            ...audioGroups.value.map((group) => _.div({ class: 'at-audioGeneratedGroup' },
                _.div({ class: 'at-audioGeneratedMaster' },
                    _.button({ type: 'button', class: 'at-audioGroupToggle', title: isAudioGroupExpanded(group.id) ? 'Collapse clips' : 'Show clips', onclick: () => toggleAudioGroup(group.id) }, _.Icon ? _.Icon({ name: isAudioGroupExpanded(group.id) ? 'expand_more' : 'chevron_right' }) : '›'),
                    _.div({ class: 'at-audioGeneratedMasterInfo' },
                        _.strong(group.label || 'Narration'),
                        _.small(group.status === 'completed' ? `${group.segments.length} clips · ~${Math.ceil(group.duration_ms / 1000)}s · ${audioGroupDate(group.created_at)}` : group.status === 'running' ? 'Generating audio…' : group.status === 'queued' ? 'Waiting for TTS worker…' : `Failed · ${group.error_message || 'Unknown error'}`),
                    ),
                    _.div({ class: 'at-audioGeneratedMasterActions' },
                        group.status !== 'completed' ? null : _.Btn({ color: 'secondary', icon: Number(previewingAudioGroupId.value) === Number(group.id) ? 'stop_circle' : 'play_circle', title: Number(previewingAudioGroupId.value) === Number(group.id) ? 'Stop preview' : 'Listen before inserting', onClick: () => previewGeneratedAudioGroup(group) }, Number(previewingAudioGroupId.value) === Number(group.id) ? 'Stop' : 'Listen'),
                        group.status !== 'completed' ? null : group.in_timeline
                            ? _.span({ class: 'at-audioGroupUsed' }, 'In timeline')
                            : [
                                _.Btn({ color: 'primary', icon: 'playlist_add', onClick: async () => { if (await insertAudioGroup(keyBook, group.id, placement.value)) { stopGeneratedAudioPreview(); close(); } } }, 'Insert'),
                                _.Btn({ color: 'danger', icon: 'delete', title: 'Delete generated audio', onClick: () => deleteAudioGroup(keyBook, group.id) }),
                            ],
                    ),
                ),
                () => isAudioGroupExpanded(group.id) ? _.div({ class: 'at-audioGeneratedChildren' },
                    ...group.segments.map((segment, index) => _.div({ class: 'at-audioGeneratedChild' },
                        _.span(`Clip ${index + 1}`),
                        _.span(`${wordCount(segment.text_plain)} words`),
                        _.span(`~${Math.ceil((Number(segment.duration_ms || 0) + Number(segment.pause_after_ms || 0)) / 1000)}s`),
                    )),
                ) : null,
            )),
        )
        : _.div({ class: 'at-audioListEmpty' }, _.Icon ? _.Icon({ name: 'audio_file' }) : null, _.span('No audio has been generated for this block yet.'));
}

function openAudioListDialog(keyBook) {
    const placement = _.rod('paragraph');
    const canReplaceTimelineAudio = () => audioGroups.value.some((group) => group.in_timeline);
    const placementOptions = [
        ['paragraph', 'Match paragraph'],
        ['playhead', 'At playhead'],
        ['end', 'At end'],
        ['replace', 'Replace timeline'],
    ];

    _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('List of audio'), _.span({ class: 'text-muted' }, 'Choose a generated master to insert into the Voice track.')),
            content: ({ close }) => _.div({ class: 'at-audioListDialog' },
                _.div({ class: 'at-audioInsertPosition' },
                    _.div({ class: 'at-audioInsertPositionHead' },
                        _.div(_.span('Insert position'), _.strong('Place every selected master')),
                        () => _.small(insertionPlacementHint(placement.value)),
                    ),
                    _.div({ class: 'at-audioInsertPositionOptions' }, placementOptions.map(([value, label]) => _.Radio({
                        class: 'at-audioInsertPositionRadio',
                        name: 'audio-insert-position',
                        value,
                        label,
                        dense: true,
                        disabled: () => value === 'replace' && !canReplaceTimelineAudio(),
                        model: placement,
                    }))),
                ),
                audioGroupsList(keyBook, placement, close),
                _.div({ class: 'at-audioListDialogActions' }, _.Btn({ color: 'secondary', onClick: () => { stopGeneratedAudioPreview(); close(); } }, 'Close')),
            ),
        },
    }).open();
}

async function publishAudiobook(keyBook) {
    if (publishRunning.value) return;
    publishRunning.value = true;
    publishResult.value = null;
    try {
        const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-publish`, {});
        publishResult.value = audioData(payload);
        audioStatus.value = { type: 'success', message: 'Voice, Music and FX masters rendered successfully.' };
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to render the audiobook masters.' };
    } finally {
        publishRunning.value = false;
    }
}

function openPublishDialog(keyBook) {
    publishResult.value = null;
    _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3('Publish audiobook'),
                _.span({ class: 'text-muted' }, 'Render the saved timeline into three independent master channels.'),
            ),
            content: ({ close }) => _.div({ class: 'at-audioPublishDialog' },
                _.div({ class: 'at-audioPublishNotice' }, _.Icon ? _.Icon({ name: 'info' }) : null, _.span('The timeline remains editable. Publishing creates new WAV files and never replaces your clips.')),
                () => publishRunning.value
                    ? _.div({ class: 'at-audioPublishProgress' }, _.Icon ? _.Icon({ name: 'progress_activity' }) : null, _.span('Rendering Voice, Music and FX…'))
                    : publishResult.value
                        ? _.div({ class: 'at-audioPublishResults' },
                            _.strong('Published masters'),
                            ...Object.entries(publishResult.value.channels || {}).map(([track, channel]) => _.div({ class: 'at-audioPublishRow' },
                                _.div(_.strong(track === 'voice' ? 'Voice' : track === 'music' ? 'Music' : 'FX'), _.small(`${Math.ceil(Number(channel.duration_ms || 0) / 1000)}s · ${channel.status}`)),
                                channel.url ? _.Btn({ color: 'secondary', icon: 'download', onClick: () => window.open(channel.url, '_blank', 'noopener') }, 'Download WAV') : _.span({ class: 'text-muted' }, 'No clips'),
                            )),
                            _.Btn({ color: 'secondary', onClick: close }, 'Close'),
                        )
                        : _.div({ class: 'at-audioPublishReady' }, _.p('The renderer will consolidate all clips according to their current position, trim, volume and fades.'), _.Btn({ color: 'primary', icon: 'publish', loading: publishRunning, onClick: () => publishAudiobook(keyBook) }, 'Render masters')),
            ),
        },
    }).open();
}

function openGenerateBookAudioDialog(keyBook) {
    const regenerate = _.rod(false);
    const model = _.rod(qwenModel.value);
    const status = _.rod(null);
    const generate = async () => {
        if (bookAudioGenerating.value) return;
        bookAudioGenerating.value = true;
        status.value = null;
        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio/generate-all`, {
                regenerate_existing: regenerate.value,
                provider_key: 'qwen-local',
                model: model.value,
            }, { timeout: 900000, retry: { attempts: 0 } });
            const result = audioData(payload);
            const firstFailure = result.failed_blocks?.[0]?.message;
            status.value = {
                type: result.failed_blocks?.length ? 'warning' : 'success',
                message: `${result.queued_blocks || 0} blocks queued for generation${result.skipped_blocks ? ` · ${result.skipped_blocks} already available` : ''}${result.unconfigured_blocks ? ` · ${result.unconfigured_blocks} need a voice` : ''}${result.failed_blocks?.length ? ` · ${result.failed_blocks.length} failed to queue` : ''}.${firstFailure ? ` First error: ${firstFailure}` : ''}`,
            };
            await loadBlockAudio(keyBook);
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to generate the book audio.' };
        } finally {
            bookAudioGenerating.value = false;
        }
    };

    _.Dialog({
        size: 'md',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('Generate book audio'), _.span({ class: 'text-muted' }, 'Create narrated audio for every saved text block in this book.')),
            content: ({ close }) => _.div({ class: 'at-bookAudioGenerateDialog' },
                _.Checkbox({ label: 'Regenerate audio already generated', model: regenerate }),
                _.Select({ label: 'Qwen model', model, options: [{ value: 'fast', label: 'Fast · 0.6B' }, { value: 'quality', label: 'Quality · 1.7B' }] }),
                _.small({ class: 'at-bookAudioGenerateNote' }, () => regenerate.value ? 'Every block will receive a new audio master.' : 'Only blocks without a completed audio master will be generated.'),
                () => {
                    const metrics = bookAudioMetrics();
                    return _.div({ class: 'at-bookAudioMetrics' },
                        _.div(_.span('Text blocks'), _.strong(String(metrics.blocks))),
                        _.div(_.span('Selected text'), _.strong(`${metrics.words} words`)),
                        _.div(_.span('Estimated duration'), _.strong(`~${metrics.seconds}s`)),
                        _.div(_.span('AT estimate'), _.strong(`${metrics.credits} credits`)),
                    );
                },
                () => status.value ? _.Alert(status.value) : null,
                _.div({ class: 'at-characterDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'play_circle', loading: bookAudioGenerating, onClick: generate }, 'Generate book audio')),
            ),
        },
    }).open();
}

function openInsertAllAudioDialog(keyBook) {
    const replaceExisting = _.rod(false);
    const count = _.rod(null);
    const status = _.rod(null);
    _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio/insert-all-summary`)
        .then((payload) => { count.value = Number(audioData(payload).latest_audio_count || 0); })
        .catch(() => { status.value = { type: 'danger', message: 'Unable to load generated audio.' }; });
    const insert = async (close) => {
        if (allAudioInserting.value) return;
        allAudioInserting.value = true;
        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio/insert-all`, { replace_existing: replaceExisting.value });
            const result = audioData(payload);
            await loadTimeline(keyBook);
            audioStatus.value = { type: 'success', message: `${result.inserted} latest audio master${result.inserted === 1 ? '' : 's'} inserted${result.skipped ? ` · ${result.skipped} already in timeline` : ''}.` };
            close();
        } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to insert generated audio.' }; }
        finally { allAudioInserting.value = false; }
    };
    _.Dialog({
        size: 'md', stickyActions: true, slots: {
            header: _.div(_.h3('Insert all generated audio'), _.span({ class: 'text-muted' }, 'Insert the latest completed master for every paragraph in book order.')),
            content: ({ close }) => _.div({ class: 'at-bookAudioGenerateDialog' },
                () => _.div({ class: 'at-bookAudioMetrics' }, _.div(_.span('Latest audio'), _.strong(count.value === null ? 'Loading…' : String(count.value))), _.div(_.span('Track'), _.strong('Voice')), _.div(_.span('Order'), _.strong('Paragraph')), _.div(_.span('Existing'), _.strong(replaceExisting.value ? 'Replace' : 'Keep'))),
                _.Checkbox({ label: 'Replace generated audio already in timeline', model: replaceExisting }),
                _.small({ class: 'at-bookAudioGenerateNote' }, () => replaceExisting.value ? 'Replaces generated masters linked to the same paragraph. Music, FX and manual clips stay untouched.' : 'Inserts only paragraphs that do not already have generated audio in the timeline.'),
                () => status.value ? _.Alert(status.value) : null,
                _.div({ class: 'at-characterDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'playlist_add', loading: allAudioInserting, disabled: () => count.value === 0, onClick: () => insert(close) }, 'Insert all audio')),
            ),
        }
    }).open();
}

function audioTabs() {
    const tabs = [
        ['styles', 'Book styles'],
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

function openAudioDirectionDialog() {
    const keyBook = bookKey();
    const defaultVoiceId = _.rod(String(audiobookBook.value?.audio_settings_json?.default_voice_profile_id || ''));
    const saving = _.rod(false);
    const status = _.rod(null);
    const libraryVoices = _.rod([]);
    const libraryLoading = _.rod(true);
    const libraryChoice = new Map();
    _.http.getJSON('/dashboard/api/audio-library/voices')
        .then((payload) => { libraryVoices.value = audioData(payload).voices || []; })
        .catch((error) => { status.value = { type: 'warning', message: error.message || 'Audio Library could not be loaded.' }; })
        .finally(() => { libraryLoading.value = false; });
    const voiceOptions = () => {
        const profiles = voiceProfiles.value.filter((profile) => profile.voice_id)
            .map((profile) => ({ value: String(profile.id), label: `Book voice · ${profile.name} · ${profile.settings_json?.tone_name || 'Default tone'}` }));
        const library = libraryVoices.value.flatMap((voice) => (voice.samples || []).map((sample) => {
            const value = `library:${voice.id}:${sample.tone_id || sample.tone?.id || ''}`;
            libraryChoice.set(value, { voice, sample });
            return { value, label: `Audio Library · ${voice.name} · ${sample.tone?.name || sample.tone || 'Default tone'}` };
        }));
        return [{ value: '', label: 'No default voice' }, ...profiles, ...library];
    };
    const save = async (close) => {
        saving.value = true;
        status.value = null;
        try {
            let profileId = defaultVoiceId.value || null;
            if (String(profileId).startsWith('library:')) {
                const selected = libraryChoice.get(profileId);
                if (!selected) throw new Error('The selected Audio Library voice is no longer available.');
                const existing = voiceProfiles.value.find((profile) => Number(profile.settings_json?.audio_library_voice_id) === Number(selected.voice.id)
                    && Number(profile.settings_json?.tone_id) === Number(selected.sample.tone_id || selected.sample.tone?.id));
                if (existing?.id) {
                    profileId = String(existing.id);
                } else {
                    const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices`, {
                        name: selected.voice.name,
                        role: 'narrator',
                        language: selected.voice.language,
                        notes: selected.voice.description || null,
                        audio_library_voice_id: selected.voice.id,
                        tone_id: selected.sample.tone_id || selected.sample.tone?.id || null,
                    }, { timeout: 900000, retry: { attempts: 0 } });
                    const profile = audioData(payload).profile;
                    if (!profile?.id) throw new Error('The Audio Library voice could not be configured for this book.');
                    voiceProfiles.value = [...voiceProfiles.value, profile];
                    profileId = String(profile.id);
                }
            }
            await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-settings`, { default_voice_profile_id: profileId });
            audiobookBook.value = { ...audiobookBook.value, audio_settings_json: { ...(audiobookBook.value?.audio_settings_json || {}), default_voice_profile_id: profileId } };
            close();
        } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to save the default voice.' }; }
        finally { saving.value = false; }
    };
    _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3('Audio direction'),
                _.span({ class: 'text-muted' }, 'Set the narrator and delivery direction used when this block is generated.'),
            ),
            content: ({ close }) => _.div({ class: 'at-audioDirectionDialog' },
                _.Select({ label: 'Default voice', icon: 'record_voice_over', model: defaultVoiceId, options: voiceOptions }),
                () => libraryLoading.value ? _.small({ class: 'text-muted' }, 'Loading Audio Library voices…') : _.small({ class: 'text-muted' }, 'Audio Library selections are configured as the book narrator automatically.'),
                audioDirection(),
                () => status.value ? _.Alert(status.value) : null,
                _.div({ class: 'at-characterDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'check', loading: saving, onClick: () => save(close) }, 'Save direction')),
            ),
        },
    }).open();
}

function audiobookIndexLabel(block) {
    const text = String(block?.text_plain || '').replace(/\s+/g, ' ').trim();
    return text.length > 74 ? `${text.slice(0, 74)}…` : text || 'Empty block';
}

function openAudiobookIndexMenu(anchorEl, keyBook) {
    const menu = _.Menu({
        title: 'Book index',
        subtitle: () => `${audiobookBlocks.value.length} blocks`,
        icon: 'format_list_bulleted',
        minWidth: 330,
        maxHeight: 'min(68vh, 32rem)',
        placement: 'bottom-end',
        items: () => audiobookBlocks.value.map((block, index) => ({
            icon: block.type === 'heading' ? 'title' : 'format_align_left',
            label: `${index + 1}. ${block.type === 'heading' ? 'Heading' : 'Narration'}`,
            subtitle: audiobookIndexLabel(block),
            active: () => index === activeBlockIndex.value,
            onClick: () => selectAudiobookBlock(index, keyBook),
        })),
        empty: 'No blocks available.',
    });

    menu.open(anchorEl);
}

function textStyle() {
    const styleOptions = [
        ['body', 'Body text', 'The default text used by paragraphs.'],
        ['chapter_title', 'Chapter title', 'Used by chapter-opening titles.'],
        ['heading', 'Heading', 'Used by manuscript heading blocks.'],
        ['quote', 'Quote', 'Ready for quotations and callouts.'],
    ];
    const save = async () => {
        const design = designWithDraft();
        designSaving.value = true;
        designStatus.value = null;
        try {
            const payload = await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(bookKey())}/design`, { design });
            const next = audioData(payload).book_design_json || design;
            bookDesign.value = cloneDesign(next);
            hydrateDesignForm();
            audiobookBook.value = { ...audiobookBook.value, book_design_json: next };
            designStatus.value = { type: 'success', message: 'Book styles saved. They will be shared by reading view, PDF, and ePub exports.' };
        } catch (error) {
            designStatus.value = { type: 'danger', message: error.message || 'Unable to save book styles.' };
        } finally { designSaving.value = false; }
    };

    return _.div({ class: 'at-bookStyleEditor' },
        _.div({ class: 'at-bookStyleEditorHead' },
            _.div(_.span('Global book styles'), _.small('A single design system for reading view, PDF, and ePub.')),
            _.Btn({ color: 'primary', icon: 'save', loading: designSaving, onClick: save }, 'Save book styles'),
        ),
        _.div({ class: 'at-bookStyleEditorBody' },
            _.aside({ class: 'at-bookStyleList' },
                _.span({ class: 'at-bookStyleListLabel' }, 'Styles'),
                ...styleOptions.map(([key, label, description]) => _.button({ type: 'button', class: () => `at-bookStyleOption ${designStyleKey.value === key ? 'is-selected' : ''}`, onclick: () => setDesignStyle(key) }, _.strong(label), _.small(description))),
            ),
            _.div({ class: 'at-bookStyleInspector' },
                _.div({ class: 'at-bookStyleInspectorHead' }, _.div(_.span('Editing style'), _.strong(() => styleOptions.find(([key]) => key === designStyleKey.value)?.[1] || 'Body text')), _.small(() => designStyleKey.value === 'body' ? 'This is the base style inherited by all other styles.' : 'This style inherits any property that is not customized from Body text.')),
                _.div({ class: 'at-bookStyleSection' }, _.strong('Typography'), _.div({ class: 'at-bookStyleFields' },
                    _.Select({ label: 'Font family', model: designFields.font_family, options: ['Instrument Sans', 'Inter', 'Georgia', 'Merriweather', 'Arial'].map((value) => ({ value, label: value })) }),
                    _.Input({ label: 'Font size', type: 'number', suffix: 'px', min: 8, max: 96, model: designFields.font_size }),
                    _.Input({ label: 'Line height', type: 'number', min: .8, max: 3, step: .01, model: designFields.line_height }),
                    _.Select({ label: 'Font weight', model: designFields.font_weight, options: [{ value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' }] }),
                    _.Select({ label: 'Font style', model: designFields.font_style, options: [{ value: 'normal', label: 'Normal' }, { value: 'italic', label: 'Italic' }] }),
                    _.Input({ label: 'Text color', type: 'color', model: designFields.color }),
                )),
                _.div({ class: 'at-bookStyleSection' }, _.strong('Paragraph'), _.div({ class: 'at-bookStyleFields' },
                    _.Select({ label: 'Text alignment', model: designFields.text_align, options: [{ value: 'left', label: 'Left' }, { value: 'justify', label: 'Justified' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }] }),
                    _.Input({ label: 'Letter spacing', type: 'number', suffix: 'px', step: .1, min: -2, max: 10, model: designFields.letter_spacing }),
                    _.Select({ label: 'Text transform', model: designFields.text_transform, options: [{ value: 'none', label: 'None' }, { value: 'uppercase', label: 'Uppercase' }, { value: 'capitalize', label: 'Capitalize' }] }),
                    _.Input({ label: 'Space before', type: 'number', suffix: 'px', min: 0, max: 160, model: designFields.space_before }),
                    _.Input({ label: 'Space after', type: 'number', suffix: 'px', min: 0, max: 160, model: designFields.space_after }),
                )),
                _.div({ class: 'at-bookStyleSection' }, _.strong('Book layout'), _.div({ class: 'at-bookStyleFields' },
                    _.Input({ label: 'Reading padding', type: 'number', suffix: 'px', min: 0, max: 120, model: layoutFields.content_padding }),
                    _.Input({ label: 'Paragraph gap', type: 'number', suffix: 'px', min: 0, max: 120, model: layoutFields.paragraph_gap }),
                    _.Input({ label: 'Content width', type: 'number', suffix: 'px', min: 360, max: 1200, model: layoutFields.content_width }),
                )),
            ),
        ),
        () => designStatus.value ? _.Alert(designStatus.value) : null,
    );
}

function blockStyle() {
    return _.div({ class: 'at-audioHint' }, 'Block-level overrides will be added after the global book style system is complete. Use Book styles to define the shared reading, PDF, and ePub design.');
}

function characterProfiles() {
    return voiceProfiles.value.filter((profile) => profile.role === 'character');
}

async function assignProfileToActiveBlock(keyBook, profileId) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid) return;
    try {
        const payload = await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`, { voice_profile_id: profileId || null });
        const data = audioData(payload);
        blockVoiceAssignment.value = data.assignment || null;
        selectedLibraryVoice.value = data.assignment?.voice_profile || null;
        audioStatus.value = { type: 'success', message: profileId ? 'Character assigned to this paragraph.' : 'Character assignment cleared. You can now choose a direct voice.' };
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to update the paragraph speaker.' };
    }
}

function openCharacterDialog(keyBook, existing = null) {
    const name = _.rod(existing?.name || '');
    const notes = _.rod(existing?.notes || '');
    const icon = _.rod(existing?.settings_json?.icon || 'person');
    const libraryVoiceId = _.rod(String(existing?.settings_json?.audio_library_voice_id || ''));
    const toneId = _.rod(String(existing?.settings_json?.tone_id || ''));
    const saving = _.rod(false);
    const status = _.rod(null);
    const iconOptions = [
        { value: 'person', label: 'Person' }, { value: 'face', label: 'Face' },
        { value: 'auto_stories', label: 'Story' }, { value: 'psychology', label: 'Mind' },
    ];
    const save = async (close) => {
        if (!name.value.trim()) { status.value = { type: 'warning', message: 'Character name is required.' }; return; }
        saving.value = true;
        status.value = null;
        try {
            const body = { name: name.value.trim(), role: 'character', notes: notes.value.trim() || null, icon: icon.value, audio_library_voice_id: libraryVoiceId.value ? Number(libraryVoiceId.value) : null, tone_id: toneId.value ? Number(toneId.value) : null };
            const payload = existing
                ? await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices/${encodeURIComponent(existing.id)}`, body)
                : await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices`, body);
            const profile = audioData(payload).profile;
            if (profile) voiceProfiles.value = [...voiceProfiles.value.filter((item) => Number(item.id) !== Number(profile.id)), profile].sort((a, b) => a.name.localeCompare(b.name));
            close();
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to save this character.' };
        } finally { saving.value = false; }
    };
    const libraryVoices = _.rod([]);
    const loadLibrary = async () => {
        try {
            const payload = await _.http.getJSON('/dashboard/api/audio-library/voices');
            const voices = audioData(payload).voices || [];
            libraryVoices.value = voices;
            return voices.map((voice) => ({ value: String(voice.id), label: `${voice.name} · ${voice.language?.toUpperCase() || '—'}` }));
        } catch { return []; }
    };
    const libraryOptions = _.rod([]);
    loadLibrary().then((options) => { libraryOptions.value = options; });
    _.Dialog({
        size: 'md', stickyActions: true,
        slots: {
            header: _.div(_.h3(existing ? 'Edit character' : 'Create character'), _.span({ class: 'text-muted' }, 'A character keeps its voice, icon and performance details across paragraphs.')),
            content: ({ close }) => _.div({ class: 'at-characterDialog' },
                _.Input({ label: 'Character name', icon: 'badge', model: name, placeholder: 'e.g. Elena' }),
                _.Select({ label: 'Icon', icon: 'face', model: icon, options: iconOptions }),
                _.Select({ label: 'Voice from library', icon: 'record_voice_over', model: libraryVoiceId, options: () => [{ value: '', label: 'Set later' }, ...libraryOptions.value] }),
                _.Select({
                    label: 'Voice tone', icon: 'graphic_eq', model: toneId, options: () => {
                        const voice = libraryVoices.value.find((item) => String(item.id) === String(libraryVoiceId.value));
                        return [{ value: '', label: 'Default tone' }, ...(voice?.samples || []).map((sample) => ({ value: String(sample.tone_id || sample.tone?.id), label: sample.tone?.name || `Tone #${sample.tone_id || sample.tone?.id}` }))];
                    }
                }),
                _.Textarea({ label: 'Character details', icon: 'notes', model: notes, rows: 4, placeholder: 'Age, accent, delivery and narrative notes.' }),
                () => status.value ? _.Alert(status.value) : null,
                _.div({ class: 'at-characterDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'save', loading: saving, onClick: () => save(close) }, existing ? 'Save character' : 'Create character')),
            ),
        },
    }).open();
}

async function deleteCharacterProfile(keyBook, profile) {
    if (!window.confirm(`Delete ${profile.name}? Paragraphs using this character will no longer have it assigned.`)) return;
    try {
        await _.http.delJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/voices/${encodeURIComponent(profile.id)}`);
        voiceProfiles.value = voiceProfiles.value.filter((item) => Number(item.id) !== Number(profile.id));
        if (Number(blockVoiceAssignment.value?.voice_profile_id) === Number(profile.id)) {
            blockVoiceAssignment.value = null;
            selectedLibraryVoice.value = null;
        }
        audioStatus.value = { type: 'success', message: 'Character deleted.' };
    } catch (error) { audioStatus.value = { type: 'danger', message: error.message || 'Unable to delete this character.' }; }
}

function openParagraphCharacterDialog(keyBook) {
    _.Dialog({
        size: 'lg', stickyActions: true,
        slots: {
            header: _.div({ class: 'at-audioCharacterDialogHeader' }, _.h3('Assign character'), _.span('Manage your cast, then assign one character to this paragraph.')),
            content: ({ close }) => _.div({ class: 'at-paragraphCharacterDialog' },
                () => characterProfiles().length ? _.div({ class: 'at-audioCharacterAssignRows' }, characterProfiles().map((profile) => _.article({ class: 'at-audioCharacterAssignRow' },
                    _.div({ class: 'at-audioCharacterIdentity' }, _.div({ class: 'at-characterIcon' }, _.Icon ? _.Icon({ name: profile.settings_json?.icon || 'person' }) : null), _.div(_.strong(profile.name), _.span(profile.notes || 'No character details'))),
                    _.div({ class: 'at-audioCharacterVoice' }, _.span(profile.voice_id ? 'Voice ready' : 'Voice missing'), _.strong(profile.settings_json?.voice_name || profile.voice_provider || 'No voice connected'), _.small(profile.settings_json?.tone_name || (profile.settings_json?.tone_id ? `Tone #${profile.settings_json.tone_id}` : 'Default tone'))),
                    _.div({ class: 'at-audioCharacterActions' },
                        _.Btn({ dense: true, color: 'primary', icon: 'person_add', onClick: async () => { await assignProfileToActiveBlock(keyBook, profile.id); close(); } }, 'Assign'),
                        _.Btn({ dense: true, color: 'secondary', icon: 'edit', title: `Edit ${profile.name}`, onClick: () => openCharacterDialog(keyBook, profile) }),
                        _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: `Delete ${profile.name}`, onClick: () => deleteCharacterProfile(keyBook, profile) }),
                    ),
                ))) : _.div({ class: 'at-audioListEmpty' }, _.span('No characters yet. Create one below.')),
                _.div({ class: 'at-characterDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'person_add', onClick: () => { close(); openCharacterDialog(keyBook); } }, 'Create character')),
            ),
        },
    }).open();
}

function resolveLibrarySampleDuration(sample) {
    const storedDuration = Number(sample.duration_ms || 0);
    if (storedDuration > 0) return Promise.resolve(storedDuration);
    return new Promise((resolve) => {
        const audio = new Audio(sample.audio_url);
        const finish = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : 5000);
        audio.preload = 'metadata';
        audio.addEventListener('loadedmetadata', finish, { once: true });
        audio.addEventListener('error', finish, { once: true });
        audio.load();
    });
}

async function openTimelineMediaDialog(track) {
    const assets = _.rod([]);
    const search = _.rod('');
    const dialogStatus = _.rod(null);
    const uploading = _.rod(false);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.hidden = true;

    const loadAssets = async () => {
        const query = new URLSearchParams({
            kind: track,
            search: search.value,
            _: String(Date.now()),
        });
        const payload = await _.http.getJSON(`/dashboard/api/audio-media?${query.toString()}`);
        assets.value = audioData(payload).assets || [];
    };

    try {
        await loadAssets();
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load media.' };
        return;
    }

    const insertAsset = async (asset, close) => {
        const startMs = Math.round(Math.max(0, timelinePlayhead.value) * 1000);
        const durationMs = Math.max(100, await resolveLibrarySampleDuration(asset));
        const clientKey = newTimelineClientKey();
        rememberTimelineSnapshot();
        timelineItems.value = [...timelineItems.value, {
            client_key: clientKey,
            track,
            lane: firstAvailableTimelineLane(track, startMs, durationMs),
            label: asset.name || asset.original_name || 'Audio media',
            start_ms: startMs,
            duration_ms: durationMs,
            trim_start_ms: 0,
            trim_end_ms: 0,
            fade_in_ms: 0,
            fade_out_ms: 0,
            volume: 100,
            muted: false,
            audio_media_asset_id: asset.id,
            audio_path: asset.audio_url,
        }];
        selectedTimelineItemKey.value = clientKey;
        selectedTimelineItemKeys.value = [clientKey];
        scheduleTimelineSave(bookKey());
        renderTimeline?.();
        audioStatus.value = { type: 'success', message: `${asset.name || 'Audio media'} inserted in the ${track.toUpperCase()} track.` };
        close();
    };

    fileInput.onchange = async (event) => {
        const file = event.target.files?.[0];
        if (!file || uploading.value) return;
        uploading.value = true;
        dialogStatus.value = null;
        try {
            const durationMs = await resolveLibrarySampleDuration({ audio_url: URL.createObjectURL(file) });
            const form = new FormData();
            form.append('kind', track); form.append('file', file); form.append('duration_ms', String(durationMs));
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await _.http.request('/dashboard/api/audio-media', {
                method: 'POST',
                body: form,
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
                },
            });
            const responsePayload = await response.jsonStrict();
            const savedAsset = responsePayload?.data?.data?.asset
                || responsePayload?.data?.asset
                || responsePayload?.asset
                || null;
            await loadAssets();
            // Keep the just-created item visible even when an intermediary
            // cache still serves the previous empty collection once.
            if (savedAsset?.id && !assets.value.some((asset) => Number(asset.id) === Number(savedAsset.id))) {
                assets.value = [savedAsset, ...assets.value];
            }
            dialogStatus.value = { type: 'success', message: `${file.name} uploaded to ${track.toUpperCase()} media.` };
        } catch (error) {
            const details = error.data?.message || error.data?.errors
                ? Object.values(error.data?.errors || {}).flat().join(' ') || error.data?.message
                : null;
            dialogStatus.value = { type: 'danger', message: details || error.message || 'Unable to upload media.' };
        }
        finally { uploading.value = false; fileInput.value = ''; }
    };

    _.Dialog({
        size: 'xl',
        stickyActions: true,
        slots: {
            header: _.div(_.h3(`Choose ${track === 'music' ? 'music' : 'FX'} media`), _.span({ class: 'text-muted' }, 'Search or upload reusable media for this channel.')),
            content: ({ close }) => _.div({ class: 'at-libraryVoiceDialog at-timelineMediaDialog' },
                fileInput,
                _.div({ class: 'at-timelineMediaToolbar' },
                    _.Input({ label: false, model: search, icon: 'search', placeholder: 'Search name, tag or description', onInput: () => loadAssets().catch((error) => { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to load media.' }; }) }),
                    _.Btn({ color: 'secondary', icon: 'upload_file', loading: uploading, onClick: () => fileInput.click() }, 'Upload'),
                ),
                () => {
                    return assets.value.length ? _.div({ class: 'at-timelineMediaResults' }, assets.value.map((asset) => _.article({ class: 'at-timelineMediaResult' },
                        _.div({ class: 'at-timelineMediaCopy' },
                            _.strong(asset.name || asset.original_name || 'Untitled audio'),
                            _.small(`${Math.max(0, Math.round(Number(asset.duration_ms || 0) / 1000))}s · ${asset.original_name || 'Uploaded media'}`),
                            _.div({ class: 'at-timelineMediaTags' }, ...(asset.tags?.length ? asset.tags.map((tag) => _.span(tag)) : [_.span(track.toUpperCase())])),
                        ),
                        _.audio({ controls: true, preload: 'metadata', src: asset.audio_url }),
                        _.Btn({ dense: true, color: 'primary', icon: 'playlist_add', title: `Insert into ${track}`, onClick: () => insertAsset(asset, close) }),
                    ))) : _.div({ class: 'at-libraryVoiceEmpty' }, `No ${track} media yet. Upload the first file.`);
                },
                () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
                _.div({ class: 'at-libraryVoiceActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel')),
            ),
        },
    }).open();
}

async function openLibraryVoiceDialog(keyBook) {
    const voices = _.rod([]);
    const tones = _.rod([]);
    const search = _.rod('');
    const type = _.rod('');
    const toneId = _.rod('');
    const dialogStatus = _.rod(null);
    const assigning = _.rod(false);

    try {
        const payload = await _.http.getJSON('/dashboard/api/audio-library/voices');
        const data = audioData(payload);
        voices.value = data.voices || [];
        tones.value = data.tones || [];
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load the AT voice library.' };
        return;
    }

    const filteredVoiceSamples = () => {
        const query = search.value.trim().toLowerCase();
        const selectedTone = Number(toneId.value || 0);
        return voices.value.flatMap((voice) => (voice.samples || []).map((sample) => ({ voice, sample }))).filter(({ voice, sample }) => {
            const haystack = `${voice.name} ${voice.language} ${voice.description || ''} ${sample.description || ''} ${sample.original_name || ''} ${sample.tone?.name || ''}`.toLowerCase();
            return (!query || haystack.includes(query))
                && (!type.value || voice.type === type.value)
                && (!selectedTone || Number(sample.tone_id || sample.tone?.id) === selectedTone);
        });
    };

    const chooseVoice = async (voice, sample, close) => {
        const block = activeBlock();
        if (!block?.block_uuid) return;
        assigning.value = true;
        dialogStatus.value = null;
        const requestedToneId = Number(sample.tone_id || sample.tone?.id || 0) || null;
        try {
            await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/library-voice`, {
                audio_library_voice_id: voice.id,
                audio_library_voice_sample_id: sample.id,
                tone_id: requestedToneId,
            }, { timeout: 900000, retry: { attempts: 0 } });
            const data = audioData(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/voice-assignment`));
            blockVoiceAssignment.value = data.assignment || null;
            selectedLibraryVoice.value = data.assignment?.voice_profile || { ...voice, selected_tone_id: requestedToneId };
            voiceName.value = voice.name;
            audioStatus.value = { type: 'success', message: `${voice.name} · ${sample.tone?.name || 'tone'} is assigned as a direct voice and ready for AT generation.` };
            close();
        } catch (error) {
            dialogStatus.value = { type: 'danger', message: error.message || 'Unable to prepare this voice.' };
        } finally {
            assigning.value = false;
        }
    };

    _.Dialog({
        size: 'xl',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('Choose a direct AT voice'), _.span({ class: 'text-muted' }, 'Choose the exact voice reference and tone for this paragraph. This does not create a character.')),
            content: ({ close }) => _.div({ class: 'at-libraryVoiceDialog' },
                _.div({ class: 'at-libraryVoiceFilters' },
                    _.Input({ label: 'Search voices', model: search, icon: 'search', placeholder: 'Name, language or description' }),
                    _.Select({ label: 'Voice type', model: type, options: [{ value: '', label: 'All types' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }] }),
                    _.Select({ label: 'Tone available', model: toneId, options: () => [{ value: '', label: 'Any tone' }, ...tones.value.map((tone) => ({ value: String(tone.id), label: `#${tone.id} · ${tone.name}` }))] }),
                ),
                () => {
                    const results = filteredVoiceSamples();
                    return results.length ? _.div({ class: 'at-libraryVoiceResults' }, results.map(({ voice, sample }) => _.article({ class: 'at-libraryVoiceResult' },
                        _.div({ class: 'at-libraryVoiceResultCopy' },
                            _.div({ class: 'at-libraryVoiceResultHead' }, _.strong(voice.name), _.span(`${voice.type} · ${voice.language.toUpperCase()}`)),
                            _.small(sample.description || voice.description || 'Voice reference'),
                            _.div({ class: 'at-libraryVoiceToneChips' }, _.span(
                                { style: { '--at-tone-color': sample.tone?.color || '#64748b' } },
                                `#${sample.tone?.id || sample.tone_id} · ${sample.tone?.name || 'Tone'}`,
                            ), sample.original_name ? _.span({ class: 'at-libraryVoiceSampleName' }, sample.original_name) : null),
                        ),
                        _.audio({ class: 'at-libraryVoicePreview', controls: true, preload: 'metadata', src: sample.audio_url }),
                        _.Btn({ dense: true, color: 'primary', icon: 'person_add', loading: assigning, onClick: () => chooseVoice(voice, sample, close) }, 'Use voice'),
                    ))) : _.div({ class: 'at-libraryVoiceEmpty' }, 'No library voice matches these filters.');
                },
                () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
                _.div({ class: 'at-libraryVoiceActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel')),
            ),
        },
    }).open();
}

function openAudioGeneratorSettingsDialog(keyBook) {
    const block = activeBlock();
    const settings = generatorSettings.value || {};
    const originalText = settings.original_text || block?.text_plain || '';
    const generatorText = _.rod(settings.generator_text || originalText);
    const saving = _.rod(false);
    const refreshing = _.rod(false);
    const advancedRules = _.rod(false);
    const status = _.rod(null);
    const tones = Array.isArray(settings.tones) ? settings.tones : [];
    const previewSettings = _.rod(settings);
    const splitToneModels = _.rod((Array.isArray(settings.splits) ? settings.splits : []).map((split) => _.rod(String(split.tone_id || ''))));
    const splitSettingKeys = ['comma_ms', 'semicolon_ms', 'sentence_ms', 'newline_ms', 'ellipsis_ms', 'dash_ms', 'min_words', 'split_characters'];
    const splitSettingModels = Object.fromEntries(splitSettingKeys.map((key) => [key, _.rod(String(settings.split_settings?.[key] ?? ''))]));

    const splitSettingsPayload = () => Object.fromEntries(splitSettingKeys.map((key) => [key, key === 'split_characters' ? splitSettingModels[key].value : Number(splitSettingModels[key].value)]));
    const infoTip = (text) => _.Tooltip({
        title: 'About this setting',
        text,
        placement: 'top',
        delay: 120,
    }, _.span({ class: 'at-audioGeneratorInfoTip' }, _.Icon({ name: 'info' })));
    const baseInput = (label, help, model, props = {}) => _.div({ class: 'at-audioGeneratorInputWithTip' },
        _.Input({ label, model, ...props }),
        infoTip(help),
    );
    const advancedInput = (label, help, model) => _.div({ class: 'at-audioGeneratorInputWithTip' },
        _.Input({ type: 'number', label, min: 0, max: 5000, model }),
        infoTip(help),
    );
    const payloadForSettings = () => ({
        generator_text: generatorText.value,
        tone_id: null,
        split_settings: splitSettingsPayload(),
        split_tones: splitToneModels.value.map((model) => model.value ? Number(model.value) : null),
    });

    const refreshSplits = async () => {
        refreshing.value = true;
        status.value = null;
        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generator-settings/preview`, {
                generator_text: generatorText.value,
                split_settings: splitSettingsPayload(),
            });
            const nextSettings = audioData(payload).generator_settings || previewSettings.value;
            previewSettings.value = nextSettings;
            splitToneModels.value = (nextSettings.splits || []).map((split) => _.rod(String(split.tone_id || '')));
            status.value = { type: 'success', message: 'Split preview updated. Review the tone for each split, then save the settings.' };
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to update the split list.' };
        } finally { refreshing.value = false; }
    };

    const save = async (close) => {
        saving.value = true;
        status.value = null;
        try {
            const payload = await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generator-settings`, payloadForSettings());
            generatorSettings.value = audioData(payload).generator_settings || generatorSettings.value;
            audioStatus.value = { type: 'success', message: 'Generator text saved for this paragraph version.' };
            close();
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to save the generator settings.' };
        } finally { saving.value = false; }
    };

    _.Dialog({
        size: 'xl',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('Text for audio generation'), _.span({ class: 'text-muted' }, 'Edit pronunciation text without changing the manuscript. It resets when the original paragraph is edited.')),
            content: ({ close }) => _.div({ class: 'at-audioGeneratorDialog' },
                _.div({ class: 'at-audioGeneratorTexts' },
                    _.div({ class: 'at-audioGeneratorOriginal' }, _.strong('Original text'), _.div({ class: 'at-audioGeneratorText' }, originalText)),
                    _.div({ class: 'at-audioGeneratorEditable' }, _.strong('Text sent to the generator'), _.Textarea({ label: false, model: generatorText, rows: 14, placeholder: 'Write the text the voice should pronounce.' })),
                ),
                _.div({ class: 'at-audioGeneratorSplitRules' },
                    _.div({ class: 'at-audioGeneratorSplitRulesHead' },
                        _.div(_.strong('Split rules for this paragraph'), _.small(() => previewSettings.value.is_split_customized ? 'Custom rules for this paragraph.' : 'Starts from the book defaults; saved changes apply only here.')),
                        _.Btn({ dense: true, color: 'secondary', icon: 'refresh', loading: refreshing, disabled: saving, onClick: refreshSplits }, 'Update splits'),
                    ),
                    _.div({ class: 'at-audioGeneratorRuleSection' },
                        _.div({ class: 'at-audioGeneratorRuleSectionHead' }, _.strong('Base'), infoTip('Choose which characters start a new audio request. Short requests are merged until they reach the minimum word count.')),
                        _.div({ class: 'at-audioGeneratorSplitRulesGrid at-audioGeneratorSplitRulesGrid--base' },
                            baseInput('Split characters', 'Each selected character ends one request and starts the next one.', splitSettingModels.split_characters, { placeholder: ',;:.!?…—-' }),
                            baseInput('Minimum words per split', 'Shorter pieces are merged with the next text until this word count is reached.', splitSettingModels.min_words, { type: 'number', min: 1, max: 100 }),
                        ),
                    ),
                    _.div({ class: 'at-audioGeneratorAdvancedToggle' },
                        () => _.Btn({ dense: true, color: 'secondary', icon: advancedRules.value ? 'expand_less' : 'expand_more', title: 'Control the silence added after each type of split.', onClick: () => { advancedRules.value = !advancedRules.value; } }, advancedRules.value ? 'Hide advanced settings' : 'Advanced settings'),
                        infoTip('Advanced settings control the pause after each split. They do not change where the text is divided.'),
                    ),
                    () => advancedRules.value ? _.div({ class: 'at-audioGeneratorRuleSection at-audioGeneratorRuleSection--advanced' },
                        _.div({ class: 'at-audioGeneratorRuleSectionHead' }, _.strong('Advanced pause settings'), infoTip('Set the silence, in milliseconds, added after a split created by each punctuation mark.')),
                        _.div({ class: 'at-audioGeneratorSplitRulesGrid' },
                            advancedInput('Comma pause (ms)', 'Silence added after a comma.', splitSettingModels.comma_ms),
                            advancedInput('Semicolon / colon (ms)', 'Silence added after a semicolon or colon.', splitSettingModels.semicolon_ms),
                            advancedInput('Sentence pause (ms)', 'Silence added after a period, question mark, or exclamation mark.', splitSettingModels.sentence_ms),
                            advancedInput('New line pause (ms)', 'Silence added after a line break.', splitSettingModels.newline_ms),
                            advancedInput('Ellipsis pause (ms)', 'Silence added after an ellipsis.', splitSettingModels.ellipsis_ms),
                            advancedInput('Dash pause (ms)', 'Silence added after a dash.', splitSettingModels.dash_ms),
                        ),
                    ) : null,
                ),
                () => {
                    const currentSettings = previewSettings.value;
                    const splits = Array.isArray(currentSettings.splits) ? currentSettings.splits : [];
                    const models = splitToneModels.value;
                    return _.div({ class: 'at-audioGeneratorSplits' },
                        _.div({ class: 'at-audioGeneratorSplitsHead' }, _.strong(`Generator splits (${splits.length})`), _.small('These are the requests sent to the audio generator.')),
                        ...splits.map((split, index) => _.article({ class: 'at-audioGeneratorSplit' },
                            _.div({ class: 'at-audioGeneratorSplitCopy' }, _.strong(`Split ${index + 1}`), _.span(split.text), split.pause_after_ms ? _.small(`Pause after: ${split.pause_after_ms}ms`) : null),
                            currentSettings.can_change_tone ? _.Select({ label: 'Tone', model: models[index], options: [{ value: '', label: 'Voice default' }, ...tones.map((tone) => ({ value: String(tone.id), label: tone.name }))] }) : null,
                        )),
                    );
                },
                !settings.can_change_tone && blockVoiceAssignment.value?.voice_profile ? _.small({ class: 'at-audioHint' }, 'This voice has one available tone, so its tone cannot be changed here.') : null,
                () => status.value ? _.Alert(status.value) : null,

            ),
            actions: ({ close }) => _.div({ class: 'at-audioGeneratorActions' },
                _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({
                    type: 'button',
                    color: 'primary',
                    icon: 'save',
                    loading: saving,
                    onClick: (event) => {
                        event?.preventDefault();
                        void save(close);
                    },
                }, 'Save generator settings'),
            )
        },
    }).open();
}

function createAudio() {
    const words = wordCount(activeBlock()?.text_plain);
    const seconds = estimatedSeconds();

    return _.div({ class: 'at-audioCreate' },
        _.div({ class: 'at-audioCostGrid' },
            _.div({ class: 'at-audioMetric' }, _.span('Selected text'), _.strong(`${words} words`)),
            _.div({ class: 'at-audioMetric' }, _.span('Estimated duration'), _.strong(`~${seconds}s`)),
            _.div({ class: 'at-audioMetric' }, _.span('AT estimate'), _.strong('1 credit')),
        ),
        _.div({ class: 'at-audioVoiceSelect' },
            _.div({ class: 'at-audioVoiceSelectCopy' },
                _.span(() => blockVoiceAssignment.value?.voice_profile?.role === 'character' ? 'Character' : 'AT voice'),
                _.strong(() => blockVoiceAssignment.value?.voice_profile?.name || 'No voice selected'),
                _.small(() => {
                    const profile = blockVoiceAssignment.value?.voice_profile;
                    if (!profile) return 'Assign a character, or choose a direct voice from your AT audio library.';
                    return profile.role === 'character' ? (profile.voice_id ? 'Character voice configured' : 'Choose a voice in the character settings.') : `${profile.voice_provider || 'AT voice'} · ${(profile.language || '').toUpperCase()}`;
                }),
            ),
            _.div({ class: 'at-audioVoiceSelectActions' },
                _.Btn({ color: 'secondary', icon: 'person', onClick: () => openParagraphCharacterDialog(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Choose character'),
                () => blockVoiceAssignment.value?.voice_profile?.role === 'character'
                    ? _.Btn({ color: 'secondary', icon: 'edit', onClick: () => openCharacterDialog(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1], blockVoiceAssignment.value.voice_profile) }, 'Edit character')
                    : _.Btn({ color: 'secondary', icon: 'record_voice_over', onClick: () => openLibraryVoiceDialog(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Choose voice'),
                () => blockVoiceAssignment.value?.voice_profile?.role === 'character'
                    ? _.Btn({ color: 'secondary', icon: 'link_off', title: 'Remove this character only from the selected paragraph', onClick: () => assignProfileToActiveBlock(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1], null) }, 'Clear character')
                    : null,
            ),
        ),
        _.div({ class: 'at-audioGenerationBar' },
            _.div({ class: 'at-audioGenerationControls' },
                _.Select({ label: 'Qwen model', model: qwenModel, options: [{ value: 'fast', label: 'Fast · 0.6B' }, { value: 'quality', label: 'Quality · 1.7B' }] }),
                _.Btn({ class: 'at-audioGeneratorSettingsButton', color: 'secondary', icon: 'tune', title: 'Edit the text sent to the audio generator', onClick: () => openAudioGeneratorSettingsDialog(bookKey()) }, 'Generator settings'),
                _.Btn({ class: 'at-audioGenerateButton', color: 'primary', icon: 'play_circle', loading: audioGenerating, onClick: () => generateSelectedAudio(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Generate audio'),
                () => audioGroups.value.length ? _.Btn({ class: 'at-audioListButton', color: 'secondary', icon: 'library_music', onClick: () => openAudioListDialog(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'List of audio') : null,
            ),
        ),
    );
}

function editorCard() {
    const content = () => ({
        styles: textStyle,
        create: createAudio,
    }[activeTab.value] || createAudio)();

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
    const readingStyle = () => {
        const design = designWithDraft();
        const layout = design.layout || defaultBookDesign().layout;
        const body = resolvedBookStyle('body', design);
        return `font-family:${body.font_family};font-size:${body.font_size}px;line-height:${body.line_height};color:${body.color};padding:${layout.content_padding}px;max-width:${layout.content_width}px;`;
    };
    const blockStyle = (block) => {
        const design = designWithDraft();
        const style = resolvedBookStyle(block.type === 'heading' ? 'heading' : 'body', design);
        return `font-family:${style.font_family};font-size:${style.font_size}px;line-height:${style.line_height};font-weight:${style.font_weight};font-style:${style.font_style};color:${style.color};text-align:${style.text_align};letter-spacing:${style.letter_spacing}px;text-transform:${style.text_transform};margin:${style.space_before}px 0 ${style.space_after}px;`;
    };
    const keyBook = window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1];

    const previewText = (block) => {
        const text = String(block.text_plain || '');
        const reading = readingPlayback.value;
        if (!reading || reading.blockUuid !== block.block_uuid || reading.start < 0 || reading.end <= reading.start) return text;

        return [
            text.slice(0, reading.start),
            _.span({ class: 'at-audioReadingWord' }, text.slice(reading.start, reading.end)),
            text.slice(reading.end),
        ];
    };

    return _.section({ class: () => audiobookViewMode.value === 'developer' ? 'at-audioPreviewCard is-developer' : 'at-audioPreviewCard' },
        _.article({ class: 'at-audioReading', style: readingStyle }, () => audiobookBlocks.value.length
            ? audiobookBlocks.value.map((block, index) => _.button({
                type: 'button',
                class: () => `at-audioReadingBlock ${index === activeBlockIndex.value ? 'is-selected' : ''} ${block.type === 'heading' ? 'is-heading' : ''}`,
                style: () => blockStyle(block),
                'data-audiobook-block-index': index,
                title: 'Select this text to create its audio',
                onclick: () => selectAudiobookBlock(index, keyBook),
            }, previewText(block)))
            : _.p({ class: 'at-audioReadingEmpty' }, audiobookBook.value ? 'This manuscript has no text blocks yet.' : 'Loading manuscript…'),
        ),
    );
}

function drawTimelineLabels(canvas, lanes, height, rulerHeight, rowHeight) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const width = rect.width;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#172033'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, width, rulerHeight);
    ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'middle';
    lanes.forEach(({ key: trackKey, label: name, color, lane }, index) => {
        const y = rulerHeight + index * rowHeight;
        const state = trackState.value[trackKey];
        ctx.fillStyle = index % 2 ? '#111b2b' : '#142033'; ctx.fillRect(0, y, width, rowHeight - 1);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(lane ? `${name} ${lane + 1}` : name, 18, y + rowHeight / 2);
        if (lane !== 0) return;
        ctx.fillStyle = state.muted ? '#ef4444' : '#94a3b8'; ctx.fillText('M', 72, y + rowHeight / 2);
        ctx.fillStyle = state.solo ? '#fbbf24' : '#64748b'; ctx.fillText('S', 94, y + rowHeight / 2);
        ctx.fillStyle = state.locked ? '#fbbf24' : '#64748b'; ctx.fillText('L', 116, y + rowHeight / 2);
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, y + rowHeight - 17); ctx.lineTo(128, y + rowHeight - 17); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(18 + (110 * state.volume / 100), y + rowHeight - 17, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.font = '18px Inter, sans-serif'; ctx.fillText('+', 145, y + rowHeight / 2); ctx.font = '11px Inter, sans-serif';
    });
}

function drawTimeline(canvas, labelCanvas) {
    const lanes = timelineLaneLayout();
    const rulerHeight = 34;
    const requestedHeight = Math.max(330, rulerHeight + lanes.length * 100);
    const duration = timelineDisplayDuration();
    const requestedWidth = timelineCanvasWidth(canvas, duration);
    if (Math.round(canvas.getBoundingClientRect().height) !== requestedHeight) canvas.style.height = `${requestedHeight}px`;
    if (Math.round(canvas.getBoundingClientRect().width) !== requestedWidth) canvas.style.width = `${requestedWidth}px`;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const rowHeight = (height - rulerHeight) / lanes.length;
    labelCanvas.style.height = `${requestedHeight}px`;
    drawTimelineLabels(labelCanvas, lanes, height, rulerHeight, rowHeight);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, width, rulerHeight);
    ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'middle';
    for (let second = 0; second <= duration; second += 5) {
        const x = width * second / duration;
        ctx.strokeStyle = second % 10 === 0 ? 'rgba(148,163,184,.34)' : 'rgba(148,163,184,.16)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.fillText(`${second}s`, x + 4, 17);
    }
    lanes.forEach(({ key: trackKey, label: name, color, lane }, index) => {
        const y = rulerHeight + index * rowHeight;
        ctx.fillStyle = index % 2 ? '#111b2b' : '#142033'; ctx.fillRect(0, y, width, rowHeight - 1);
        timelineItems.value.filter((item) => item.track === trackKey && Number(item.lane || 0) === lane).forEach((item) => {
            const x = width * (item.start_ms / 1000) / duration;
            const clipWidth = Math.max(28, width * (item.duration_ms / 1000) / duration);
            const selected = selectedTimelineItemKeys.value.includes(timelineItemKey(item));
            const expanded = isTimelineGroupExpanded(item);
            const clipY = y + 9;
            const clipHeight = rowHeight - 19;
            ctx.fillStyle = item.muted ? '#64748b' : color; ctx.fillRect(x, clipY, clipWidth, clipHeight);
            if (expanded) {
                timelinePlayableParts(item).forEach((part, partIndex) => {
                    const partX = x + clipWidth * (part.timeline_offset_ms / Math.max(1, item.duration_ms));
                    const partWidth = clipWidth * (Number(part.playable_duration_ms || 0) / Math.max(1, item.duration_ms));
                    if (partWidth < 3) return;
                    ctx.fillStyle = item.muted ? '#64748b' : (partIndex % 2 ? '#1d4ed8' : '#2563eb');
                    ctx.fillRect(partX + 1, clipY + 2, Math.max(1, partWidth - 3), clipHeight - 4);
                    const partUrl = timelineAudioUrl(part);
                    drawWaveform(ctx, partUrl ? timelineWaveform(partUrl) : null, partX + 1, clipY + 2, Math.max(1, partWidth - 3), clipHeight - 4, 'rgba(255,255,255,.58)');
                    if (partWidth > 44) {
                        ctx.fillStyle = 'rgba(255,255,255,.92)';
                        ctx.fillText(`${partIndex + 1}`, partX + 6, y + rowHeight / 2);
                    }
                });
            } else {
                drawTimelineClipWaveforms(ctx, item, x, clipY, clipWidth, clipHeight);
            }
            if (selected) {
                ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 10, Math.max(1, clipWidth - 2), rowHeight - 21);
                ctx.fillStyle = '#f8fafc'; ctx.fillRect(x, y + 9, 5, rowHeight - 19); ctx.fillRect(x + clipWidth - 5, y + 9, 5, rowHeight - 19);
            }
            const fadeInWidth = Math.min(clipWidth / 2, clipWidth * ((item.fade_in_ms || 0) / Math.max(1, item.duration_ms)));
            const fadeOutWidth = Math.min(clipWidth / 2, clipWidth * ((item.fade_out_ms || 0) / Math.max(1, item.duration_ms)));
            if (fadeInWidth || fadeOutWidth) {
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.25; ctx.beginPath();
                if (fadeInWidth) { ctx.moveTo(x + 2, y + rowHeight - 13); ctx.lineTo(x + fadeInWidth, y + 13); }
                if (fadeOutWidth) { ctx.moveTo(x + clipWidth - fadeOutWidth, y + 13); ctx.lineTo(x + clipWidth - 2, y + rowHeight - 13); }
                ctx.stroke();
            }
            const gainY = timelineClipGainY(clipY, clipHeight, item.volume);
            ctx.strokeStyle = selected ? 'rgba(255,255,255,.96)' : 'rgba(255,255,255,.54)';
            ctx.lineWidth = selected ? 1.5 : 1;
            ctx.beginPath(); ctx.moveTo(x + 3, gainY); ctx.lineTo(x + clipWidth - 3, gainY); ctx.stroke();
            if (selected) {
                ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(x + clipWidth - 7, gainY, 3, 0, Math.PI * 2); ctx.fill();
                if (clipWidth > 72) {
                    ctx.fillStyle = 'rgba(255,255,255,.95)';
                    ctx.fillText(`${Math.round(Number(item.volume ?? 100))}%`, x + 8, Math.max(clipY + 11, gainY - 7));
                }
            }
            if (!expanded && item.is_group && Array.isArray(item.group_segments)) {
                const trimStart = Number(item.trim_start_ms || 0);
                const trimEnd = timelineSourceDuration(item) - Number(item.trim_end_ms || 0);
                let groupOffset = 0;
                ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
                item.group_segments.slice(0, -1).forEach((segment) => {
                    groupOffset += Number(segment.duration_ms || 0) + Number(segment.pause_after_ms || 0);
                    if (groupOffset <= trimStart || groupOffset >= trimEnd) return;
                    const dividerX = x + clipWidth * ((groupOffset - trimStart) / Math.max(1, item.duration_ms));
                    ctx.beginPath(); ctx.moveTo(dividerX, y + 11); ctx.lineTo(dividerX, y + rowHeight - 12); ctx.stroke();
                });
            }
            if (!expanded) {
                ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillText(item.label, x + 6, y + rowHeight / 2);
            }
        });
    });
    timelineCues.value.forEach((cue) => {
        const x = width * cue / duration;
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 7); ctx.closePath(); ctx.fill();
    });
    const loop = timelineLoopRange.value;
    if (loop) {
        const loopStartX = width * loop.start / duration;
        const loopEndX = width * loop.end / duration;
        ctx.fillStyle = 'rgba(59,130,246,.13)'; ctx.fillRect(loopStartX, rulerHeight, Math.max(1, loopEndX - loopStartX), height - rulerHeight);
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(loopStartX, 0); ctx.lineTo(loopStartX, height); ctx.moveTo(loopEndX, 0); ctx.lineTo(loopEndX, height); ctx.stroke();
        ctx.fillStyle = '#bfdbfe'; ctx.fillText('LOOP', loopStartX + 5, 17);
    }
    const playheadX = width * timelinePlayhead.value / duration;
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, height); ctx.stroke();
}

function timelineCard() {
    const canvas = document.createElement('canvas');
    canvas.className = 'at-audioTimelineCanvas';
    const labelCanvas = document.createElement('canvas');
    labelCanvas.className = 'at-audioTimelineLabelsCanvas';
    const channelViewport = document.createElement('div');
    channelViewport.className = 'at-audioTimelineChannelViewport';
    channelViewport.append(labelCanvas);
    const scroller = document.createElement('div');
    scroller.className = 'at-audioTimelineScroller';
    scroller.tabIndex = 0;
    scroller.setAttribute('aria-label', 'Scrollable audio timeline');
    scroller.append(canvas);
    const render = () => drawTimeline(canvas, labelCanvas);
    renderTimeline = render;
    let drag = null;
    const geometry = (event) => {
        const rect = canvas.getBoundingClientRect();
        const duration = timelineDisplayDuration();
        const lanes = timelineLaneLayout();
        const rowHeight = (rect.height - 34) / lanes.length;
        const laneIndex = Math.max(0, Math.min(lanes.length - 1, Math.floor((event.clientY - rect.top - 34) / rowHeight)));
        const laneData = lanes[laneIndex];
        const seconds = ((event.clientX - rect.left) / rect.width) * duration;
        return { rect, duration, rowHeight, track: laneData.key, lane: laneData.lane, seconds };
    };
    labelCanvas.addEventListener('pointerdown', (event) => {
        const rect = labelCanvas.getBoundingClientRect();
        const rulerHeight = 34;
        if (event.clientY - rect.top < rulerHeight) return;
        const lanes = timelineLaneLayout();
        const rowHeight = (rect.height - rulerHeight) / lanes.length;
        const laneIndex = Math.max(0, Math.min(lanes.length - 1, Math.floor((event.clientY - rect.top - rulerHeight) / rowHeight)));
        const laneData = lanes[laneIndex];
        if (laneData.lane !== 0) return;
        const x = event.clientX - rect.left;
        const localY = event.clientY - rect.top - rulerHeight - laneIndex * rowHeight;
        const next = { ...trackState.value, [laneData.key]: { ...trackState.value[laneData.key] } };
        if (x >= 140) {
            if (laneData.key === 'music' || laneData.key === 'fx') openTimelineMediaDialog(laneData.key);
            else addTimelineItem(laneData.key);
            render();
            return;
        }
        if (localY > rowHeight - 30 && x <= 140) next[laneData.key].volume = Math.round(Math.max(0, Math.min(100, ((x - 18) / 110) * 100)));
        else if (x >= 54 && x < 92) next[laneData.key].muted = !next[laneData.key].muted;
        else if (x >= 92 && x < 117) next[laneData.key].solo = !next[laneData.key].solo;
        else if (x >= 117 && x < 140) next[laneData.key].locked = !next[laneData.key].locked;
        trackState.value = next;
        render();
    });
    canvas.addEventListener('pointerdown', (event) => {
        const rect = canvas.getBoundingClientRect();
        const headerY = event.clientY - rect.top;
        if (headerY < 34) {
            const { seconds } = geometry(event);
            setTimelinePlayhead(seconds);
            render(); return;
        }
        const { duration, track: trackAt, lane: laneAt, seconds } = geometry(event);
        const item = [...timelineItems.value].reverse().find((candidate) => candidate.track === trackAt && Number(candidate.lane || 0) === laneAt && seconds >= candidate.start_ms / 1000 && seconds <= (candidate.start_ms + candidate.duration_ms) / 1000);
        if (item) {
            // Clicking the waveform is also a transport seek. Previously it
            // only selected the clip, leaving Play at the old timeline point.
            setTimelinePlayhead(seconds);
            const key = timelineItemKey(item);
            selectTimelineItem(item, event.shiftKey);
            if (!trackState.value[trackAt].locked) {
                const edgeSeconds = Math.max(.35, duration * 10 / Math.max(1, rect.width));
                const clipStart = item.start_ms / 1000;
                const clipEnd = clipStart + item.duration_ms / 1000;
                const selection = selectedTimelineItems();
                const lanes = timelineLaneLayout();
                const rowHeight = (rect.height - 34) / lanes.length;
                const laneIndex = lanes.findIndex((lane) => lane.key === trackAt && Number(lane.lane || 0) === Number(laneAt || 0));
                const clipY = 34 + laneIndex * rowHeight + 9;
                const clipHeight = rowHeight - 19;
                const gainY = timelineClipGainY(clipY, clipHeight, item.volume);
                const isGainHandle = Math.abs(event.clientY - rect.top - gainY) <= 8;
                const mode = isGainHandle ? 'volume' : (selection.length > 1 ? 'move-group' : (seconds - clipStart < edgeSeconds ? 'trim-start' : clipEnd - seconds < edgeSeconds ? 'trim-end' : 'move'));
                drag = { key, item, items: selection, mode, offset: seconds - clipStart, end: clipEnd, sourceDuration: timelineSourceDuration(item), before: timelineSnapshot(), changed: false };
                canvas.setPointerCapture(event.pointerId);
            }
            render(); return;
        }
        selectedTimelineItemKey.value = null;
        selectedTimelineItemKeys.value = [];
        setTimelinePlayhead(seconds);
        const cue = Math.round(seconds);
        timelineCues.value = [...timelineCues.value, Math.max(0, cue)].sort((a, b) => a - b);
        render();
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const { track, lane, seconds, duration } = geometry(event);
        const key = drag.key;
        if (drag.mode === 'volume') {
            const lanes = timelineLaneLayout();
            const rowHeight = (canvas.getBoundingClientRect().height - 34) / lanes.length;
            const laneIndex = lanes.findIndex((entry) => entry.key === drag.item.track && Number(entry.lane || 0) === Number(drag.item.lane || 0));
            const clipY = 34 + laneIndex * rowHeight + 9;
            const clipHeight = rowHeight - 19;
            const localY = event.clientY - canvas.getBoundingClientRect().top;
            const targetVolume = Math.round(Math.max(0, Math.min(100, (1 - (localY - clipY) / Math.max(1, clipHeight)) * 100)));
            const originals = new Map(drag.items.map((item) => [timelineItemKey(item), Number(item.volume ?? 100)]));
            const delta = targetVolume - Number(drag.item.volume ?? 100);
            timelineItems.value = timelineItems.value.map((item) => {
                const original = originals.get(timelineItemKey(item));
                if (original === undefined) return item;
                const volume = Math.max(0, Math.min(100, original + delta));
                drag.changed ||= volume !== original;
                return { ...item, volume };
            });
        } else if (drag.mode === 'move' || drag.mode === 'move-group') {
            const dragKeys = drag.items.map(timelineItemKey);
            const start = magnetizeTimelineTime(Math.max(0, seconds - drag.offset), duration, dragKeys);
            const startMs = Math.round(start * 1000);
            if (drag.mode === 'move-group') {
                const deltaMs = startMs - Number(drag.item.start_ms || 0);
                const originals = new Map(drag.items.map((item) => [timelineItemKey(item), item]));
                const overlaps = drag.items.some((original) => timelineTrackOverlaps(
                    original.track,
                    Math.max(0, Number(original.start_ms || 0) + deltaMs),
                    Number(original.duration_ms || 0),
                    dragKeys,
                ));
                if (overlaps) { render(); return; }
                drag.changed ||= deltaMs !== 0;
                timelineItems.value = timelineItems.value.map((item) => {
                    const original = originals.get(timelineItemKey(item));
                    if (!original) return item;
                    const nextStart = Math.max(0, Number(original.start_ms || 0) + deltaMs);
                    drag.changed ||= nextStart !== Number(original.start_ms || 0);
                    return { ...item, start_ms: nextStart };
                });
            } else {
                // Keep the lane selected by the user. Collisions are blocked
                // instead of creating an automatic mix lane.
                const nextLane = lane;
                if (timelineTrackOverlaps(track, startMs, Number(drag.item.duration_ms || 0), key)) { render(); return; }
                drag.changed ||= drag.item.track !== track || Number(drag.item.lane || 0) !== nextLane || drag.item.start_ms !== startMs;
                updateTimelineItem(key, (item) => ({ ...item, track, lane: nextLane, start_ms: startMs }));
            }
        } else if (drag.mode === 'trim-start') {
            const start = Math.min(drag.end - .25, magnetizeTimelineTime(seconds, duration, key));
            updateTimelineItem(key, (item) => {
                const delta = Math.round((start - drag.item.start_ms / 1000) * 1000);
                const next = { ...item, start_ms: Math.round(start * 1000), duration_ms: Math.round((drag.end - start) * 1000), trim_start_ms: Math.max(0, Number(drag.item.trim_start_ms || 0) + delta) };
                if (timelineTrackOverlaps(next.track, next.start_ms, next.duration_ms, key)) return item;
                drag.changed ||= next.start_ms !== drag.item.start_ms || next.duration_ms !== drag.item.duration_ms || next.trim_start_ms !== Number(drag.item.trim_start_ms || 0);
                return next;
            });
        } else {
            const end = Math.max(drag.item.start_ms / 1000 + .25, magnetizeTimelineTime(seconds, duration, key));
            updateTimelineItem(key, (item) => {
                const removed = Math.round((drag.item.start_ms / 1000 + drag.item.duration_ms / 1000 - end) * 1000);
                const next = { ...item, duration_ms: Math.round((end - item.start_ms / 1000) * 1000), trim_end_ms: Math.max(0, Number(drag.item.trim_end_ms || 0) + removed) };
                if (timelineTrackOverlaps(next.track, next.start_ms, next.duration_ms, key)) return item;
                drag.changed ||= next.duration_ms !== drag.item.duration_ms || next.trim_end_ms !== Number(drag.item.trim_end_ms || 0);
                return next;
            });
        }
        render();
    });
    canvas.addEventListener('pointerup', () => {
        if (drag?.changed) {
            rememberTimelineSnapshot(drag.before);
            scheduleTimelineSave(bookKey());
        }
        drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('dblclick', (event) => {
        const { track, lane, seconds } = geometry(event);
        const item = [...timelineItems.value].reverse().find((candidate) => candidate.track === track && Number(candidate.lane || 0) === lane && seconds >= candidate.start_ms / 1000 && seconds <= (candidate.start_ms + candidate.duration_ms) / 1000);
        if (!item?.is_group) return;
        event.preventDefault();
        drag = null;
        selectTimelineItem(item);
        toggleTimelineGroup(item);
        render();
    });
    scroller.addEventListener('scroll', () => { labelCanvas.style.transform = `translateY(${-scroller.scrollTop}px)`; }, { passive: true });
    window.requestAnimationFrame(render);
    window.addEventListener('resize', render, { passive: true });
    window.addEventListener('keydown', (event) => {
        const tag = event.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
        const modifier = event.metaKey || event.ctrlKey;
        if (modifier && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? redoTimeline(bookKey()) : undoTimeline(bookKey());
        } else if (modifier && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            redoTimeline(bookKey());
        } else if (modifier && event.key.toLowerCase() === 'd') {
            event.preventDefault();
            duplicateSelectedTimelineItem(bookKey());
        } else if (event.key.toLowerCase() === 's' && selectedTimelineItem() && !selectedTimelineItem().is_group) {
            event.preventDefault();
            splitSelectedTimelineItem(bookKey());
        } else if (event.key.toLowerCase() === 'u' && selectedTimelineItem()?.is_group) {
            event.preventDefault();
            ungroupSelectedTimelineItem(bookKey());
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTimelineItem()) {
            event.preventDefault();
            removeSelectedTimelineItem(bookKey());
        } else if (event.key === 'Escape') {
            selectedTimelineItemKey.value = null;
            selectedTimelineItemKeys.value = [];
            render();
        }
    });

    return _.section({ class: 'at-audioTimelineCard' },
        _.div({ class: 'at-audioTimelineToolbar' },
            _.div({ class: 'at-audioTimelineTransport' },
                _.div({ class: 'at-audioToolbarGroup at-audioToolbarGroup--transport' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'skip_previous', title: 'Previous block', onClick: () => { activeBlockIndex.value = Math.max(0, activeBlockIndex.value - 1); } }),
                    _.Btn({ dense: true, class: 'at-audioPlayButton', color: 'primary', icon: 'play_arrow', title: 'Play timeline', disabled: () => timelineIsPlaying.value, onClick: () => startTimelinePlayback(render) }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'pause', title: 'Pause timeline', disabled: () => !timelineIsPlaying.value, onClick: () => pauseTimelinePlayback() }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'stop', title: 'Stop timeline', onClick: () => { stopTimelinePlayback(); audioStatus.value = null; render(); } }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'skip_next', title: 'Next block', onClick: () => { activeBlockIndex.value = Math.min(audiobookBlocks.value.length - 1, activeBlockIndex.value + 1); } }),
                ),
                _.span({ class: 'at-audioTimecode' }, () => `00:00:${String(Math.floor(timelinePlayhead.value)).padStart(2, '0')}`),
            ),
            _.div({ class: 'at-audioTimelineActions' },
                _.div({ class: 'at-audioToolbarGroup', title: 'View mode' },
                    _.Btn({ dense: true, color: () => audiobookViewMode.value === 'developer' ? 'primary' : 'secondary', icon: 'code', title: 'Developer view', onClick: () => { audiobookViewMode.value = 'developer'; } }),
                    _.Btn({ dense: true, color: () => audiobookViewMode.value === 'preview' ? 'primary' : 'secondary', icon: 'visibility', title: 'Preview view', onClick: () => { audiobookViewMode.value = 'preview'; } }),
                ),
                _.div({ class: 'at-audioToolbarGroup', title: 'History' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'undo', title: 'Undo (Ctrl/Cmd + Z)', disabled: () => !timelineUndoStack.value.length, onClick: () => undoTimeline(bookKey()) }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'redo', title: 'Redo (Ctrl/Cmd + Shift + Z)', disabled: () => !timelineRedoStack.value.length, onClick: () => redoTimeline(bookKey()) }),
                ),
                _.div({ class: 'at-audioToolbarGroup', title: 'Timeline zoom' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'zoom_out', title: 'Zoom out', onClick: () => { timelineZoom.value = Math.max(.5, timelineZoom.value - .25); render(); } }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'zoom_in', title: 'Zoom in', onClick: () => { timelineZoom.value = Math.min(2, timelineZoom.value + .25); render(); } }),
                ),
                _.div({ class: 'at-audioToolbarGroup', title: 'Add media' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'library_music', title: 'Choose music from audio library', onClick: () => openTimelineMediaDialog('music') }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'waves', title: 'Choose FX from audio library', onClick: () => openTimelineMediaDialog('fx') }),
                ),
                _.div({ class: 'at-audioToolbarGroup at-audioToolbarGroup--save' },
                    _.Btn({ dense: true, color: 'primary', icon: 'save', title: 'Save timeline', onClick: () => saveTimeline(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }),
                ),
            ),
        ),
        _.div({ class: 'at-audioTimelineInspector' }, () => selectedTimelineItem() ? (() => {
            const item = selectedTimelineItem();
            const selection = selectedTimelineItems();
            const multiple = selection.length > 1;
            return _.div({ class: 'at-audioTimelineSelection' },
                _.div({ class: 'at-audioSelectionSummary' },
                    _.strong({ class: 'at-audioInspectorLabel' }, multiple ? `${selection.length} clips selected` : item.label),
                    _.span(multiple ? `Group selection · ${timelinePersistence.value === 'saving' ? 'Saving…' : timelinePersistence.value === 'error' ? 'Save failed' : 'Saved'}` : `${item.track.toUpperCase()} · ${timelineSnap(item.start_ms / 1000).toFixed(2)}s · ${timelineSnap(item.duration_ms / 1000).toFixed(2)}s · ${timelinePersistence.value === 'saving' ? 'Saving…' : timelinePersistence.value === 'error' ? 'Save failed' : 'Saved'}`),
                    _.small(multiple ? 'Shift+click adds clips · Drag to move the selection together' : (item.is_group ? `${item.group_segments?.length || 0} clips · Double click the master to ${isTimelineGroupExpanded(item) ? 'collapse' : 'expand'}` : 'Drag center to move · edges to trim')),
                ),
                _.div({ class: 'at-audioClipControls' },
                    _.div({ class: 'at-audioInspectorGroup' },
                        _.span({ class: 'at-audioInspectorGroupLabel' }, 'Level'),
                        _.Btn({ dense: true, color: 'secondary', icon: 'volume_off', title: 'Toggle clip mute', onClick: () => updateSelectedTimelineItem((item) => ({ ...item, muted: !item.muted })) }),
                        _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `${selectedTimelineItem().volume ?? 100}%` : '—'),
                        _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Lower clip volume', onClick: () => adjustSelectedTimelineItem('volume', -5, 100) }),
                        _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Raise clip volume', onClick: () => adjustSelectedTimelineItem('volume', 5, 100) }),
                    ),
                    _.div({ class: 'at-audioInspectorGroup' },
                        _.span({ class: 'at-audioInspectorGroupLabel' }, 'Fade in'),
                        _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `${selectedTimelineItem().fade_in_ms || 0}ms` : '—'),
                        _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Reduce fade in', onClick: () => adjustSelectedTimelineItem('fade_in_ms', -100) }),
                        _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Increase fade in', onClick: () => { const item = selectedTimelineItem(); adjustSelectedTimelineItem('fade_in_ms', 100, Math.floor((item?.duration_ms || 0) / 2)); } }),
                    ),
                    _.div({ class: 'at-audioInspectorGroup' },
                        _.span({ class: 'at-audioInspectorGroupLabel' }, 'Fade out'),
                        _.span({ class: 'at-audioClipValue' }, () => selectedTimelineItem() ? `${selectedTimelineItem().fade_out_ms || 0}ms` : '—'),
                        _.Btn({ dense: true, color: 'secondary', icon: 'remove', title: 'Reduce fade out', onClick: () => adjustSelectedTimelineItem('fade_out_ms', -100) }),
                        _.Btn({ dense: true, color: 'secondary', icon: 'add', title: 'Increase fade out', onClick: () => { const item = selectedTimelineItem(); adjustSelectedTimelineItem('fade_out_ms', 100, Math.floor((item?.duration_ms || 0) / 2)); } }),
                    ),
                ),
                _.div({ class: 'at-audioInspectorGroup at-audioInspectorGroup--actions' },
                    !multiple && item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: isTimelineGroupExpanded(item) ? 'unfold_less' : 'unfold_more', title: isTimelineGroupExpanded(item) ? 'Collapse clips' : 'Expand clips', onClick: () => toggleTimelineGroup(item) }) : null,
                    !multiple && item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: 'call_split', title: 'Ungroup selected audio', onClick: () => ungroupSelectedTimelineItem(bookKey()) }) : null,
                    multiple ? _.Btn({ dense: true, color: 'secondary', icon: 'folder_zip', title: 'Group selected clips', disabled: !canGroupTimelineItems(selection), onClick: () => groupSelectedTimelineItems(bookKey()) }) : null,
                    !multiple && !item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: 'content_cut', title: 'Split clip at playhead', onClick: () => splitSelectedTimelineItem(bookKey()) }) : null,
                    _.Btn({ dense: true, color: () => timelineLoopRange.value ? 'primary' : 'secondary', icon: 'repeat', title: 'Loop selected clip(s)', onClick: toggleTimelineLoop }),
                    _.Btn({ dense: true, color: 'secondary', icon: 'content_copy', title: 'Duplicate selected clip', onClick: () => duplicateSelectedTimelineItem(bookKey()) }),
                    _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Remove selected clip', onClick: () => removeSelectedTimelineItem(bookKey()) }),
                ),
            );
        })() : _.div({ class: 'at-audioTimelineEmptySelection' }, _.Icon ? _.Icon({ name: 'ads_click' }) : null, _.span('Select a clip to edit its level, fades and grouping.'))),
        _.div({ class: 'at-audioTimelineFrame' }, channelViewport, scroller),
    );
}

export default function audiobookEdit(ctx) {
    const keyBook = bookKey(ctx);
    loadAudiobook(keyBook); loadTimeline(keyBook);
    loadBlockAudio(keyBook);
    window.AudiobookTools?.setPageHeaderActions?.([
        _.Btn({ color: 'secondary', onClick: () => _.router.navigate(`/dashboard/book/${keyBook}/panel`) }, 'Book panel'),
        _.Btn({ color: 'primary', icon: 'publish', loading: publishRunning, onClick: () => openPublishDialog(keyBook) }, 'Publish audiobook'),
    ]);

    return _.main({ class: 'at-audiobookPage' },
        _.div({ class: 'at-audiobookTopbar' },
            _.div(_.span({ class: 'at-audiobookEyebrow' }, 'Audiobook studio'), _.h2(() => audiobookBook.value?.name || 'Loading audiobook…')),
            _.div({ class: 'at-audiobookTopbarActions' },
                _.Btn({ color: 'secondary', icon: 'graphic_eq', onClick: openAudioDirectionDialog }, 'Audio direction'),
                _.Btn({ color: 'secondary', icon: 'queue_play_next', loading: bookAudioGenerating, onClick: () => openGenerateBookAudioDialog(keyBook) }, 'Generate book audio'),
                _.Btn({ color: 'secondary', icon: 'playlist_add', loading: allAudioInserting, onClick: () => openInsertAllAudioDialog(keyBook) }, 'Insert all audio'),
                _.Btn({ color: 'secondary', icon: 'format_list_bulleted', onClick: (event) => openAudiobookIndexMenu(event.currentTarget, keyBook) }, 'Book index'),
            ),
        ),
        () => audioStatus.value ? _.Alert({ type: audioStatus.value.type, message: audioStatus.value.message }) : null,
        _.div({ class: 'at-audiobookWorkspace' },
            editorCard(),
            previewCard(),
        ),
        timelineCard(),
    );
}
