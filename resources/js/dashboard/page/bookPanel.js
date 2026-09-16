import '../../../css/bookPanel.css';

const panelBook = _.rod(null);
const panelStatus = _.rod('idle');
const panelError = _.rod(null);

const bookLanguageOptions = [
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt', label: 'Português' },
    { value: 'pl', label: 'Polski' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'ru', label: 'Русский' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'cs', label: 'Čeština' },
    { value: 'ar', label: 'العربية' },
    { value: 'zh', label: '中文' },
    { value: 'ja', label: '日本語' },
    { value: 'hu', label: 'Magyar' },
    { value: 'ko', label: '한국어' },
];

const workspaceAreas = [
    {
        id: 'editing',
        icon: 'edit_note',
        title: 'Editing',
        description: 'Write, organise and edit your manuscript.',
        available: true,
    },
    {
        id: 'translate',
        icon: 'translate',
        title: 'Translate',
        description: 'Create and manage translated editions.',
        available: true,
    },
    {
        id: 'audiobook',
        icon: 'record_voice_over',
        title: 'Audiobook',
        description: 'Generate, review and export narrated audio.',
        available: true,
    },
    {
        id: 'design',
        icon: 'palette',
        title: 'Design',
        description: 'Create the cover and visual identity of the book.',
        available: true,
    },
    {
        id: 'podcast',
        icon: 'podcasts',
        title: 'Podcast',
        description: 'Produce a multi-voice conversation about your book.',
    },
    {
        id: 'epub',
        icon: 'auto_stories',
        title: 'ePub',
        description: 'Prepare and export a polished ePub edition.',
        available: true,
    },
    {
        id: 'pdf',
        icon: 'picture_as_pdf',
        title: 'PDF',
        description: 'Format, preview and export a print-ready PDF.',
        available: true,
    },
    {
        id: 'distribution',
        icon: 'publish',
        title: 'Distribution',
        description: 'Connect and manage publishing channels.',
        available: true,
    },
];

function normalizeDataPayload(payload) {
    if (payload?.data?.data) return payload.data.data;
    if (payload?.data) return payload.data;

    return payload || {};
}

function panelKey(ctx) {
    return ctx?.params?.key_book
        || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/panel/)?.[1]
        || null;
}

function bookArtwork(book) {
    if (book?.cover_img) {
        return _.img({
            class: 'at-bookPanelArtworkImage',
            src: book.cover_img,
            alt: `Cover of ${book.name}`,
        });
    }

    return _.div({ class: 'at-bookPanelArtworkPlaceholder', 'aria-hidden': 'true' },
        _.div({ class: 'at-bookPanelArtworkCopy' },
            _.strong(book.name),
            _.span(book.description || 'No description yet.'),
        ),
    );
}

function formatHeroNumber(value) {
    return new Intl.NumberFormat().format(Math.max(0, Number(value) || 0));
}

function formatHeroDuration(milliseconds) {
    const seconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
    if (!seconds) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

function updatedLabel(value) {
    if (!value) return 'New book';
    return `Updated ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))}`;
}

function visibilityLabel(value) {
    return ({ public: 'Public', invite: 'Invite link', private: 'Private' })[value] || 'Private';
}

function heroMetric({ icon, label, value, detail }) {
    return _.div({ class: 'at-bookPanelHeroMetric' },
        _.span({ class: 'at-bookPanelHeroMetricIcon' }, _.Icon ? _.Icon({ name: icon }) : null),
        _.div(
            _.span({ class: 'at-bookPanelHeroMetricLabel' }, label),
            _.strong(value),
            _.small(detail),
        ),
    );
}

function workspaceArea(area, keyBook) {
    const openArea = () => {
        if (area.id === 'editing') _.router.navigate(`/dashboard/book/${keyBook}/edit`);
        if (area.id === 'translate') _.router.navigate(`/dashboard/book/${keyBook}/translate`);
        if (area.id === 'audiobook') _.router.navigate(`/dashboard/book/${keyBook}/audiobook/edit`);
        if (area.id === 'design') _.router.navigate(`/dashboard/book/${keyBook}/design`);
        if (area.id === 'epub') _.router.navigate(`/dashboard/book/${keyBook}/epub`);
        if (area.id === 'pdf') _.router.navigate(`/dashboard/book/${keyBook}/pdf`);
        if (area.id === 'distribution') _.router.navigate(`/dashboard/book/${keyBook}/distribution`);
    };

    return _.button({
        type: 'button',
        class: () => area.available ? 'at-bookPanelArea is-available' : 'at-bookPanelArea',
        disabled: !area.available,
        title: area.available ? `Open ${area.title}` : `${area.title} is coming soon`,
        onclick: openArea,
    },
        _.span({ class: 'at-bookPanelAreaIcon' }, _.Icon ? _.Icon({ name: area.icon }) : null),
        _.span({ class: 'at-bookPanelAreaContent' },
            _.strong(area.title),
            _.small(area.description),
        ),
        area.available
            ? _.span({ class: 'at-bookPanelAreaAction' }, _.Icon ? _.Icon({ name: 'arrow_forward' }) : '→')
            : _.span({ class: 'at-bookPanelAreaSoon' }, 'Coming soon'),
    );
}

function loadingState() {
    return _.div({ class: 'at-bookPanelNotice' }, 'Loading book workspace…');
}

function errorState(keyBook) {
    return _.div({ class: 'at-bookPanelNotice at-bookPanelNotice--error' },
        _.span(panelError.value || 'Unable to load this book.'),
        _.Btn({ color: 'secondary', onClick: () => loadBook(keyBook) }, 'Try again'),
    );
}

function openBookSettingsDialog(keyBook) {
    const book = panelBook.value;
    if (!book) return;

    const initial = CMSwift.reactive.untracked(() => ({
        title: book.name || '',
        description: book.description || '',
        categories: (book.categories || []).map(Number),
        lang: book.lang || '',
        coverImg: book.cover_img || '',
    }));
    const title = _.rod(initial.title);
    const description = _.rod(initial.description);
    const categories = _.rod(initial.categories);
    const lang = _.rod(initial.lang);
    const coverImg = _.rod(initial.coverImg);
    const categoryOptions = _.rod([]);
    const loadingCategories = _.rod(false);
    const saving = _.rod(false);
    const formStatus = _.rod(null);

    const loadCategories = async () => {
        loadingCategories.value = true;
        try {
            const payload = await _.http.getJSON('/dashboard/api/book-categories');
            const data = normalizeDataPayload(payload);
            categoryOptions.value = (Array.isArray(data) ? data : []).map((category) => ({
                value: Number(category.id),
                label: category.name,
            }));
        } catch (error) {
            formStatus.value = { type: 'danger', message: error.message || 'Unable to load categories.' };
        } finally {
            loadingCategories.value = false;
        }
    };

    const dialog = _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3('Book settings'),
                _.span({ class: 'text-muted' }, 'Manage the details used by your manuscript, translations and audiobook.'),
            ),
            content: ({ close }) => _.form({
                onSubmit: async (event) => {
                    event.preventDefault();
                    if (!title.value.trim() || saving.value) return;

                    saving.value = true;
                    formStatus.value = null;
                    try {
                        const payload = await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}`, {
                            title: title.value.trim(),
                            description: description.value.trim(),
                            categories: (categories.value || []).map(Number),
                            lang: lang.value || null,
                            cover_img: coverImg.value.trim() || null,
                        });
                        panelBook.value = normalizeDataPayload(payload);
                        close();
                    } catch (error) {
                        formStatus.value = { type: 'danger', message: error.message || 'Unable to save book settings.' };
                    } finally {
                        saving.value = false;
                    }
                },
            },
                _.Row({ gap: 'md' },
                    _.Input({ class: 'cms-col-24', label: 'Book title', icon: 'title', model: title, required: true }),
                    _.Select({ class: 'cms-col-12', label: () => loadingCategories.value ? 'Loading categories…' : 'Categories', icon: 'category', multiple: true, filterable: true, model: categories, options: () => categoryOptions.value }),
                    _.Select({ class: 'cms-col-12', label: 'Book language', icon: 'language', model: lang, options: [{ value: '', label: 'Not set' }, ...bookLanguageOptions] }),
                    _.Textarea({ class: 'cms-col-24', label: 'Description', icon: 'notes', rows: 4, model: description }),
                    _.Input({ class: 'cms-col-24', label: 'Cover image URL', icon: 'image', model: coverImg, placeholder: 'https://… or /storage/…' }),
                    _.div({ class: 'cms-col-24' }, () => formStatus.value ? _.Alert({ type: formStatus.value.type, message: formStatus.value.message }) : null),
                    _.div({ class: 'cms-col-24', align: 'right' },
                        _.Btn({ type: 'button', color: 'secondary', class: 'cms-m-r-sm', onClick: close }, 'Cancel'),
                        _.Btn({ type: 'submit', color: 'primary', loading: saving }, 'Save settings'),
                    ),
                ),
            ),
        },
    });

    loadCategories();
    dialog.open();
}

function openReimportDialog(keyBook) {
    const preview = _.rod(null), loading = _.rod(false), applying = _.rod(false), note = _.rod(null);
    const upload = _.Upload({ label: 'Updated manuscript', subtitle: 'DOCX, TXT or text-based PDF · max 25 MB', accept: '.docx,.txt,application/pdf', multiple: false, maxFileSize: 25 * 1024 * 1024, url: `/dashboard/api/books/${encodeURIComponent(keyBook)}/reimport-preview`, fieldName: 'manuscript', uploadButton: false, headers: { Accept: 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '' }, onStart: () => { loading.value = true; note.value = null; }, onSuccess: (item, { response }) => { const data = JSON.parse(response.text || '{}').data || null; CMSwift.reactive.untracked(() => { if (data) data.selectionModels = Object.fromEntries((data.items || []).filter((change) => change.kind !== 'unchanged').map((change) => [change.selection_key, _.rod(change.kind !== 'removed')])); preview.value = data; }); }, onError: (item, { error }) => { note.value = { type: 'danger', message: error.message || 'Unable to compare this manuscript.' }; }, onFinish: () => { loading.value = false; } });
    const review = () => { if (!upload._upload.files().length) { note.value = { type: 'warning', message: 'Choose a manuscript first.' }; return; } upload._upload.upload(); };
    const dialog = _.Dialog({ size: 'lg', stickyActions: true, slots: { header: _.div(_.span('Manuscript update'), _.h3('Re-import manuscript'), _.p('Unchanged blocks keep their history. Choose the changes to apply.')), content: () => _.div({ class: 'at-newBookDialogForm' }, upload, () => { const data = preview.value; if (!data) return null; const c = data.counts || {}; return _.section({ class: 'at-newBookImportPreview' }, _.h3('Changes detected'), _.p(`${c.unchanged || 0} unchanged · ${c.modified || 0} modified · ${c.added || 0} added · ${c.removed || 0} removed`), _.p('Removals are left unchecked by default.'), _.div({ class: 'at-newBookImportHeadings' }, ...(data.items || []).filter((item) => item.kind !== 'unchanged').slice(0, 30).map((item) => _.article({ class: `at-newBookImportBlock is-${item.kind}` }, _.Checkbox({ label: `Apply ${item.kind}`, model: data.selectionModels?.[item.selection_key] }), item.previous_text ? _.div({ class: 'at-reimportDiff' }, _.div({ class: 'at-reimportDiffPrevious' }, _.small('Previous'), _.p(item.previous_text)), _.div({ class: 'at-reimportDiffNew' }, _.small('New'), _.p(item.text))) : _.p(item.text), item.impact && Object.values(item.impact).some(Number) ? _.small(`Linked: ${item.impact.comments} comments · ${item.impact.reviews} reviews · ${item.impact.translations} translations · ${item.impact.audio} audio`) : null)))) }, () => note.value ? _.Alert(note.value) : null), actions: ({ close }) => _.div({ class: 'at-newBookDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), () => preview.value ? _.Btn({ color: 'primary', icon: 'published_with_changes', loading: applying, onClick: async () => { applying.value = true; try { const data = preview.value; await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/reimport-confirm`, { preview_token: data.preview_token, selected_item_keys: (data.items || []).filter((item) => item.kind !== 'unchanged' && data.selectionModels?.[item.selection_key]?.value).map((item) => item.selection_key) }); close(); loadBook(keyBook); } catch (error) { note.value = { type: 'danger', message: error.message || 'Unable to apply the re-import.' }; } finally { applying.value = false; } } }, 'Apply selected changes') : _.Btn({ color: 'primary', icon: 'preview', loading, onClick: review }, 'Review changes')) } });
    dialog.open();
}

function panelContent(keyBook) {
    if (panelStatus.value === 'loading' || panelStatus.value === 'idle') return loadingState();
    if (panelStatus.value === 'error') return errorState(keyBook);

    const book = panelBook.value;
    if (!book) return errorState(keyBook);
    const overview = book.overview || {};

    return _.div({ class: 'at-bookPanelWorkspace' },
        _.section({ class: 'at-bookPanelHero' },
            _.div({ class: 'at-bookPanelHeroArtwork' }, bookArtwork(book)),
            _.div({ class: 'at-bookPanelHeroContent' },
                _.span({ class: 'at-bookPanelEyebrow' }, 'Book workspace'),
                _.h1('Project overview'),
                _.p(`${updatedLabel(book.updated_at)} · ${visibilityLabel(overview.visibility)}`),
                _.div({ class: 'at-bookPanelHeroMetrics' },
                    heroMetric({
                        icon: 'article', label: 'Manuscript',
                        value: `${formatHeroNumber(overview.words)} words`,
                        detail: `${formatHeroNumber(overview.chapters)} chapters · ${formatHeroNumber(overview.blocks)} blocks`,
                    }),
                    heroMetric({
                        icon: 'translate', label: 'Translations',
                        value: `${formatHeroNumber(overview.completed_translation_languages)}/${formatHeroNumber(overview.translation_languages)} complete`,
                        detail: 'Languages with every current block approved',
                    }),
                    heroMetric({
                        icon: 'graphic_eq', label: 'Audio timeline',
                        value: formatHeroDuration(overview.timeline_duration_ms),
                        detail: `${formatHeroNumber(overview.timeline_clips)} clips · ~${formatHeroDuration((Number(overview.estimated_listening_seconds) || 0) * 1000)} narration`,
                    }),
                    heroMetric({
                        icon: 'publish', label: 'Releases',
                        value: `${formatHeroNumber(overview.release_count)} total`,
                        detail: `${formatHeroNumber(overview.online_release_count)} online`,
                    }),
                ),
            ),
            _.div({ class: 'at-bookPanelHeroSettings' },
                _.Btn({ dense: true, color: 'secondary', icon: 'upload_file', title: 'Re-import manuscript', 'aria-label': 'Re-import manuscript', onClick: () => openReimportDialog(keyBook) }),
                _.Btn({ dense: true, color: 'secondary', icon: 'settings', title: 'Book settings', 'aria-label': 'Book settings', onClick: () => openBookSettingsDialog(keyBook) }),
            ),
        ),
        _.section({ class: 'at-bookPanelAreas', 'aria-label': 'Book tools' },
            () => workspaceAreas.map((area) => workspaceArea(area, keyBook)),
        ),
    );
}

async function loadBook(keyBook) {
    if (!keyBook || panelStatus.value === 'loading') return;

    panelStatus.value = 'loading';
    panelError.value = null;

    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}`);
        panelBook.value = normalizeDataPayload(payload);
        panelStatus.value = 'ready';
    } catch (error) {
        panelStatus.value = 'error';
        panelError.value = error.message;
    }
}

export default function bookPanel(ctx) {
    const keyBook = panelKey(ctx);
    loadBook(keyBook);

    return _.main({ class: 'at-bookPanelPage' }, () => panelContent(keyBook));
}
