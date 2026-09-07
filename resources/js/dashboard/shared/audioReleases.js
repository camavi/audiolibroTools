import '../../../css/publicationReleases.css';
import '../../../css/audioReleases.css';

const releases = _.rod([]);
const loading = _.rod(false);
const creating = _.rod(false);
const feedback = _.rod(null);
const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const formatDuration = (ms) => `${Math.floor(Number(ms || 0) / 60000)}:${String(Math.floor(Number(ms || 0) / 1000) % 60).padStart(2, '0')}`;
const formatSize = (bytes) => bytes == null ? '—' : `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;

function editionPayload() {
    const id = new URLSearchParams(window.location.search).get('edition');
    return id ? { edition_id: Number(id) } : {};
}

async function load(keyBook) {
    loading.value = true;
    try { releases.value = dataOf(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases`)).releases || []; }
    finally { loading.value = false; }
}

async function setAvailability(keyBook, release, isOnline) {
    try {
        const updated = dataOf(await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases/${release.id}/availability`, { is_online: isOnline })).release;
        releases.value = releases.value.map((item) => item.id === release.id ? updated : item);
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
                        const release = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases`, { ...editionPayload(), label: label.value || null }, { timeout: 180000, retry: { attempts: 0 } })).release;
                        releases.value = [release, ...releases.value]; close();
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

function row(keyBook, release) {
    const online = _.rod(Boolean(release.is_online));
    const master = (track) => _.div({ class: 'at-publicationFile' }, _.small(formatSize(release.masters?.[track]?.size_bytes)), release.masters?.[track]?.download_url ? _.Btn({ dense: true, color: 'secondary', icon: 'download', onClick: () => window.open(release.masters[track].download_url, '_blank', 'noopener') }) : null);
    const publicActions = release.public_url
        ? _.div({ class: 'at-audioReleasePublicActions' },
            _.Btn({ dense: true, color: 'secondary', icon: 'content_copy', title: 'Copy public link', onClick: () => copyPublicLink(release.public_url) }),
            _.Btn({ dense: true, color: 'primary', icon: 'open_in_new', title: 'Open public player', onClick: () => window.open(release.public_url, '_blank', 'noopener') }),
        )
        : release.can_retry
            ? _.div({ class: 'at-audioReleaseRetry' },
                _.Btn({ dense: true, color: 'warning', icon: 'refresh', onClick: async () => {
                    try {
                        const updated = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/audio-releases/${release.id}/retry`, {}, { timeout: 180000, retry: { attempts: 0 } })).release;
                        releases.value = releases.value.map((item) => item.id === release.id ? updated : item);
                    } catch (error) {
                        feedback.value = { type: 'danger', message: error.message || release.failure_message || 'Retry failed.' };
                        await load(keyBook);
                    }
                } }, 'Retry'),
                _.small({ class: 'text-muted', title: release.failure_message || '' }, 'Render failed'),
            )
            : _.small({ class: 'text-muted' }, release.status === 'ready' ? 'Offline' : 'Not ready');
    return _.div({ class: 'at-publicationReleaseRow', style: 'grid-template-columns:1.05fr .9fr .62fr .9fr .9fr .9fr .9fr .75fr' },
        _.div({ class: 'at-publicationReleaseVersion' }, _.strong(`v${release.version_number}`), _.span(release.label || 'Untitled')),
        _.div({ class: 'at-publicationReleaseDate' }, _.span(release.published_at ? new Date(release.published_at).toLocaleDateString() : '—'), _.small(release.published_at ? new Date(release.published_at).toLocaleTimeString() : '')),
        _.span(formatDuration(release.duration_ms)), master('voice'), master('music'), master('fx'),
        _.Toggle({ label: () => online.value ? 'Online' : 'Offline', color: () => online.value ? 'success' : 'danger', model: online, disabled: release.status !== 'ready', onChange: (value) => requestAvailability(keyBook, release, online, Boolean(value)) }), publicActions,
    );
}

export function openAudioReleaseManager(keyBook) {
    feedback.value = null;
    load(keyBook);
    _.Dialog({ size: 'xl', width: 'min(1360px, calc(100vw - 64px))', maxWidth: 'calc(100vw - 64px)', bodyMaxHeight: 'calc(100vh - 190px)', stickyActions: true, slots: {
        header: _.div({ class: 'at-publicationManagerHeader' }, _.div(_.h3('Audiobook releases'), _.span({ class: 'text-muted' }, 'Versioned Voice, Music and FX masters.')), _.Btn({ color: 'primary', icon: 'add', onClick: () => createRelease(keyBook) }, 'Create release')),
        content: ({ close }) => _.div({ class: 'at-publicationManager' },
            () => feedback.value ? _.Alert(feedback.value) : null,
            () => loading.value ? 'Loading releases…' : _.div({ class: 'at-publicationReleaseTable' }, _.div({ class: 'at-publicationReleaseTableHead', style: 'grid-template-columns:1.05fr .9fr .62fr .9fr .9fr .9fr .9fr .75fr' }, _.span('Version'), _.span('Published'), _.span('Duration'), _.span('Voice'), _.span('Music'), _.span('FX'), _.span('Availability'), _.span('Public link')), () => releases.value.map((release) => row(keyBook, release))),
            _.div({ class: 'at-publicationManagerActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'))),
    } }).open();
}

export const audioReleaseManagerButton = (keyBook) => _.Btn({ color: 'secondary', icon: 'library_music', onClick: () => openAudioReleaseManager(keyBook) }, 'Audio releases');
