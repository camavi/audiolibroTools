import 'cmswift';
import newBookStartPage from './dashboard/page/newBookStart.js';
import bookEditorPage from './dashboard/page/bookEditor.js';
import settingPage from './dashboard/page/setting.js';
import booksPage from './dashboard/page/books.js';
import bookPanelPage from './dashboard/page/bookPanel.js';
import bookTraslatePage from './dashboard/page/bookTraslate.js';
import audiobookEditPage from './dashboard/page/audiobookEdit.js';
import uploadAudioPage from './dashboard/page/uploadAudio.js';
import bookDesignPage from './dashboard/page/bookDesign.js';
import bookEpubPage from './dashboard/page/bookEpub.js';
import bookPdfPage from './dashboard/page/bookPdf.js';
import bookDistributionPage from './dashboard/page/bookDistribution.js';
import profilePage from './dashboard/page/profile.js';

let currentLayout = null;
const currentView = _.rod('new-book');
const pageHeaderActionsVersion = _.rod(0);
let pageHeaderActions = () => [];
const bookEditionOptions = _.rod([]);
const selectedBookEdition = _.rod('');
const bookEditionVisible = _.rod(false);


const navGroups = [
    { label: 'Dashboard', key: 'dashboard', icon: 'dashboard', link: '/dashboard' },
    {
        label: 'My books',
        icon: 'menu_book',
        expanded: true,
        items: [
            { label: 'New book', key: 'new-book', icon: 'add', link: '/dashboard/new-book' },
            { label: 'List of books', key: 'books-list', icon: 'format_list_bulleted', link: '/dashboard/books' },
        ],
    },
    { label: 'Activity book', key: 'activity-book', icon: 'pie_chart' },
    { label: 'Statistics', key: 'statistics', icon: 'monetization_on' },
    { label: 'My tokens', key: 'tokens', icon: 'token' },
    //{ label: 'External services', key: 'external-services', icon: 'folder_special' },
    { label: 'Team', key: 'team', icon: 'diversity_3' },
    { label: 'Profile', key: 'profile', icon: 'person', link: '/dashboard/profile' },
    //{ label: 'Organization', key: 'organization', icon: 'hub' },
    { label: 'Settings', key: 'setting', icon: 'settings', link: '/dashboard/setting' },
    { label: 'Prompts AI', key: 'prompts-ai', icon: 'psychology' },
    { label: 'Audio', key: 'upload-audio', icon: 'graphic_eq', link: '/dashboard/upload-audio' },
    { label: 'Logout', key: 'logout', icon: 'logout' },
];

const pageMeta = {
    'new-book': {
        title: 'New book',
        subtitle: 'Create a blank book or upload an existing manuscript.',
        icon: 'add_circle',
    },
    'books-list': {
        title: 'List of books',
        subtitle: 'Your saved books will be listed here.',
        icon: 'format_list_bulleted',
    },
};

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function resetNewBookForm() {
    title.value = '';
    description.value = '';
    categories.value = [];
    createdBook.value = null;
    formStatus.value = null;
}

function aside() {
    return _.Drawer({
        items: navGroups,
        stateKey: 'audiobook-dashboard:drawer',
        onSelect: (item) => {
            if (!item.key || item.items?.length) return;
            currentView.value = item.key;
        },
    });
}

function statusAlert() {
    const status = formStatus.value;
    if (!status) return null;

    return _.Alert({
        type: status.type,
        title: status.title,
        message: status.message,
    });
}
function newBookStart() {
    return newBookStartPage;
}
function bookEditor(ctx) {
    return bookEditorPage(ctx);
}

function pageDashboard() {
    return _.Card({
        icon: 'dashboard',
        title: 'Dashboard',
        subtitle: 'Create a blank book with Laravel backend.',
        body: 'Welcome to Audiobook Tools editor dashboard.',
    });
}
function setPageHeaderActions(actions = []) {
    const nodes = Array.isArray(actions) ? actions : [actions];
    pageHeaderActions = () => nodes;
    pageHeaderActionsVersion.value += 1;
}

async function syncBookEditions() {
    const match = window.location.pathname.match(/^\/dashboard\/book\/([^/]+)\/(?:edit|translate|audiobook\/edit|design|epub|pdf|distribution|panel)/);
    if (!match) { bookEditionVisible.value = false; return; }
    const keyBook = match[1];
    bookEditionVisible.value = true;
    try {
        const payload = await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/editions`);
        const data = payload?.data?.data || payload?.data || {};
        const editions = data.editions || [];
        const queryEdition = new URLSearchParams(window.location.search).get('edition');
        CMSwift.reactive.untracked(() => {
            bookEditionOptions.value = editions.map((edition) => ({ value: String(edition.id), label: `${edition.locale.toUpperCase()} · ${edition.is_original ? 'Original' : `${edition.approved_blocks}/${edition.total_blocks} translated`}` }));
            selectedBookEdition.value = queryEdition && editions.some((edition) => String(edition.id) === queryEdition) ? queryEdition : String(editions.find((edition) => edition.is_original)?.id || editions[0]?.id || '');
        });
    } catch (_) { bookEditionVisible.value = false; }
}

function changeBookEdition(editionId) {
    const url = new URL(window.location.href);
    if (editionId) url.searchParams.set('edition', editionId); else url.searchParams.delete('edition');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

window.AudiobookTools = {
    ...(window.AudiobookTools || {}),
    setPageHeaderActions,
    selectedBookEdition,
};

const rightHeader = _.div({ class: 'at-dashboardPageActions' }, () => {
    pageHeaderActionsVersion.value;
    return [
        _.div({ class: 'at-dashboardEditionSlot' }, () => bookEditionVisible.value
            ? _.Select({ class: 'at-dashboardEditionSelect', model: selectedBookEdition, options: () => bookEditionOptions.value, onChange: changeBookEdition })
            : null),
        ...pageHeaderActions(),
    ];
});

function routePage(page) {
    return (ctx) => {
        setPageHeaderActions();
        syncBookEditions();
        return page(ctx);
    };
}

function mountDashboard(contentPage) {
    currentLayout = _.Layout({
        header: _.Header({
            left: false,
            title: 'Audiobook Tools',
            subtitle: 'Editor',
            right: rightHeader,
        }),
        tagPage: true,
        disposition: 'classic',
        mode: 'global',
        drawerWidth: 208,
        drawerMinWidth: 208,
        drawerMaxWidth: 208,
        drawerResizable: false,
        drawerOpen: true,
        stickyHeader: true,
        stickyAside: true,
        layoutBreakpoint: 760,
        aside,
        page: contentPage,
    });

    return currentLayout;
}

//const root = document.getElementById('dashboard-root');

let contentPage = _.div({ class: "cmswift-route-outlet" });
const layoutPage = mountDashboard(contentPage);
_.mount("#dashboard-root", layoutPage);
_.router.setOutlet(contentPage);
_.router.add('/dashboard', routePage(pageDashboard));
_.router.add('/dashboard/new-book', routePage(newBookStart));
_.router.add('/dashboard/book/:key_book/edit', routePage(bookEditor));
_.router.add('/dashboard/book/:key_book/panel', routePage(bookPanelPage));
_.router.add('/dashboard/book/:key_book/design', routePage(bookDesignPage));
_.router.add('/dashboard/book/:key_book/epub', routePage(bookEpubPage));
_.router.add('/dashboard/book/:key_book/pdf', routePage(bookPdfPage));
_.router.add('/dashboard/book/:key_book/distribution', routePage(bookDistributionPage));
_.router.add('/dashboard/book/:key_book/translate', routePage(bookTraslatePage));
_.router.add('/dashboard/book/:key_book/audiobook/edit', routePage(audiobookEditPage));
_.router.add('/dashboard/setting', routePage(settingPage));
_.router.add('/dashboard/books', routePage(booksPage));
_.router.add('/dashboard/upload-audio', routePage(uploadAudioPage));
_.router.add('/dashboard/profile', routePage(profilePage));

_.router.start();
