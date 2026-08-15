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
const audioGroups = _.rod([]);
const expandedAudioGroupIds = _.rod([]);
const audioGenerating = _.rod(false);
const selectedLibraryVoice = _.rod(null);
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
function stopTimelinePlayers() {
    timelinePlayers.forEach((audio) => { audio.pause(); });
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
    audio._atPendingMediaTime = null;
    // A seek issued before metadata is available is not reliable in every
    // browser. Keep the requested position and apply it as soon as this WAV
    // is seekable, instead of retrying it on every animation frame.
    audio.addEventListener('loadedmetadata', () => {
        if (!Number.isFinite(audio._atPendingMediaTime)) return;
        try { audio.currentTime = audio._atPendingMediaTime; } catch { }
        audio._atPendingMediaTime = null;
    });
    audio.load();
    timelinePlayers.set(key, audio);
    return audio;
}
function seekTimelinePlayer(audio, mediaTime) {
    if (audio.readyState < 1) {
        audio._atPendingMediaTime = mediaTime;
        return;
    }
    try { audio.currentTime = mediaTime; } catch { }
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
        if (seek || !audio._atTimelineActive) seekTimelinePlayer(audio, mediaTime);
        audio._atTimelineActive = true;
        if (audio.paused) audio.play().catch(() => { });
    }));
    timelinePlayers.forEach((audio, key) => {
        if (!activeKeys.has(key)) { audio.pause(); audio._atTimelineActive = false; }
    });
    const current = readingPlayback.value;
    if (!current || !nextReading || current.blockUuid !== nextReading.blockUuid || current.start !== nextReading.start || current.end !== nextReading.end) {
        readingPlayback.value = nextReading;
    }
}
function stopTimelinePlayback() {
    if (timelineFrame) window.cancelAnimationFrame(timelineFrame);
    timelineFrame = null;
    timelineIsPlaying.value = false;
    stopTimelinePlayers();
    readingPlayback.value = null;
}
function startTimelinePlayback(render) {
    if (timelineIsPlaying.value) return;
    const available = timelineItems.value.some((item) => timelineAudioUrl(item));
    if (!available) audioStatus.value = { type: 'info', message: 'The playhead is running. There are no playable audio files in the timeline yet.' };
    // Coqui creates many short WAV parts. Preloading them prevents a network
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

    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio`);
        const data = audioData(payload);
        audioSegments.value = data.segments || [];
        audioGroups.value = data.groups || [];
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to load generated audio clips.' };
    }
}

async function generateSelectedAudio(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid || audioGenerating.value) return;
    const providerKey = 'coqui-local';
    const model = 'xtts-v2';

    if (!selectedLibraryVoice.value) {
        audioStatus.value = { type: 'danger', message: 'Select an AT library voice before generating audio.' };
        return;
    }

    audioGenerating.value = true;
    audioStatus.value = { type: 'info', message: 'Coqui is generating the WAV file. Longer paragraphs can take a minute or more.' };
    try {
        const generated = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/generate`, {
            provider_key: providerKey,
            model,
        }, providerKey === 'coqui-local' ? { timeout: 900000, retry: { attempts: 0 } } : undefined);
        const data = audioData(generated);
        await loadBlockAudio(keyBook);
        audioStatus.value = { type: 'success', message: `Audio group generated with ${data.segments?.length || 1} timed clips. Insert it in the timeline when you are ready.` };
    } catch (error) {
        audioStatus.value = { type: 'danger', message: error.message || 'Unable to generate audio for this block.' };
    } finally {
        audioGenerating.value = false;
    }
}

async function insertAudioGroup(keyBook, jobId) {
    const block = activeBlock();
    if (!block?.block_uuid) return;
    try {
        const startMs = Math.round(Math.max(0, timelinePlayhead.value) * 1000);
        const group = audioGroups.value.find((candidate) => Number(candidate.id) === Number(jobId));
        await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/audio/${encodeURIComponent(jobId)}/insert-timeline`, {
            start_ms: startMs,
            lane: firstAvailableTimelineLane('voice', startMs, Number(group?.duration_ms || 1000)),
        });
        await loadTimeline(keyBook);
        audioStatus.value = { type: 'success', message: 'Audio group inserted into the Voice track.' };
        window.requestAnimationFrame(() => document.querySelector('.at-audioTimelineCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (error) { audioStatus.value = { type: 'danger', message: error.message || 'Unable to insert this audio group.' }; }
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

    const filteredVoices = () => {
        const query = search.value.trim().toLowerCase();
        const selectedTone = Number(toneId.value || 0);
        return voices.value.filter((voice) => {
            const haystack = `${voice.name} ${voice.language} ${voice.description || ''}`.toLowerCase();
            return (!query || haystack.includes(query))
                && (!type.value || voice.type === type.value)
                && (!selectedTone || voice.samples.some((sample) => Number(sample.tone_id || sample.tone?.id) === selectedTone));
        });
    };

    const chooseVoice = async (voice, close) => {
        const block = activeBlock();
        if (!block?.block_uuid) return;
        assigning.value = true;
        dialogStatus.value = null;
        const requestedToneId = Number(toneId.value || 0) || Number(voice.samples[0]?.tone_id || voice.samples[0]?.tone?.id || 0) || null;
        try {
            await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(block.block_uuid)}/library-voice`, {
                audio_library_voice_id: voice.id,
                tone_id: requestedToneId,
            }, { timeout: 900000, retry: { attempts: 0 } });
            selectedLibraryVoice.value = { ...voice, selected_tone_id: requestedToneId };
            voiceName.value = voice.name;
            audioStatus.value = { type: 'success', message: `${voice.name} is assigned to this block and ready for AT generation.` };
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
            header: _.div(_.h3('Choose an AT voice'), _.span({ class: 'text-muted' }, 'Search your audio library and choose a voice reference for this block.')),
            content: ({ close }) => _.div({ class: 'at-libraryVoiceDialog' },
                _.div({ class: 'at-libraryVoiceFilters' },
                    _.Input({ label: 'Search voices', model: search, icon: 'search', placeholder: 'Name, language or description' }),
                    _.Select({ label: 'Voice type', model: type, options: [{ value: '', label: 'All types' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }] }),
                    _.Select({ label: 'Tone available', model: toneId, options: () => [{ value: '', label: 'Any tone' }, ...tones.value.map((tone) => ({ value: String(tone.id), label: `#${tone.id} · ${tone.name}` }))] }),
                ),
                () => {
                    const results = filteredVoices();
                    return results.length ? _.div({ class: 'at-libraryVoiceResults' }, results.map((voice) => _.button({
                        type: 'button',
                        class: 'at-libraryVoiceResult',
                        onclick: () => chooseVoice(voice, close),
                    },
                        _.div({ class: 'at-libraryVoiceResultHead' }, _.strong(voice.name), _.span(`${voice.type} · ${voice.language.toUpperCase()}`)),
                        _.small(voice.description || 'No description'),
                        _.div({ class: 'at-libraryVoiceToneChips' }, voice.samples.map((sample) => _.span(
                            { style: { '--at-tone-color': sample.tone?.color || '#64748b' } },
                            `#${sample.tone?.id || sample.tone_id} · ${sample.tone?.name || 'Tone'}`,
                        ))),
                    ))) : _.div({ class: 'at-libraryVoiceEmpty' }, 'No library voice matches these filters.');
                },
                () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
                _.div({ class: 'at-libraryVoiceActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel')),
            ),
        },
    }).open();
}

function createAudio() {
    const words = wordCount(activeBlock()?.text_plain);
    const seconds = estimatedSeconds();

    return _.div({ class: 'at-audioCreate' },
        _.div({ class: 'at-audioVoiceSelect' },
            _.div(_.span('AT voice'), _.strong(() => selectedLibraryVoice.value?.name || 'No voice selected'), _.small(() => selectedLibraryVoice.value ? `${selectedLibraryVoice.value.type} · ${selectedLibraryVoice.value.language.toUpperCase()}` : 'Choose a saved voice reference from your AT audio library.')),
            _.Btn({ color: 'secondary', icon: 'record_voice_over', onClick: () => openLibraryVoiceDialog(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Choose voice'),
        ),
        _.div({ class: 'at-audioCostGrid' },
            _.div(_.span('Selected text'), _.strong(`${words} words`)),
            _.div(_.span('Estimated duration'), _.strong(`~${seconds}s`)),
            _.div(_.span('AT estimate'), _.strong('1 credit')),
        ),
        _.Alert({ type: 'info', title: 'AT generation', message: 'Audiobook Tools prepares the selected voice reference in its managed Coqui engine, then creates a real WAV clip in the Voice track.' }),
        _.Btn({ color: 'primary', dense: true, icon: 'play_circle', loading: audioGenerating, onClick: () => generateSelectedAudio(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }, 'Generate selected audio'),
        () => audioGroups.value.length ? _.div({ class: 'at-audioGeneratedGroups' },
            _.div({ class: 'at-audioGeneratedGroupsHeader' }, _.strong('Generated audio'), _.small(`${audioGroups.value.length} master${audioGroups.value.length === 1 ? '' : 's'}`)),
            ...audioGroups.value.map((group) => _.div({ class: 'at-audioGeneratedGroup' },
                _.div({ class: 'at-audioGeneratedMaster' },
                    _.button({ type: 'button', class: 'at-audioGroupToggle', title: isAudioGroupExpanded(group.id) ? 'Collapse clips' : 'Show clips', onclick: () => toggleAudioGroup(group.id) }, _.Icon ? _.Icon({ name: isAudioGroupExpanded(group.id) ? 'expand_more' : 'chevron_right' }) : '›'),
                    _.div({ class: 'at-audioGeneratedMasterInfo' },
                        _.strong(group.label || 'Narration'),
                        _.small(`${group.segments.length} clips · ~${Math.ceil(group.duration_ms / 1000)}s · ${audioGroupDate(group.created_at)}`),
                    ),
                    group.in_timeline
                        ? _.span({ class: 'at-audioGroupUsed' }, 'In timeline')
                        : _.div({ class: 'at-audioGeneratedMasterActions' },
                            _.Btn({ color: 'secondary', icon: 'playlist_add', onClick: () => insertAudioGroup(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1], group.id) }, 'Insert timeline'),
                            _.Btn({ color: 'danger', icon: 'delete', title: 'Delete generated audio', onClick: () => deleteAudioGroup(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1], group.id) }),
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
        ) : null,
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
        _.article({ class: 'at-audioReading', style }, () => audiobookBlocks.value.length
            ? audiobookBlocks.value.map((block, index) => _.button({
                type: 'button',
                class: () => `at-audioReadingBlock ${index === activeBlockIndex.value ? 'is-selected' : ''} ${block.type === 'heading' ? 'is-heading' : ''}`,
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
            timelinePlayhead.value = timelineSnap(seconds);
            if (timelineIsPlaying.value) syncTimelinePlayers(timelinePlayhead.value, true);
            render(); return;
        }
        const { duration, track: trackAt, lane: laneAt, seconds } = geometry(event);
        const item = [...timelineItems.value].reverse().find((candidate) => candidate.track === trackAt && Number(candidate.lane || 0) === laneAt && seconds >= candidate.start_ms / 1000 && seconds <= (candidate.start_ms + candidate.duration_ms) / 1000);
        if (item) {
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
        timelinePlayhead.value = Math.max(0, timelineSnap(seconds));
        if (timelineIsPlaying.value) syncTimelinePlayers(timelinePlayhead.value, true);
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
                drag.changed ||= deltaMs !== 0;
                timelineItems.value = timelineItems.value.map((item) => {
                    const original = originals.get(timelineItemKey(item));
                    if (!original) return item;
                    const nextStart = Math.max(0, Number(original.start_ms || 0) + deltaMs);
                    const nextLane = firstAvailableTimelineLane(original.track, nextStart, Number(original.duration_ms || 0), dragKeys, Number(original.lane || 0));
                    drag.changed ||= nextStart !== Number(original.start_ms || 0) || nextLane !== Number(original.lane || 0);
                    return { ...item, start_ms: nextStart, lane: nextLane };
                });
            } else {
                const nextLane = firstAvailableTimelineLane(track, startMs, Number(drag.item.duration_ms || 0), key, lane);
                drag.changed ||= drag.item.track !== track || Number(drag.item.lane || 0) !== nextLane || drag.item.start_ms !== startMs;
                updateTimelineItem(key, (item) => ({ ...item, track, lane: nextLane, start_ms: startMs }));
            }
        } else if (drag.mode === 'trim-start') {
            const start = Math.min(drag.end - .25, magnetizeTimelineTime(seconds, duration, key));
            updateTimelineItem(key, (item) => {
                const delta = Math.round((start - drag.item.start_ms / 1000) * 1000);
                const next = { ...item, start_ms: Math.round(start * 1000), duration_ms: Math.round((drag.end - start) * 1000), trim_start_ms: Math.max(0, Number(drag.item.trim_start_ms || 0) + delta) };
                next.lane = firstAvailableTimelineLane(next.track, next.start_ms, next.duration_ms, key, Number(drag.item.lane || 0));
                drag.changed ||= next.start_ms !== drag.item.start_ms || next.duration_ms !== drag.item.duration_ms || next.trim_start_ms !== Number(drag.item.trim_start_ms || 0) || Number(next.lane || 0) !== Number(drag.item.lane || 0);
                return next;
            });
        } else {
            const end = Math.max(drag.item.start_ms / 1000 + .25, magnetizeTimelineTime(seconds, duration, key));
            updateTimelineItem(key, (item) => {
                const removed = Math.round((drag.item.start_ms / 1000 + drag.item.duration_ms / 1000 - end) * 1000);
                const next = { ...item, duration_ms: Math.round((end - item.start_ms / 1000) * 1000), trim_end_ms: Math.max(0, Number(drag.item.trim_end_ms || 0) + removed) };
                next.lane = firstAvailableTimelineLane(next.track, next.start_ms, next.duration_ms, key, Number(drag.item.lane || 0));
                drag.changed ||= next.duration_ms !== drag.item.duration_ms || next.trim_end_ms !== Number(drag.item.trim_end_ms || 0) || Number(next.lane || 0) !== Number(drag.item.lane || 0);
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
                _.Btn({ dense: true, color: 'secondary', icon: 'skip_previous', title: 'Previous block', onClick: () => { activeBlockIndex.value = Math.max(0, activeBlockIndex.value - 1); } }),
                _.Btn({ dense: true, color: 'primary', icon: 'play_arrow', title: 'Play or pause timeline', onClick: () => timelineIsPlaying.value ? stopTimelinePlayback() : startTimelinePlayback(render) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'stop', title: 'Stop timeline', onClick: () => { stopTimelinePlayback(); timelinePlayhead.value = 0; audioStatus.value = null; render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'skip_next', title: 'Next block', onClick: () => { activeBlockIndex.value = Math.min(audiobookBlocks.value.length - 1, activeBlockIndex.value + 1); } }),
                _.span({ class: 'at-audioTimecode' }, () => `00:00:${String(Math.floor(timelinePlayhead.value)).padStart(2, '0')}`),
            ),
            _.div({ class: 'at-audioTimelineActions' },
                _.Btn({ dense: true, color: () => audiobookViewMode.value === 'developer' ? 'primary' : 'secondary', icon: 'code', title: 'Developer view', onClick: () => { audiobookViewMode.value = 'developer'; } }),
                _.Btn({ dense: true, color: () => audiobookViewMode.value === 'preview' ? 'primary' : 'secondary', icon: 'visibility', title: 'Preview view', onClick: () => { audiobookViewMode.value = 'preview'; } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'undo', title: 'Undo (Ctrl/Cmd + Z)', disabled: () => !timelineUndoStack.value.length, onClick: () => undoTimeline(bookKey()) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'redo', title: 'Redo (Ctrl/Cmd + Shift + Z)', disabled: () => !timelineRedoStack.value.length, onClick: () => redoTimeline(bookKey()) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'zoom_in', title: 'Zoom in', onClick: () => { timelineZoom.value = Math.min(2, timelineZoom.value + .25); render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'zoom_out', title: 'Zoom out', onClick: () => { timelineZoom.value = Math.max(.5, timelineZoom.value - .25); render(); } }),
                _.Btn({ dense: true, color: 'secondary', icon: 'library_music', title: 'Choose music from audio library', onClick: () => openTimelineMediaDialog('music') }),
                _.Btn({ dense: true, color: 'secondary', icon: 'waves', title: 'Choose FX from audio library', onClick: () => openTimelineMediaDialog('fx') }),
                _.Btn({ dense: true, color: 'primary', icon: 'save', title: 'Save timeline', onClick: () => saveTimeline(window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1]) }),
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
                !multiple && item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: isTimelineGroupExpanded(item) ? 'unfold_less' : 'unfold_more', title: isTimelineGroupExpanded(item) ? 'Collapse clips' : 'Expand clips', onClick: () => toggleTimelineGroup(item) }) : null,
                !multiple && item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: 'call_split', title: 'Ungroup selected audio', onClick: () => ungroupSelectedTimelineItem(bookKey()) }) : null,
                multiple ? _.Btn({ dense: true, color: 'secondary', icon: 'folder_zip', title: 'Group selected clips', disabled: !canGroupTimelineItems(selection), onClick: () => groupSelectedTimelineItems(bookKey()) }) : null,
                !multiple && !item.is_group ? _.Btn({ dense: true, color: 'secondary', icon: 'content_cut', title: 'Split clip at playhead', onClick: () => splitSelectedTimelineItem(bookKey()) }) : null,
                _.Btn({ dense: true, color: () => timelineLoopRange.value ? 'primary' : 'secondary', icon: 'repeat', title: 'Loop selected clip(s)', onClick: toggleTimelineLoop }),
                _.Btn({ dense: true, color: 'secondary', icon: 'content_copy', title: 'Duplicate selected clip', onClick: () => duplicateSelectedTimelineItem(bookKey()) }),
                _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Remove selected clip', onClick: () => removeSelectedTimelineItem(bookKey()) }),
            );
        })() : _.div({ class: 'at-audioTimelineEmptySelection' }, _.Icon ? _.Icon({ name: 'ads_click' }) : null, _.span('Select a clip to edit its level, fades and grouping.'))),
        _.div({ class: 'at-audioTimelineFrame' }, channelViewport, scroller),
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
