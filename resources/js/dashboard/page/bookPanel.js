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
        description: 'Prepare a polished ePub edition.',
    },
    {
        id: 'pdf',
        icon: 'picture_as_pdf',
        title: 'PDF',
        description: 'Format and export a print-ready PDF.',
    },
    {
        id: 'distribution',
        icon: 'publish',
        title: 'Distribution',
        description: 'Prepare your book for publishing channels.',
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
        _.span('Audiobook Tools'),
        _.Icon ? _.Icon({ name: 'menu_book' }) : '✦',
    );
}

function workspaceArea(area, keyBook) {
    const openArea = () => {
        if (area.id === 'editing') _.router.navigate(`/dashboard/book/${keyBook}/edit`);
        if (area.id === 'translate') _.router.navigate(`/dashboard/book/${keyBook}/translate`);
        if (area.id === 'audiobook') _.router.navigate(`/dashboard/book/${keyBook}/audiobook/edit`);
        if (area.id === 'design') _.router.navigate(`/dashboard/book/${keyBook}/design`);
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
        audioSettings: book.audio_settings || {},
    }));
    const title = _.rod(initial.title);
    const description = _.rod(initial.description);
    const categories = _.rod(initial.categories);
    const lang = _.rod(initial.lang);
    const coverImg = _.rod(initial.coverImg);
    const commaPause = _.rod(String(initial.audioSettings.comma_ms ?? 250));
    const semicolonPause = _.rod(String(initial.audioSettings.semicolon_ms ?? 750));
    const sentencePause = _.rod(String(initial.audioSettings.sentence_ms ?? 500));
    const newlinePause = _.rod(String(initial.audioSettings.newline_ms ?? 1000));
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
                            audio_settings: {
                                comma_ms: Number(commaPause.value || 0), semicolon_ms: Number(semicolonPause.value || 0),
                                sentence_ms: Number(sentencePause.value || 0), newline_ms: Number(newlinePause.value || 0),
                            },
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
                    _.div({ class: 'cms-col-24' }, _.h4('Audiobook timing'), _.small({ class: 'text-muted' }, 'Pauses are used by future grouped Qwen generations. Values are milliseconds.')),
                    _.Input({ class: 'cms-col-6', label: 'Comma ,', type: 'number', min: 0, suffix: 'ms', model: commaPause }),
                    _.Input({ class: 'cms-col-6', label: 'Semicolon ; :', type: 'number', min: 0, suffix: 'ms', model: semicolonPause }),
                    _.Input({ class: 'cms-col-6', label: 'Sentence . ! ?', type: 'number', min: 0, suffix: 'ms', model: sentencePause }),
                    _.Input({ class: 'cms-col-6', label: 'New paragraph', type: 'number', min: 0, suffix: 'ms', model: newlinePause }),
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

function panelContent(keyBook) {
    if (panelStatus.value === 'loading' || panelStatus.value === 'idle') return loadingState();
    if (panelStatus.value === 'error') return errorState(keyBook);

    const book = panelBook.value;
    if (!book) return errorState(keyBook);

    return _.div({ class: 'at-bookPanelWorkspace' },
        _.section({ class: 'at-bookPanelHero' },
            _.div({ class: 'at-bookPanelHeroArtwork' }, bookArtwork(book)),
            _.div({ class: 'at-bookPanelHeroContent' },
                _.span({ class: 'at-bookPanelEyebrow' }, 'Book workspace'),
                _.h1(book.name),
                _.p(book.description || 'Choose an area below to continue working on your book.'),
                _.div({ class: 'at-bookPanelMeta' },
                    _.span(_.Icon ? _.Icon({ name: 'category' }) : null, `${book.categories_count || 0} categories`),
                    book.lang ? _.span(_.Icon ? _.Icon({ name: 'language' }) : null, book.lang.toUpperCase()) : null,
                ),
            ),
            _.div({ class: 'at-bookPanelHeroSettings' },
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
