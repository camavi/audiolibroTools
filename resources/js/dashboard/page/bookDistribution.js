import '../../../css/bookDistribution.css';
import { bookPanelButton } from '../shared/bookPanelButton';

function openPublicDelivery(key) {
    const access = _.rod('private'), link = _.rod(null), saving = _.rod(false), status = _.rod(null);
    const save = async (rotateLink = false) => {
        saving.value = true;
        try {
            const data = dataOf(await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution/public-delivery`, { access: access.value, rotate_link: rotateLink }));
            link.value = data.public_delivery?.url || null;
            status.value = { type: 'success', message: access.value === 'private' ? 'Public delivery disabled.' : 'Public delivery updated.' };
        } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to update public delivery.' }; }
        finally { saving.value = false; }
    };
    _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution`).then((payload) => {
        const delivery = dataOf(payload).public_delivery || {};
        access.value = delivery.access || 'private'; link.value = delivery.url || null;
    });
    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.h3('Public delivery'), _.span({ class: 'text-muted' }, 'Control who can open the public book page and its online releases.')),
        content: ({ close }) => _.div({ class: 'at-distributionDialog' },
            _.Select({ label: 'Access', model: access, options: [{ value: 'private', label: 'Private — no public access' }, { value: 'public', label: 'Public — anyone with the link' }, { value: 'invite', label: 'Invite link — only the secret link' }] }),
            () => link.value ? _.div({ class: 'at-distributionManual' },
                _.span(link.value),
                _.div({ class: 'at-distributionProviderActions' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'content_copy', onClick: () => navigator.clipboard?.writeText(new URL(link.value, window.location.origin).href) }, 'Copy link'),
                    _.Btn({ dense: true, color: 'primary', icon: 'open_in_new', onClick: () => window.open(link.value, '_blank', 'noopener') }, 'Open page'),
                    () => access.value === 'invite' ? _.Btn({ dense: true, color: 'warning', icon: 'refresh', onClick: () => save(true) }, 'Rotate link') : null,
                ),
            ) : null,
            () => status.value ? _.Alert(status.value) : null,
            _.div({ class: 'at-distributionDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'public', loading: saving, onClick: save }, 'Save access'))),
    } }).open();
}

function openProviderRelease(key) {
    const provider = _.rod(''), publication = _.rod(''), audio = _.rod(''), providersList = _.rod([]), publications = _.rod([]), audioReleases = _.rod([]), saving = _.rod(false), dialogStatus = _.rod(null);
    Promise.all([
        _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution`),
        _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/publications`),
        _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/audio-releases`),
    ]).then(([distribution, books, audioData]) => {
        providersList.value = (dataOf(distribution).providers || []).filter((item) => ['manual_ready', 'connected'].includes(item.connection?.status)).map((item) => ({ value: item.key, label: item.name }));
        publications.value = (dataOf(books).publications || []).filter((item) => item.status === 'ready' && item.is_online).map((item) => ({ value: String(item.id), label: `Book v${item.version_number}${item.label ? ` · ${item.label}` : ''}` }));
        audioReleases.value = (dataOf(audioData).releases || []).filter((item) => item.status === 'ready' && item.is_online).map((item) => ({ value: String(item.id), label: `Audio v${item.version_number}${item.label ? ` · ${item.label}` : ''}` }));
    }).catch((error) => { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to load online releases.' }; });
    const publish = async (close) => {
        if (!provider.value || (!publication.value && !audio.value)) { dialogStatus.value = { type: 'warning', message: 'Choose a provider and at least one online release.' }; return; }
        saving.value = true; dialogStatus.value = null;
        try { await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution/${encodeURIComponent(provider.value)}/releases`, { publication_id: publication.value ? Number(publication.value) : null, audio_release_id: audio.value ? Number(audio.value) : null }); status.value = { type: 'success', message: 'Distribution package prepared.' }; close(); load(key); }
        catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to prepare this distribution release.' }; }
        finally { saving.value = false; }
    };
    _.Dialog({ size: 'md', stickyActions: true, slots: { header: _.div(_.h3('Prepare provider release'), _.span({ class: 'text-muted' }, 'Only ready, online releases can be delivered.')), content: ({ close }) => _.div({ class: 'at-distributionDialog' }, _.Select({ label: 'Provider', model: provider, options: () => providersList.value }), _.Select({ label: 'ePub / PDF release (optional)', model: publication, clearable: true, options: () => publications.value }), _.Select({ label: 'Audiobook release (optional)', model: audio, clearable: true, options: () => audioReleases.value }), () => dialogStatus.value ? _.Alert(dialogStatus.value) : null, _.div({ class: 'at-distributionDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'publish', loading: saving, onClick: () => publish(close) }, 'Prepare release'))) } }).open();
}
const providers = _.rod([]), readiness = _.rod({}), loading = _.rod(true), status = _.rod(null), activeType = _.rod('all');
const typeOptions = [{ value: 'all', label: 'All channels' }, { value: 'ebook', label: 'eBooks' }, { value: 'print', label: 'Print' }, { value: 'audiobook', label: 'Audiobooks' }];
const keyBook = (ctx) => ctx?.params?.key_book || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/distribution/)?.[1] || null;
const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
async function load(key) { loading.value = true; try { const data = dataOf(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution`)); JSswift.reactive.untracked(() => { providers.value = data.providers || []; readiness.value = data.readiness || {}; }); } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to load distribution channels.' }; } finally { loading.value = false; } }
const icon = (provider) => provider.types.includes('audiobook') ? 'headphones' : provider.types.includes('print') ? 'menu_book' : 'auto_stories';
const integrationInfo = {
    manual_only: { label: 'Manual portal', action: 'Set up portal', icon: 'open_in_new', title: 'Set up manual delivery', body: 'AT will prepare the package and keep its delivery status. You will upload and publish it from your own provider account. Never share your password or 2FA code.' },
    delegated_portal: { label: 'Delegated portal', action: 'Record delegated access', icon: 'group_add', title: 'Record delegated access', body: 'Ask the customer to invite a separate AT collaborator account using the provider’s official role system. Access must be limited, revocable and must exclude payments, tax and bank details.' },
    file_feed: { label: 'Official file feed', action: 'Request feed setup', icon: 'folder_shared', title: 'Request official feed setup', body: 'This is not an API token connection. AT can send a feed only after the provider has approved the publisher/service-provider setup and the customer has supplied the required consent.' },
    coming_soon: { label: 'Coming soon', action: 'Coming soon', icon: 'schedule', title: 'Coming soon', body: 'This delivery channel is being prepared.' },
    direct_api: { label: 'Direct API', action: 'Connect', icon: 'link', title: 'Connect provider', body: 'Authorize the provider using its official, revocable authorization flow.' },
};
const infoFor = (provider) => integrationInfo[provider.availability] || integrationInfo.manual_only;
function providerSetupCopy(provider) {
    if (provider.availability === 'delegated_portal') return {
        eyebrow: 'Delegated provider access',
        body: `${provider.note} The customer must create the invitation from their own provider account; AT never receives a password, 2FA code, tax or payout access.`,
        field: 'AT workspace label (optional)',
        action: 'Record delegated access',
    };
    if (provider.availability === 'file_feed') return {
        eyebrow: 'Official feed delivery',
        body: `${provider.note} This records the request only. File delivery stays unavailable until the provider approves the feed and the customer consent is in place.`,
        field: 'Publisher / feed label',
        action: 'Record feed request',
    };
    return {
        eyebrow: 'Manual provider portal',
        body: `${provider.note} When the package is ready, download it from its release row and complete the final upload and publication in your own account.`,
        field: 'Workspace label (optional)',
        action: `Set up ${provider.name} workspace`,
    };
}
function setupProvider(key, provider) {
    const info = infoFor(provider), copy = providerSetupCopy(provider), label = _.rod(provider.connection.account_label || ''), saving = _.rod(false), dialogStatus = _.rod(null);
    const save = async (close) => {
        saving.value = true; dialogStatus.value = null;
        try {
            const data = dataOf(await _.http.putJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution/${provider.key}`, { account_label: label.value.trim() || null }));
            providers.value = providers.value.map(item => item.key === provider.key ? { ...item, connection: data.connection } : item);
            status.value = { type: 'success', message: provider.availability === 'file_feed' ? `${provider.name} feed request recorded.` : `${provider.name} workspace set up.` };
            close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to save this provider setup.' }; }
        finally { saving.value = false; }
    };
    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.h3(`${provider.name} delivery`), _.span({ class: 'text-muted' }, copy.eyebrow)),
        content: ({ close }) => _.div({ class: 'at-distributionDialog' },
            _.div({ class: 'at-distributionManual' }, _.Icon({ name: info.icon }), _.span(copy.body)),
            _.Input({ label: copy.field, model: label, placeholder: `${provider.name} workspace`, help: 'Only used inside Audiobook Tools to identify this delivery workspace.' }),
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-distributionDialogActions' },
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({ color: 'primary', icon: info.icon, loading: saving, onClick: () => save(close) }, copy.action),
            ),
        ),
    } }).open();
}
async function disconnect(key, provider) { if (!window.confirm(`Disconnect ${provider.name}?`)) return; try { await _.http.delJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution/${provider.key}`); providers.value = providers.value.map(item => item.key === provider.key ? { ...item, connection: { status: 'not_connected' } } : item); } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to disconnect this channel.' }; } }
function manageRelease(key, release) { const releaseStatus = _.rod(release.status), reference = _.rod(release.external_reference || ''), failure = _.rod(release.failure_message || ''), saving = _.rod(false), dialogStatus = _.rod(null); const save = async (close) => { saving.value = true; try { await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(key)}/distribution/releases/${release.id}`, { status: releaseStatus.value, external_reference: reference.value.trim() || null, failure_message: failure.value.trim() || null }); status.value = { type: 'success', message: `Distribution release #${release.id} updated.` }; close(); load(key); } catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to update this release.' }; } finally { saving.value = false; } }; _.Dialog({ size: 'md', stickyActions: true, slots: { header: _.div(_.h3(`Distribution release #${release.id}`), _.span({ class: 'text-muted' }, 'Track the handoff to the provider portal.')), content: ({ close }) => _.div({ class: 'at-distributionDialog' }, _.Select({ label: 'Status', model: releaseStatus, options: [{ value: 'ready_to_upload', label: 'Ready to upload' }, { value: 'submitted', label: 'Submitted to provider' }, { value: 'published', label: 'Published' }, { value: 'failed', label: 'Failed' }] }), _.Input({ label: 'External reference / URL', model: reference }), _.Textarea({ label: 'Failure message', model: failure }), () => dialogStatus.value ? _.Alert(dialogStatus.value) : null, _.div({ class: 'at-distributionDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'save', loading: saving, onClick: () => save(close) }, 'Save status'))) } }).open(); }
function card(provider, key) { const linked = provider.connection.status !== 'not_connected', info = infoFor(provider), comingSoon = provider.availability === 'coming_soon', stateLabel = comingSoon ? 'Coming soon' : !linked ? info.label : provider.connection.status === 'manual_ready' ? 'Ready to publish' : provider.connection.status === 'setup_requested' ? 'Feed setup requested' : 'Connected'; const history = (provider.releases || []).map((release) => _.div({ class: 'at-distributionProviderActions' }, _.small(`#${release.id} · ${release.status}`), _.Btn({ dense: true, color: 'secondary', icon: 'download', onClick: () => window.open(release.package_url, '_blank', 'noopener') }, 'Package'), _.Btn({ dense: true, color: 'secondary', icon: 'edit', onClick: () => manageRelease(key, release) }, 'Status'))); return _.article({ class: `at-distributionProvider ${linked ? 'is-connected' : ''}` }, _.div({ class: 'at-distributionProviderHead' }, _.span({ class: 'at-distributionProviderIcon' }, _.Icon({ name: icon(provider) })), _.div({ class: 'at-distributionProviderIdentity' }, _.strong(provider.name), _.small(provider.types.map(type => type === 'ebook' ? 'eBook' : type === 'audiobook' ? 'Audiobook' : 'Print').join(' · '))), _.span({ class: `at-distributionState ${provider.connection.status}` }, stateLabel)), _.p(provider.note), _.div({ class: 'at-distributionProviderActions' }, comingSoon ? _.Btn({ color: 'secondary', icon: info.icon, disabled: true }, info.action) : !linked || provider.connection.status === 'setup_requested' ? _.Btn({ color: 'primary', icon: info.icon, onClick: () => setupProvider(key, provider) }, info.action) : [_.Btn({ dense: true, color: 'secondary', icon: 'settings', onClick: () => setupProvider(key, provider) }, 'Manage'), _.Btn({ dense: true, color: 'danger', icon: 'link_off', title: 'Remove setup', onClick: () => disconnect(key, provider) })]), history); }
export default function bookDistribution(ctx) { const key = keyBook(ctx); load(key); window.AudiobookTools?.setPageHeaderActions?.([bookPanelButton(key), _.Btn({ color: 'secondary', icon: 'public', onClick: () => openPublicDelivery(key) }, 'Public delivery'), _.Btn({ color: 'primary', icon: 'publish', onClick: () => openProviderRelease(key) }, 'Prepare release')]); return _.main({ class: 'at-distributionPage' }, _.section({ class: 'at-distributionHeader' }, _.div(_.span('Distribution hub'), _.h2('Publish everywhere'), _.p('Prepare releases here; only official, revocable provider access can be connected.')), _.Btn({ color: 'secondary', icon: 'refresh', onClick: () => load(key) }, 'Refresh')), () => status.value ? _.Alert(status.value) : null, () => loading.value ? _.div({ class: 'at-distributionLoading' }, 'Loading distribution workspace…') : _.div({ class: 'at-distributionWorkspace' }, _.section({ class: 'at-distributionReadiness' }, _.div(_.span('Release readiness'), _.h3('Files available for distribution')), _.div({ class: 'at-distributionReadinessItems' }, [['auto_stories', 'ePub', readiness.value.epub], ['picture_as_pdf', 'Print PDF', readiness.value.pdf], ['headphones', 'Audiobook', readiness.value.audiobook], ['image', 'Cover', readiness.value.cover]].map(([name, label, ready]) => _.div({ class: ready ? 'is-ready' : 'is-missing' }, _.Icon({ name }), _.span(label), _.small(ready ? 'Ready' : 'Missing'))))), _.section({ class: 'at-distributionChannels' }, _.div({ class: 'at-distributionChannelsHead' }, _.div(_.span('Provider delivery'), _.h3('Distribution channels')), _.Select({ model: activeType, options: typeOptions })), () => _.div({ class: 'at-distributionGrid' }, providers.value.filter(provider => activeType.value === 'all' || provider.types.includes(activeType.value)).map(provider => card(provider, key)))))); }
