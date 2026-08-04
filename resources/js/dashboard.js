import 'cmswift';
import newBookStartPage from './dashboard/newBookStart.js';

let currentLayout = null;
const currentView = _.rod('new-book');


const navGroups = [
    {
        label: 'My books',
        icon: 'menu_book',
        expanded: true,
        items: [
            { label: 'New book', key: 'new-book', icon: 'add', link: '/dashboard/new-book' },
            { label: 'List of books', key: 'books-list', icon: 'format_list_bulleted' },
        ],
    },
    { label: 'Activity book', key: 'activity-book', icon: 'pie_chart' },
    { label: 'Monetize', key: 'monetize', icon: 'monetization_on' },
    { label: 'My tokens', key: 'tokens', icon: 'token' },
    { label: 'External services', key: 'external-services', icon: 'folder_special' },
    { label: 'Team', key: 'team', icon: 'diversity_3' },
    { label: 'Profile', key: 'profile', icon: 'person' },
    { label: 'Organization', key: 'organization', icon: 'hub' },
    {
        label: 'Admin',
        key: 'admin',
        icon: 'settings',
        expanded: true,
        items: [
            { label: 'Test Audio', key: 'test-audio', icon: 'graphic_eq' },
            { label: 'Upload audio', key: 'upload-audio', icon: 'upload_file' },
            { label: 'Prompts AI', key: 'prompts-ai', icon: 'psychology' },
        ],
    },
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
            if (item.key === 'new-book') loadCategories();
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

function pageDashboard() {
    return _.Card({
        icon: 'dashboard',
        title: 'Dashboard',
        subtitle: 'Create a blank book with Laravel backend.',
        body: 'Welcome to Audiobook Tools editor dashboard.',
    });
}

function mountDashboard(contentPage) {
    currentLayout = _.Layout({
        header: _.Header({
            left: false,
            title: 'Audiobook Tools',
            subtitle: 'Editor',
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
_.router.add('/dashboard', pageDashboard);
_.router.add('/dashboard/new-book', newBookStart);
_.router.start();
