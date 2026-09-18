import '../../../css/abtPlay.css';
import { bookPanelButton } from '../shared/bookPanelButton';

const playerBook = _.rod(null);
const playerBlocks = _.rod([]);
const playerItems = _.rod([]);
const loading = _.rod(false);
const error = _.rod(null);
const readingMode = _.rod(localStorage.getItem('audiobook-tools:reader-mode') || 'cover');
const activeItemIndex = _.rod(0);
const isPlaying = _.rod(false);
const progress = _.rod(0);
const readingPlayback = _.rod(null);
const speed = _.rod(Number(localStorage.getItem('audiobook-tools:reader-speed') || 1));
const bookmark = _.rod(null);
const sleepMinutes = _.rod(0);
const volume = _.rod({ voice: Number(localStorage.getItem('audiobook-tools:volume-voice') || 100), music: Number(localStorage.getItem('audiobook-tools:volume-music') || 70), fx: Number(localStorage.getItem('audiobook-tools:volume-fx') || 70) });
let audio = null;
let sleepTimer = null;
let lastCenteredTarget = null;

function keyBook(ctx) { return ctx?.params?.key_book || window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1] || null; }
function editionQuery() { const value = new URLSearchParams(window.location.search).get('edition'); return value ? `?edition=${encodeURIComponent(value)}` : ''; }
function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function activeItem() { return playerItems.value[activeItemIndex.value] || null; }
function modeLabel() { return ({ cover: 'Cover', text: 'Text', block: 'Block', word: 'Word' })[readingMode.value] || 'Cover'; }

// This mirrors timelineAudioParts() in audiobook/edit. A generated audio
// group is not one playable file: it is an ordered list of generated parts.
// Keeping the parts together prevents the demo queue from jumping to the
// following group when only the first part has ended.
function timelineAudioParts(item) {
    const parts = Array.isArray(item.group_segments) && item.group_segments.length ? item.group_segments : [item];
    let offset = 0;
    return parts.map((part, index) => {
        const explicitOffset = Number(part.timeline_offset_ms);
        const timelineOffset = Number.isFinite(explicitOffset) ? explicitOffset : offset;
        offset = Math.max(offset, timelineOffset + Number(part.duration_ms || 0) + Number(part.pause_after_ms || 0));
        return {
            ...item,
            ...part,
            id: `${item.id}:${part.id || index}`,
            block_uuid: item.block_uuid,
            label: part.text_plain || item.label,
            start_ms: Number(item.start_ms || 0) + timelineOffset,
            media_offset_ms: Number(part.media_offset_ms || 0),
        };
    });
}

function timelineAudioUrl(item) {
    const path = item?.audio_path;
    if (!path || path.startsWith('mock://')) return null;
    if (/^https?:\/\//.test(path)) return path;
    return path.startsWith('/') ? path : `/storage/${path.replace(/^storage\//, '')}`;
}

function timelineDuration() {
    return Math.max(0, ...playerItems.value.map((item) => (Number(item.start_ms || 0) + Number(item.duration_ms || 0)) / 1000));
}

function stopAudio() {
    readingPlayback.value = null;
    audio?.pause();
    isPlaying.value = false;
}

function updateReadingPlayback(item, currentTime) {
    const offsetMs = Math.round(Number(item.media_offset_ms || 0) + currentTime * 1000);
    const word = item.track === 'voice' && Array.isArray(item.word_timings)
        ? item.word_timings.find((timing) => offsetMs >= Number(timing.start_ms || 0) && offsetMs < Number(timing.end_ms || 0))
        : null;
    const nextReading = word && item.block_uuid && Number.isInteger(Number(word.source_start)) && Number.isInteger(Number(word.source_end))
        ? { blockUuid: item.block_uuid, start: Number(word.source_start), end: Number(word.source_end) }
        : null;
    const current = readingPlayback.value;
    if (!current || !nextReading || current.blockUuid !== nextReading.blockUuid || current.start !== nextReading.start || current.end !== nextReading.end) {
        readingPlayback.value = nextReading;
    }
}

function setMode(mode) {
    readingMode.value = mode;
    localStorage.setItem('audiobook-tools:reader-mode', mode);
    lastCenteredTarget = null;
    if (mode !== 'cover') {
        window.requestAnimationFrame(() => centerReadingTarget(activeItem()));
    }
}

function centerReadingTarget(item) {
    const followsClip = readingMode.value === 'text' || readingMode.value === 'word';
    const targetKey = followsClip && item?.id ? `clip:${item.id}` : `block:${item?.block_uuid || ''}`;
    if (targetKey === 'block:' || targetKey === lastCenteredTarget) return;
    const container = document.querySelector('.at-abtReading');
    const target = followsClip && item?.id
        ? container?.querySelector(`[data-abt-clip-id="${CSS.escape(String(item.id))}"]`)
        : container?.querySelector(`[data-abt-block-uuid="${CSS.escape(String(item?.block_uuid || ''))}"]`);
    if (!container || !target) return;
    lastCenteredTarget = targetKey;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + targetRect.top - containerRect.top - (container.clientHeight - target.clientHeight) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function syncTransport(currentTime) {
    const currentMs = currentTime * 1000;
    const index = playerItems.value.findIndex((item) => currentMs >= Number(item.start_ms || 0) && currentMs < Number(item.start_ms || 0) + Number(item.duration_ms || 0));
    if (index < 0) { readingPlayback.value = null; lastCenteredTarget = null; return; }
    activeItemIndex.value = index;
    const item = playerItems.value[index];
    updateReadingPlayback(item, Math.max(0, currentTime - Number(item.start_ms || 0) / 1000));
    if (readingMode.value !== 'cover') window.requestAnimationFrame(() => centerReadingTarget(item));
}

function playItem(index = activeItemIndex.value, offset = 0, autoplay = true) {
    const item = playerItems.value[index];
    const url = timelineAudioUrl(item);
    if (!item || !url) return false;
    audio?.pause();
    audio = new Audio(url);
    audio.preload = 'metadata';
    audio.volume = volume.value.voice / 100;
    audio.playbackRate = speed.value;
    activeItemIndex.value = index;
    const start = Number(item.start_ms || 0) / 1000;
    const safeOffset = Math.max(0, Math.min(Math.max(0, Number(item.duration_ms || 0) / 1000 - .01), Number(offset) || 0));
    const setPosition = () => {
        try { audio.currentTime = Number(item.media_offset_ms || 0) / 1000 + safeOffset; } catch (_) { /* Wait for media metadata. */ }
        const position = start + safeOffset;
        progress.value = timelineDuration() ? (position / timelineDuration()) * 100 : 0;
        syncTransport(position);
        if (autoplay) {
            audio.play().then(() => { isPlaying.value = true; }).catch(() => { error.value = 'Playback was blocked by the browser. Select play again to continue.'; });
        }
    };
    audio.addEventListener('loadedmetadata', setPosition, { once: true });
    audio.addEventListener('timeupdate', () => {
        const position = start + Math.max(0, audio.currentTime - Number(item.media_offset_ms || 0) / 1000);
        progress.value = timelineDuration() ? (position / timelineDuration()) * 100 : 0;
        syncTransport(position);
    });
    audio.addEventListener('ended', () => {
        const next = index + 1;
        if (next < playerItems.value.length) playItem(next);
        else stopAudio();
    });
    return true;
}

function playAtTimelineTime(target, autoplay = false) {
    const seconds = Math.max(0, Math.min(timelineDuration(), Number(target) || 0));
    const index = playerItems.value.findIndex((item) => seconds >= Number(item.start_ms || 0) / 1000 && seconds < (Number(item.start_ms || 0) + Number(item.duration_ms || 0)) / 1000);
    const nextIndex = index >= 0 ? index : playerItems.value.findIndex((item) => Number(item.start_ms || 0) / 1000 >= seconds);
    const itemIndex = nextIndex >= 0 ? nextIndex : Math.max(0, playerItems.value.length - 1);
    const item = playerItems.value[itemIndex];
    return playItem(itemIndex, Math.max(0, seconds - Number(item?.start_ms || 0) / 1000), autoplay);
}

function togglePlay() {
    if (isPlaying.value) { stopAudio(); return; }
    if (audio && audio.paused) {
        audio.play().then(() => { isPlaying.value = true; }).catch(() => { error.value = 'Playback was blocked by the browser. Select play again to continue.'; });
        return;
    }
    playItem();
}
function seekTransport(percent) {
    const duration = timelineDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    const target = Math.min(Math.max(0, duration - .01), duration * safePercent / 100);
    progress.value = safePercent;
    playAtTimelineTime(target, isPlaying.value);
}
function seek(seconds) {
    const current = activeItem();
    const position = Number(current?.start_ms || 0) / 1000 + Math.max(0, (audio?.currentTime || 0) - Number(current?.media_offset_ms || 0) / 1000);
    const duration = timelineDuration();
    if (duration > 0) seekTransport(((position + seconds) / duration) * 100);
}
function nextItem() { const next = Math.min(playerItems.value.length - 1, activeItemIndex.value + 1); if (next !== activeItemIndex.value) playItem(next); }
function previousItem() { playItem(Math.max(0, activeItemIndex.value - 1)); }
function setSpeed() { const values = [.5, 1, 1.5]; speed.value = values[(values.indexOf(speed.value) + 1) % values.length]; localStorage.setItem('audiobook-tools:reader-speed', String(speed.value)); if (audio) audio.playbackRate = speed.value; }

function openVolumeDialog() {
    const voice = _.rod(volume.value.voice); const music = _.rod(volume.value.music); const fx = _.rod(volume.value.fx);
    const save = (close) => {
        volume.value = { voice: Number(voice.value), music: Number(music.value), fx: Number(fx.value) };
        Object.entries(volume.value).forEach(([key, value]) => localStorage.setItem(`audiobook-tools:volume-${key}`, String(value)));
        if (audio) audio.volume = volume.value.voice / 100; close();
    };
    _.Dialog({ size: 'sm', slots: { header: _.div(_.span('Audio controls'), _.h3('Volume')), content: ({ close }) => _.div({ class: 'at-abtVolumeDialog' }, _.Input({ label: 'Voice', type: 'range', min: 0, max: 100, model: voice }), _.Input({ label: 'Music', type: 'range', min: 0, max: 100, model: music }), _.Input({ label: 'Sound effects', type: 'range', min: 0, max: 100, model: fx }), _.div({ class: 'at-abtDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'save', onClick: () => save(close) }, 'Save'))) } }).open();
}

function setSleepTimer() {
    if (sleepTimer) clearTimeout(sleepTimer);
    const minutes = sleepMinutes.value === 15 ? 30 : sleepMinutes.value === 30 ? 0 : 15;
    sleepMinutes.value = minutes;
    if (minutes) sleepTimer = window.setTimeout(stopAudio, minutes * 60 * 1000);
}

async function load(key) {
    if (!key || loading.value) return;
    loading.value = true; error.value = null;
    try {
        const [bookResponse, editorResponse, timelineResponse] = await Promise.all([
            _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}`),
            _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/editor${editionQuery()}`),
            _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/audio-timeline${editionQuery()}`),
        ]);
        const book = dataOf(bookResponse); const editor = dataOf(editorResponse); const timeline = dataOf(timelineResponse);
        playerBook.value = { ...book, ...(editor.book || {}) };
        playerBlocks.value = editor.blocks || [];
        // The player is a narration reader. Music and FX are mixed in the
        // studio transport, but must not interrupt the sequential voice queue.
        playerItems.value = (timeline.items || [])
            .filter((item) => item.track === 'voice' && !item.muted)
            .flatMap(timelineAudioParts)
            .filter((item) => item.audio_path && !item.muted)
            .sort((a, b) => a.start_ms - b.start_ms);
        activeItemIndex.value = 0;
    } catch (requestError) { error.value = requestError.message || 'Unable to load this audiobook preview.'; }
    finally { loading.value = false; }
}

function cover() {
    const book = playerBook.value;
    return _.section({ class: 'at-abtCover' }, book?.cover_img ? _.img({ src: book.cover_img, alt: `Cover of ${book.name}` }) : _.div({ class: 'at-abtCoverPlaceholder' }, _.Icon({ name: 'menu_book' })), _.div({ class: 'at-abtBookNotes' }, _.h3(book?.name || 'Audiobook preview'), book?.description ? _.p(book.description) : _.p('Add a description and cover in the book workspace.')));
}

function reader() {
    if (readingMode.value === 'cover') return cover();
    const blocks = playerBlocks.value;
    const previewText = (block) => {
        const text = String(block.text_plain || '');
        const reading = readingPlayback.value;
        if (!reading || reading.blockUuid !== block.block_uuid || reading.start < 0 || reading.end <= reading.start) return text;
        return [
            text.slice(0, reading.start),
            _.span({ class: 'at-audioReadingWord', 'data-abt-clip-id': String(activeItem()?.id || '') }, text.slice(reading.start, reading.end)),
            text.slice(reading.end),
        ];
    };
    // Block mode follows the active audio clip, not the current word timing:
    // it must remain visible through pauses between words.
    const readingBlock = (block) => activeItem()?.block_uuid === block.block_uuid;
    const textWithClipAnchors = (block) => {
        const text = String(block.text_plain || '');
        const clips = playerItems.value
            .filter((item) => item.block_uuid === block.block_uuid && Number.isInteger(Number(item.source_start)))
            .sort((a, b) => Number(a.source_start) - Number(b.source_start));
        if (!clips.length) return text;
        let cursor = 0;
        const content = [];
        clips.forEach((clip) => {
            const position = Math.max(cursor, Math.min(text.length, Number(clip.source_start)));
            if (position > cursor) content.push(text.slice(cursor, position));
            content.push(_.span({ class: 'at-abtClipAnchor', 'data-abt-clip-id': String(clip.id) }));
            cursor = position;
        });
        if (cursor < text.length) content.push(text.slice(cursor));
        return content;
    };
    return _.article({ class: `at-abtText is-${readingMode.value}` }, blocks.length ? blocks.map((block) => _.p({
        class: () => readingMode.value === 'block' && readingBlock(block) ? 'is-reading' : '',
        'data-abt-block-uuid': block.block_uuid,
    }, readingMode.value === 'word' ? previewText(block) : readingMode.value === 'text' ? textWithClipAnchors(block) : (block.text_plain || ''))) : _.p('No manuscript text is available for this edition.'));
}

function chapterList() {
    return _.aside({ class: 'at-abtChapters' }, _.div(_.span('Chapters'), _.strong(() => `${playerItems.value.length} audio clips`)), () => playerItems.value.length ? playerItems.value.map((item, index) => _.button({ type: 'button', class: () => index === activeItemIndex.value ? 'is-active' : '', onclick: () => { stopAudio(); activeItemIndex.value = index; progress.value = 0; } }, _.Icon({ name: item.track === 'voice' ? 'record_voice_over' : item.track === 'music' ? 'music_note' : 'graphic_eq' }), _.span(item.label || `Clip ${index + 1}`))) : _.p('Generate audio and add it to the timeline to begin.'));
}

export default function abtPlay(ctx) {
    const key = keyBook(ctx); load(key);
    window.AudiobookTools?.setPageHeaderActions?.([bookPanelButton(key), _.Btn({ color: 'secondary', icon: 'edit', onClick: () => _.router.navigate(`/dashboard/book/${key}/audiobook/edit`) }, 'Edit audiobook')]);
    return _.main({ class: 'at-abtPage' },
        _.section({ class: 'at-abtIntro' }, _.div(_.span('Audiobook player'), _.h2(() => playerBook.value?.name || 'Loading preview…'), _.p('A JSswift port of the original Audiobook Tools demo player.')), _.div({ class: 'at-abtModes' }, ['cover', 'text', 'block', 'word'].map((mode) => _.Btn({ color: () => readingMode.value === mode ? 'primary' : 'secondary', onClick: () => setMode(mode) }, mode[0].toUpperCase() + mode.slice(1))))),
        () => error.value ? _.Alert({ type: 'danger', message: error.value }) : null,
        _.section({ class: 'at-abtWorkspace' },
            _.section({ class: 'at-abtPlayer' },
                _.header({ class: 'at-abtHeader' }, _.span(() => modeLabel()), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'format_list_bulleted', title: 'Chapters', onClick: () => document.querySelector('.at-abtChapters')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) })),
                _.div({ class: 'at-abtReading' }, () => loading.value ? _.div({ class: 'at-abtLoading' }, 'Loading audiobook…') : reader()),
                _.div({ class: 'at-abtProgress' }, () => [
                    _.div({ class: 'at-abtProgressLine', style: `width:${progress.value}%` }),
                    _.div({ class: 'at-abtProgressThumb', style: `left:${progress.value}%`, ariaHidden: 'true' }),
                ], _.input({ type: 'range', min: 0, max: 100, value: () => progress.value, ariaLabel: 'Preview progress', onInput: (event) => seekTransport(event.target.value), onChange: (event) => seekTransport(event.target.value) })),
                _.nav({ class: 'at-abtControls' }, _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'tune', title: 'Volume', onClick: openVolumeDialog }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'skip_previous', title: 'Previous clip', onClick: previousItem }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'replay_10', title: 'Back 15 seconds', onClick: () => seek(-15) }), () => _.Btn({ class: 'at-abtPlayButton', color: 'primary', icon: isPlaying.value ? 'pause' : 'play_arrow', title: 'Play / pause', onClick: togglePlay }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'forward_10', title: 'Forward 15 seconds', onClick: () => seek(15) }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'skip_next', title: 'Next clip', onClick: () => nextItem(false) }), _.Btn({ dense: true, textGradient: true, color: 'secondary', onClick: setSpeed }, () => `${speed.value.toFixed(1)}x`)),
                _.footer({ class: 'at-abtFooter' }, _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'directions_car', title: 'Auto mode' }), _.Btn({ dense: true, textGradient: true, color: () => sleepMinutes.value ? 'primary' : 'secondary', icon: 'timer', title: 'Sleep timer', onClick: setSleepTimer }, () => sleepMinutes.value ? `${sleepMinutes.value}m` : 'Timer'), () => _.Btn({ dense: true, textGradient: true, color: bookmark.value ? 'primary' : 'secondary', icon: bookmark.value ? 'bookmark' : 'bookmark_border', title: 'Bookmark', onClick: () => { bookmark.value = bookmark.value ? null : { index: activeItemIndex.value, progress: progress.value }; } }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'note_alt', title: 'Notes' })),
            ), chapterList(),
        ),
    );
}
