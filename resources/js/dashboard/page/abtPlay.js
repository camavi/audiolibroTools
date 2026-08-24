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
const speed = _.rod(Number(localStorage.getItem('audiobook-tools:reader-speed') || 1));
const bookmark = _.rod(null);
const sleepMinutes = _.rod(0);
const volume = _.rod({ voice: Number(localStorage.getItem('audiobook-tools:volume-voice') || 100), music: Number(localStorage.getItem('audiobook-tools:volume-music') || 70), fx: Number(localStorage.getItem('audiobook-tools:volume-fx') || 70) });
let audio = null;
let sleepTimer = null;

function keyBook(ctx) { return ctx?.params?.key_book || window.location.pathname.match(/\/dashboard\/book\/([^/]+)/)?.[1] || null; }
function editionQuery() { const value = new URLSearchParams(window.location.search).get('edition'); return value ? `?edition=${encodeURIComponent(value)}` : ''; }
function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function activeItem() { return playerItems.value[activeItemIndex.value] || null; }
function modeLabel() { return ({ cover: 'Cover', text: 'Text', block: 'Block', word: 'Word' })[readingMode.value] || 'Cover'; }

function stopAudio() {
    if (!audio) return;
    audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null;
    isPlaying.value = false;
}

function setMode(mode) {
    readingMode.value = mode;
    localStorage.setItem('audiobook-tools:reader-mode', mode);
}

function playItem(index = activeItemIndex.value) {
    const item = playerItems.value[index];
    if (!item?.audio_path) return;
    if (audio?.dataset.itemIndex !== String(index)) {
        stopAudio();
        audio = new Audio(item.audio_path);
        audio.dataset.itemIndex = String(index);
        audio.preload = 'metadata';
        audio.addEventListener('timeupdate', () => { progress.value = audio?.duration ? (audio.currentTime / audio.duration) * 100 : 0; });
        audio.addEventListener('ended', () => nextItem(true));
        audio.addEventListener('error', () => { error.value = 'The selected audio clip cannot be played.'; isPlaying.value = false; });
    }
    activeItemIndex.value = index;
    audio.playbackRate = speed.value;
    audio.volume = Math.max(0, Math.min(1, (item.track === 'music' ? volume.value.music : item.track === 'fx' ? volume.value.fx : volume.value.voice) / 100));
    audio.play().then(() => { isPlaying.value = true; }).catch(() => { error.value = 'Playback was blocked by the browser. Select play again to continue.'; });
}

function togglePlay() { isPlaying.value ? stopAudio() : playItem(); }
function seek(seconds) { if (!audio) { playItem(); return; } audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds)); }
function nextItem(autoplay = false) { const next = Math.min(playerItems.value.length - 1, activeItemIndex.value + 1); if (next === activeItemIndex.value) { stopAudio(); return; } stopAudio(); activeItemIndex.value = next; progress.value = 0; if (autoplay) playItem(next); }
function previousItem() { const previous = Math.max(0, activeItemIndex.value - 1); stopAudio(); activeItemIndex.value = previous; progress.value = 0; }
function setSpeed() { const values = [.5, 1, 1.5]; speed.value = values[(values.indexOf(speed.value) + 1) % values.length]; localStorage.setItem('audiobook-tools:reader-speed', String(speed.value)); if (audio) audio.playbackRate = speed.value; }

function openVolumeDialog() {
    const voice = _.rod(volume.value.voice); const music = _.rod(volume.value.music); const fx = _.rod(volume.value.fx);
    const save = (close) => {
        volume.value = { voice: Number(voice.value), music: Number(music.value), fx: Number(fx.value) };
        Object.entries(volume.value).forEach(([key, value]) => localStorage.setItem(`audiobook-tools:volume-${key}`, String(value)));
        if (audio) playItem(activeItemIndex.value); close();
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
        playerItems.value = (timeline.items || []).filter((item) => item.audio_path).sort((a, b) => a.start_ms - b.start_ms);
        const firstVoice = playerItems.value.findIndex((item) => item.track === 'voice');
        activeItemIndex.value = firstVoice >= 0 ? firstVoice : 0;
    } catch (requestError) { error.value = requestError.message || 'Unable to load this audiobook preview.'; }
    finally { loading.value = false; }
}

function cover() {
    const book = playerBook.value;
    return _.section({ class: 'at-abtCover' }, book?.cover_img ? _.img({ src: book.cover_img, alt: `Cover of ${book.name}` }) : _.div({ class: 'at-abtCoverPlaceholder' }, _.Icon({ name: 'menu_book' })), _.div({ class: 'at-abtBookNotes' }, _.h3(book?.name || 'Audiobook preview'), book?.description ? _.p(book.description) : _.p('Add a description and cover in the book workspace.')));
}

function reader() {
    const active = activeItem();
    if (readingMode.value === 'cover') return cover();
    const blocks = readingMode.value === 'block' && active?.block_uuid ? playerBlocks.value.filter((block) => block.block_uuid === active.block_uuid) : playerBlocks.value;
    return _.article({ class: `at-abtText is-${readingMode.value}` }, blocks.length ? blocks.map((block) => _.p({ class: () => block.block_uuid === active?.block_uuid ? 'is-reading' : '' }, block.text_plain || '')) : _.p('No manuscript text is available for this edition.'));
}

function chapterList() {
    return _.aside({ class: 'at-abtChapters' }, _.div(_.span('Chapters'), _.strong(() => `${playerItems.value.length} audio clips`)), () => playerItems.value.length ? playerItems.value.map((item, index) => _.button({ type: 'button', class: () => index === activeItemIndex.value ? 'is-active' : '', onclick: () => { stopAudio(); activeItemIndex.value = index; progress.value = 0; } }, _.Icon({ name: item.track === 'voice' ? 'record_voice_over' : item.track === 'music' ? 'music_note' : 'graphic_eq' }), _.span(item.label || `Clip ${index + 1}`))) : _.p('Generate audio and add it to the timeline to begin.'));
}

export default function abtPlay(ctx) {
    const key = keyBook(ctx); load(key);
    window.AudiobookTools?.setPageHeaderActions?.([bookPanelButton(key), _.Btn({ color: 'secondary', icon: 'edit', onClick: () => _.router.navigate(`/dashboard/book/${key}/audiobook/edit`) }, 'Edit audiobook')]);
    return _.main({ class: 'at-abtPage' },
        _.section({ class: 'at-abtIntro' }, _.div(_.span('Audiobook player'), _.h2(() => playerBook.value?.name || 'Loading preview…'), _.p('A CMSwift port of the original Audiobook Tools demo player.')), _.div({ class: 'at-abtModes' }, ['cover', 'text', 'block', 'word'].map((mode) => _.Btn({ color: () => readingMode.value === mode ? 'primary' : 'secondary', onClick: () => setMode(mode) }, mode[0].toUpperCase() + mode.slice(1))))),
        () => error.value ? _.Alert({ type: 'danger', message: error.value }) : null,
        _.section({ class: 'at-abtWorkspace' },
            _.section({ class: 'at-abtPlayer' },
                _.header({ class: 'at-abtHeader' }, _.span(() => modeLabel()), _.Btn({ dense: true, color: 'secondary', icon: 'format_list_bulleted', title: 'Chapters', onClick: () => document.querySelector('.at-abtChapters')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) })),
                _.div({ class: 'at-abtReading' }, () => loading.value ? _.div({ class: 'at-abtLoading' }, 'Loading audiobook…') : reader()),
                _.div({ class: 'at-abtProgress' }, _.div({ class: 'at-abtProgressLine', style: () => `width:${progress.value}%` }), _.input({ type: 'range', min: 0, max: 100, value: () => progress.value, onInput: (event) => { if (!audio?.duration) return; audio.currentTime = (Number(event.target.value) / 100) * audio.duration; progress.value = Number(event.target.value); } })),
                _.nav({ class: 'at-abtControls' }, _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'tune', title: 'Volume', onClick: openVolumeDialog }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'skip_previous', title: 'Previous clip', onClick: previousItem }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'replay_10', title: 'Back 15 seconds', onClick: () => seek(-15) }), () => _.Btn({ class: 'at-abtPlayButton', color: 'primary', icon: isPlaying.value ? 'pause' : 'play_arrow', title: 'Play / pause', onClick: togglePlay }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'forward_10', title: 'Forward 15 seconds', onClick: () => seek(15) }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'skip_next', title: 'Next clip', onClick: () => nextItem(false) }), _.Btn({ dense: true, textGradient: true, color: 'secondary', onClick: setSpeed }, () => `${speed.value.toFixed(1)}x`)),
                _.footer({ class: 'at-abtFooter' }, _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'directions_car', title: 'Auto mode' }), _.Btn({ dense: true, textGradient: true, color: () => sleepMinutes.value ? 'primary' : 'secondary', icon: 'timer', title: 'Sleep timer', onClick: setSleepTimer }, () => sleepMinutes.value ? `${sleepMinutes.value}m` : 'Timer'), () => _.Btn({ dense: true, textGradient: true, color: bookmark.value ? 'primary' : 'secondary', icon: bookmark.value ? 'bookmark' : 'bookmark_border', title: 'Bookmark', onClick: () => { bookmark.value = bookmark.value ? null : { index: activeItemIndex.value, progress: progress.value }; } }), _.Btn({ dense: true, textGradient: true, color: 'secondary', icon: 'note_alt', title: 'Notes' })),
            ), chapterList(),
        ),
    );
}
