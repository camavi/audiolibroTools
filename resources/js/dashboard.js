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

let currentLayout = null;
const currentView = _.rod('new-book');
const pageHeaderActionsVersion = _.rod(0);
let pageHeaderActions = () => [];


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
    { label: 'Monetize', key: 'monetize', icon: 'monetization_on' },
    { label: 'My tokens', key: 'tokens', icon: 'token' },
    { label: 'External services', key: 'external-services', icon: 'folder_special' },
    { label: 'Team', key: 'team', icon: 'diversity_3' },
    { label: 'Profile', key: 'profile', icon: 'person' },
    { label: 'Organization', key: 'organization', icon: 'hub' },
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

window.AudiobookTools = {
    ...(window.AudiobookTools || {}),
    setPageHeaderActions,
};

const rightHeader = _.div({ class: 'at-dashboardPageActions' }, () => {
    pageHeaderActionsVersion.value;
    return pageHeaderActions();
});

function routePage(page) {
    return (ctx) => {
        setPageHeaderActions();
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
_.router.add('/dashboard/book/:key_book/translate', routePage(bookTraslatePage));
_.router.add('/dashboard/book/:key_book/audiobook/edit', routePage(audiobookEditPage));
_.router.add('/dashboard/setting', routePage(settingPage));
_.router.add('/dashboard/books', routePage(booksPage));
_.router.add('/dashboard/upload-audio', routePage(uploadAudioPage));

_.router.start();
