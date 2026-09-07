import '../../../css/publicationReleases.css';

const releases = _.rod([]);
const loading = _.rod(false);
const creating = _.rod(false);
const status = _.rod(null);

function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function editionPayload() { const edition = new URLSearchParams(window.location.search).get('edition'); return edition ? { edition_id: Number(edition) } : {}; }
function fileSize(bytes) { const value = Number(bytes); if (!Number.isFinite(value)) return 'Not generated'; return value < 1048576 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1048576).toFixed(1)} MB`; }
async function loadReleases(keyBook) { loading.value = true; status.value = null; try { releases.value = dataOf(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/publications`)).publications || []; } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to load publication releases.' }; } finally { loading.value = false; } }
async function setAvailability(keyBook, release, isOnline) { try { const data = dataOf(await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/publications/${release.id}/availability`, { is_online: isOnline })); releases.value = releases.value.map((item) => item.id === release.id ? data.publication : item); } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to update availability.' }; } }

function requestAvailabilityChange(keyBook, release, online, nextValue) {
    if (nextValue || !release.is_online) {
        setAvailability(keyBook, release, nextValue);
        return;
    }

    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('Take release offline'), _.span({ class: 'text-muted' }, `Withdraw v${release.version_number} from public availability.`)),
            content: ({ close }) => _.div({ class: 'at-publicationReleaseDialog' },
                _.Alert({ type: 'warning', message: 'Users will no longer be able to access this release’s ePub or PDF. The files and version history will be kept.' }),
                _.div({ class: 'at-publicationReleaseDialogActions' },
                    _.Btn({ color: 'secondary', onClick: () => { online.value = true; close(); } }, 'Keep online'),
                    _.Btn({ color: 'danger', icon: 'cloud_off', onClick: () => { setAvailability(keyBook, release, false); close(); } }, 'Take offline'),
                ),
            ),
        },
    }).open();
}

function createRelease(keyBook) {
    const label = _.rod(''); const dialogStatus = _.rod(null);
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.h3('Create publication release'), _.span({ class: 'text-muted' }, 'Capture this edition as versioned ePub and PDF files.')),
        content: ({ close }) => _.div({ class: 'at-publicationReleaseDialog' }, _.Input({ label: 'Release label', model: label, placeholder: 'e.g. First edition' }), () => dialogStatus.value ? _.Alert(dialogStatus.value) : null, _.div({ class: 'at-publicationReleaseDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'publish', loading: creating, onClick: async () => { creating.value = true; dialogStatus.value = null; try { const data = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/publications`, { ...editionPayload(), label: label.value.trim() || null }, { timeout: 180000, retry: { attempts: 0 } })); releases.value = [data.publication, ...releases.value]; close(); } catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to create this release.' }; } finally { creating.value = false; } } }, 'Create release'))),
    } }).open();
}

function releaseRow(keyBook, release) {
    const online = _.rod(Boolean(release.is_online));
    const file = (item) => _.div({ class: 'at-publicationFile' }, _.span(item?.name || 'Not generated'), _.small(item?.name ? fileSize(item.size_bytes) : '—'), item?.download_url ? _.Btn({ dense: true, color: 'secondary', icon: 'download', title: 'Download', ariaLabel: 'Download', onClick: () => window.open(item.download_url, '_blank', 'noopener') }) : null);
    return _.article({ class: 'at-publicationReleaseRow' },
        _.div({ class: 'at-publicationReleaseVersion' }, _.strong(`v${release.version_number}`), _.span(release.label || 'Untitled release')),
        _.div({ class: 'at-publicationReleaseDate' }, _.span(release.published_at ? new Date(release.published_at).toLocaleDateString() : 'Not published'), _.small(release.published_at ? new Date(release.published_at).toLocaleTimeString() : '')),
        file(release.epub),
        file(release.pdf),
        _.div({ class: 'at-publicationReleaseAvailability' }, _.Toggle({ label: () => online.value ? 'Online' : 'Offline', color: () => online.value ? 'success' : 'danger', model: online, onChange: (value) => requestAvailabilityChange(keyBook, release, online, Boolean(value)) })),
        _.span({ class: `at-publicationReleaseStatus is-${release.status}` }, release.status),
    );
}

export function openPublicationManager(keyBook) {
    loadReleases(keyBook);
    _.Dialog({ size: 'xl', width: 'min(1360px, calc(100vw - 64px))', maxWidth: 'calc(100vw - 64px)', bodyMaxHeight: 'calc(100vh - 190px)', stickyActions: true, slots: {
        header: _.div({ class: 'at-publicationManagerHeader' }, _.div(_.h3('Publication releases'), _.span({ class: 'text-muted' }, 'Versioned ePub and PDF exports for this book.')), _.Btn({ color: 'primary', icon: 'add', onClick: () => createRelease(keyBook) }, 'Create release')),
        content: ({ close }) => _.div({ class: 'at-publicationManager' }, () => status.value ? _.Alert(status.value) : null, () => loading.value ? _.div({ class: 'at-publicationManagerLoading' }, 'Loading releases…') : releases.value.length ? _.div({ class: 'at-publicationReleaseTable' }, _.div({ class: 'at-publicationReleaseTableHead' }, _.span('Version'), _.span('Published'), _.span('ePub'), _.span('PDF'), _.span('Availability'), _.span('Status')), _.div({ class: 'at-publicationReleaseList' }, releases.value.map((release) => releaseRow(keyBook, release)))) : _.div({ class: 'at-publicationManagerEmpty' }, _.Icon({ name: 'inventory_2' }), _.strong('No release yet'), _.small('Create the first version when the edition is ready.')), _.div({ class: 'at-publicationManagerActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'))),
    } }).open();
}

export function publicationManagerButton(keyBook) { return _.Btn({ color: 'secondary', icon: 'inventory_2', onClick: () => openPublicationManager(keyBook) }, 'Releases'); }

/** @deprecated Kept while the compact PDF workspace is migrated to the header action. */
export function publicationReleases(keyBook) { return publicationManagerButton(keyBook); }
