import '../../../css/publicationReleases.css';
import '../../../css/audioReleases.css';

const releases = _.rod([]);
const loading = _.rod(false);
const creating = _.rod(false);
const feedback = _.rod(null);
let releasePollingTimer = null;
const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const formatDuration = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min ${String(seconds).padStart(2, '0')} s` : `${minutes} min ${String(seconds).padStart(2, '0')} s`;
};
const formatSize = (bytes) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024)));
    const amount = value / 1024 ** index;
    return `${amount >= 100 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
};

function editionPayload() {
    const id = new URLSearchParams(window.location.search).get('edition');
    return id ? { edition_id: Number(id) } : {};
}

function releaseData(state) {
    return state.data.value;
}

function syncReleases(nextReleases) {
    const currentById = new Map(releases.value.map((state) => [state.id, state]));
    const nextStates = nextReleases.map((release) => {
        const state = currentById.get(release.id);
        if (!state) return { id: release.id, data: _.rod(release) };

        if (JSON.stringify(releaseData(state)) !== JSON.stringify(release)) state.data.value = release;
        return state;
    });
    const listChanged = releases.value.length !== nextStates.length
        || releases.value.some((state, index) => state !== nextStates[index]);
    if (listChanged) releases.value = nextStates;
}

function upsertRelease(release) {
    syncReleases([release, ...releases.value.filter((state) => state.id !== release.id).map(releaseData)]);
}

function hasActiveRelease() {
    return releases.value.some((state) => ['queued', 'building'].includes(releaseData(state).status));
}

function hasPendingReleaseWork() {
    return releases.value.some((state) => {
        const release = releaseData(state);
        return ['queued', 'building'].includes(release.status) || ['queued', 'building'].includes(release.mp3_status);
    });
}

async function load(keyBook, background = false) {
    if (!background) loading.value = true;
    try { syncReleases(dataOf(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases`)).releases || []); }
    finally { if (!background) loading.value = false; }
}

function stopReleasePolling() {
    if (releasePollingTimer) window.clearTimeout(releasePollingTimer);
    releasePollingTimer = null;
}

function startReleasePolling(keyBook) {
    stopReleasePolling();
    if (!hasPendingReleaseWork()) return;
    releasePollingTimer = window.setTimeout(async () => {
        try { await load(keyBook, true); } catch (_) { /* A transient network error must not stop polling. */ }
        startReleasePolling(keyBook);
    }, 1500);
}

async function setAvailability(keyBook, release, isOnline) {
    try {
        const updated = dataOf(await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases/${release.id}/availability`, { is_online: isOnline })).release;
        upsertRelease(updated);
    } catch (error) {
        feedback.value = { type: 'danger', message: error.message || 'Unable to update public availability.' };
        throw error;
    }
}

async function requestAvailability(keyBook, release, online, nextValue) {
    if (nextValue || !release.is_online) {
        try { await setAvailability(keyBook, release, nextValue); }
        catch (_) { online.value = Boolean(release.is_online); }
        return;
    }
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.h3('Take audiobook release offline'), _.span({ class: 'text-muted' }, `Withdraw v${release.version_number} from public availability.`)),
        content: ({ close }) => _.div({ class: 'at-publicationReleaseDialog' }, _.Alert({ type: 'warning', message: 'Users will no longer be able to access this audiobook release. Its masters and history will be kept.' }), _.div({ class: 'at-publicationReleaseDialogActions' }, _.Btn({ color: 'secondary', onClick: () => { online.value = true; close(); } }, 'Keep online'), _.Btn({ color: 'danger', icon: 'cloud_off', onClick: async () => { try { await setAvailability(keyBook, release, false); close(); } catch (_) { online.value = true; } } }, 'Take offline'))),
    } }).open();
}

function createRelease(keyBook) {
    const label = _.rod('');
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.h3('Create audiobook release'), _.span({ class: 'text-muted' }, 'Render and freeze Voice, Music and FX masters.')),
        content: ({ close }) => _.div({ class: 'at-publicationReleaseDialog' },
            _.Input({ label: 'Release label', model: label }),
            _.div({ class: 'at-publicationReleaseDialogActions' },
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({ color: 'primary', icon: 'publish', loading: creating, onClick: async () => {
                    creating.value = true;
                    try {
                        const release = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases`, { ...editionPayload(), label: label.value || null }, { retry: { attempts: 0 } })).release;
                        upsertRelease(release);
                        feedback.value = { type: 'info', message: `Release v${release.version_number} is queued. You can close this window; its progress will be saved.` };
                        startReleasePolling(keyBook);
                        close();
                    } catch (error) {
                        feedback.value = { type: 'danger', message: error.message || 'The release failed to render. You can retry it from the list.' };
                        await load(keyBook); close();
                    } finally { creating.value = false; }
                } }, 'Create release'),
            ),
        ),
    } }).open();
}

async function copyPublicLink(url) {
    try {
        await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
        feedback.value = { type: 'success', message: 'Public listening link copied.' };
    } catch (_) {
        feedback.value = { type: 'warning', message: 'Could not copy the link. Open the player and copy its address.' };
    }
}

async function requestMp3(keyBook, state) {
    const release = releaseData(state);
    const updated = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases/${release.id}/mp3`, {}, { retry: { attempts: 0 } })).release;
    upsertRelease(updated);
    startReleasePolling(keyBook);
}

function openMp3Dialog(keyBook, state, track) {
    const requesting = _.rod(false);
    const error = _.rod(null);
    const start = async () => {
        requesting.value = true;
        error.value = null;
        try { await requestMp3(keyBook, state); }
        catch (reason) { error.value = reason.message || 'Unable to start MP3 conversion.'; }
        finally { requesting.value = false; }
    };
    const release = releaseData(state);
    if (!release.masters?.[track]?.mp3 && !['queued', 'building'].includes(release.mp3_status)) void start();

    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.h3('MP3 export'), _.span({ class: 'text-muted' }, `Create the reusable MP3 file for release v${release.version_number}.`)),
        content: ({ close }) => _.div({ class: 'at-publicationReleaseDialog at-audioReleaseMp3Dialog' },
            () => {
                const current = releaseData(state);
                const mp3 = current.masters?.[track]?.mp3;
                const active = ['queued', 'building'].includes(current.mp3_status);
                const progress = Math.max(0, Math.min(100, Number(current.mp3_progress_percent || 0)));
                if (mp3?.download_url) return _.div(_.Alert({ type: 'success', message: 'MP3 is ready. It is saved with this release and will not be generated again.' }), _.Btn({ color: 'primary', icon: 'download', onClick: () => window.open(mp3.download_url, '_blank', 'noopener') }, 'Download MP3'));
                if (current.mp3_status === 'failed') return _.div(_.Alert({ type: 'danger', message: current.mp3_failure_message || 'MP3 conversion failed.' }), _.Btn({ color: 'primary', icon: 'refresh', loading: requesting, onClick: start }, 'Try again'));
                return _.div(_.Alert({ type: 'info', message: active ? `Generating MP3 · ${progress}%` : 'Preparing MP3 conversion…' }), _.div({ class: 'at-audioReleaseProgress at-audioReleaseMp3Progress' }, _.span(`${progress}%`), _.div({ class: 'at-audioReleaseProgressTrack' }, _.div({ style: { width: `${progress}%` } }))));
            },
            () => error.value ? _.Alert({ type: 'danger', message: error.value }) : null,
            _.div({ class: 'at-publicationReleaseDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close')),
        ),
    } }).open();
}

function rowContent(keyBook, state) {
    const release = releaseData(state);
    const online = _.rod(Boolean(release.is_online));
    const master = (track) => {
        const files = release.masters?.[track];
        if (!files?.wav) return _.span('—');
        return _.div({ class: 'at-publicationFile at-audioReleaseFormats' },
            _.div({ class: 'at-audioReleaseFormatActions' },
                _.Btn({ dense: true, color: 'secondary', icon: 'download', title: 'Download WAV master', onClick: () => window.open(files.wav.download_url, '_blank', 'noopener') }, 'WAV'),
                _.Btn({ dense: true, color: files.mp3 ? 'primary' : 'secondary', icon: files.mp3 ? 'download' : 'audio_file', title: files.mp3 ? 'Download MP3' : 'Generate MP3 for this release', onClick: () => files.mp3 ? window.open(files.mp3.download_url, '_blank', 'noopener') : openMp3Dialog(keyBook, state, track) }, 'MP3'),
            ),
            _.small({ class: 'at-audioReleaseFileSize' }, `WAV · ${formatSize(files.wav.size_bytes)}`),
            files.mp3 ? _.small({ class: 'at-audioReleaseFileSize' }, `MP3 · ${formatSize(files.mp3.size_bytes)}`) : null,
        );
    };
    const publicActions = release.public_url
        ? _.div({ class: 'at-audioReleasePublicActions' },
            _.Btn({ dense: true, color: 'secondary', icon: 'content_copy', title: 'Copy public link', onClick: () => copyPublicLink(release.public_url) }),
            _.Btn({ dense: true, color: 'primary', icon: 'open_in_new', title: 'Open public player', onClick: () => window.open(release.public_url, '_blank', 'noopener') }),
        )
        : release.can_retry
            ? _.div({ class: 'at-audioReleaseRetry' },
                _.Btn({ dense: true, color: 'warning', icon: 'refresh', onClick: async () => {
                    try {
                        const updated = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases/${release.id}/retry`, {}, { retry: { attempts: 0 } })).release;
                        upsertRelease(updated);
                        feedback.value = { type: 'info', message: `Release v${updated.version_number} is queued again.` };
                        startReleasePolling(keyBook);
                    } catch (error) {
                        feedback.value = { type: 'danger', message: error.message || release.failure_message || 'Retry failed.' };
                        await load(keyBook);
                    }
                } }, 'Retry'),
                _.small({ class: 'text-muted', title: release.failure_message || '' }, 'Render failed'),
            )
            : _.small({ class: 'text-muted' }, release.status === 'ready' ? 'Offline' : 'Not ready');
    const rendering = ['queued', 'building'].includes(release.status);
    const progress = Math.max(0, Math.min(100, Number(release.progress_percent || 0)));
    const releaseState = rendering
        ? _.div({ class: 'at-audioReleaseProgress' }, _.span(release.status === 'queued' ? `Queued · ${progress}%` : `Rendering · ${progress}%`), _.div({ class: 'at-audioReleaseProgressTrack' }, _.div({ style: { width: `${progress}%` } })))
        : null;
    return [
        _.div({ class: 'at-publicationReleaseVersion' }, _.strong(`v${release.version_number}`), _.span(release.label || 'Untitled'), releaseState),
        _.div({ class: 'at-publicationReleaseDate' }, _.span(release.published_at ? new Date(release.published_at).toLocaleDateString() : '—'), _.small(release.published_at ? new Date(release.published_at).toLocaleTimeString() : '')),
        _.span(formatDuration(release.duration_ms)), master('voice'), master('music'), master('fx'),
        _.Toggle({ label: () => online.value ? 'Online' : 'Offline', color: () => online.value ? 'success' : 'danger', model: online, disabled: release.status !== 'ready', onChange: (value) => requestAvailability(keyBook, release, online, Boolean(value)) }), publicActions,
    ];
}

function row(keyBook, state) {
    return _.div({ class: 'at-publicationReleaseRow', style: 'grid-template-columns:1.05fr .9fr .62fr .9fr .9fr .9fr .9fr .75fr' }, () => rowContent(keyBook, state));
}

export function openAudioReleaseManager(keyBook) {
    feedback.value = null;
    load(keyBook).then(() => startReleasePolling(keyBook));
    _.Dialog({ size: 'xl', width: 'min(1360px, calc(100vw - 64px))', maxWidth: 'calc(100vw - 64px)', bodyMaxHeight: 'calc(100vh - 190px)', stickyActions: true, slots: {
        header: _.div({ class: 'at-publicationManagerHeader' }, _.div(_.h3('Audiobook releases'), _.span({ class: 'text-muted' }, 'Versioned Voice, Music and FX masters.')), _.Btn({ color: 'primary', icon: 'add', title: () => hasActiveRelease() ? 'Wait until the current release has finished.' : 'Create release', disabled: () => hasActiveRelease(), onClick: () => createRelease(keyBook) }, 'Create release')),
        content: ({ close }) => _.div({ class: 'at-publicationManager' },
            () => feedback.value ? _.Alert(feedback.value) : null,
            () => loading.value ? 'Loading releases…' : _.div({ class: 'at-publicationReleaseTable' }, _.div({ class: 'at-publicationReleaseTableHead', style: 'grid-template-columns:1.05fr .9fr .62fr .9fr .9fr .9fr .9fr .75fr' }, _.span('Version'), _.span('Published'), _.span('Duration'), _.span('Voice'), _.span('Music'), _.span('FX'), _.span('Availability'), _.span('Public link')), () => releases.value.map((state) => row(keyBook, state))),
            _.div({ class: 'at-publicationManagerActions' }, _.Btn({ color: 'secondary', onClick: () => { stopReleasePolling(); close(); } }, 'Close'))),
    } }).open();
}

export const audioReleaseManagerButton = (keyBook) => _.Btn({ color: 'secondary', icon: 'library_music', onClick: () => openAudioReleaseManager(keyBook) }, 'Audio releases');
