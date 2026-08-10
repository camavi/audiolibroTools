import '../../../css/bookPanel.css';

const panelBook = _.rod(null);
const panelStatus = _.rod('idle');
const panelError = _.rod(null);

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
    },
    {
        id: 'audiobook',
        icon: 'record_voice_over',
        title: 'Audiobook',
        description: 'Generate, review and export narrated audio.',
    },
    {
        id: 'design',
        icon: 'palette',
        title: 'Design',
        description: 'Create the cover and visual identity of the book.',
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
