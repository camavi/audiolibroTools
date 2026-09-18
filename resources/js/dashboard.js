import 'jsswift';

let currentLayout = null;
const currentView = _.rod('new-book');
const pageHeaderActionsVersion = _.rod(0);
let pageHeaderActions = () => [];
const bookEditionOptions = _.rod([]);
const selectedBookEdition = _.rod('');
const bookEditionVisible = _.rod(false);
const dashboardTheme = _.rod(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const dashboardLocaleOptions = window.AudiobookToolsBootstrap?.locales || [];
const savedDashboardLocale = localStorage.getItem('audiobook-tools:locale');
const initialDashboardLocale = dashboardLocaleOptions.some((option) => option.value === savedDashboardLocale)
    ? savedDashboardLocale
    : (window.AudiobookToolsBootstrap?.locale || document.documentElement.lang || 'en');
const dashboardLocale = _.rod(initialDashboardLocale);


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
    { label: 'Activity book', key: 'activity-book', icon: 'pie_chart', link: '/dashboard/activity' },
    { label: 'Statistics', key: 'statistics', icon: 'monetization_on', link: '/dashboard/statistics' },
    { label: 'My tokens', key: 'tokens', icon: 'token', link: '/dashboard/tokens' },
    //{ label: 'External services', key: 'external-services', icon: 'folder_special' },
    { label: 'Team', key: 'team', icon: 'diversity_3', link: '/dashboard/team' },
    { label: 'Profile', key: 'profile', icon: 'person', link: '/dashboard/profile' },
    //{ label: 'Organization', key: 'organization', icon: 'hub' },
    { label: 'Settings', key: 'setting', icon: 'settings', link: '/dashboard/setting' },
    { label: 'Prompts AI', key: 'prompts-ai', icon: 'psychology', link: '/dashboard/prompts' },
    { label: 'Audio', key: 'upload-audio', icon: 'graphic_eq', link: '/dashboard/upload-audio' },
    { label: 'Help & support', key: 'support', icon: 'support_agent', link: '/dashboard/support' },
    ...(window.AudiobookToolsBootstrap?.role === 'admin'
        ? [{
            label: 'Administration',
            icon: 'admin_panel_settings',
            expanded: true,
            items: [
                { label: 'Tickets', key: 'admin-tickets', icon: 'support_agent', link: '/dashboard/admin/tickets' },
                { label: 'All users', key: 'admin-users', icon: 'group', link: '/dashboard/admin/users' },
                { label: 'AI pricing', key: 'admin-ai-pricing', icon: 'price_change', link: '/dashboard/admin/ai-pricing' },
                { label: 'Subscription plans', key: 'admin-subscription-plans', icon: 'card_membership', link: '/dashboard/admin/subscription-plans' },
                { label: 'Token packages', key: 'admin-token-packages', icon: 'token', link: '/dashboard/admin/token-packages' },
            ],
        }]
        : []),
    { label: 'Logout', key: 'logout', icon: 'logout', link: '/dashboard/logout' },
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
            if (item.key === 'logout') { _.router.navigate('/dashboard/logout'); return; }
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
function lazyPage(name, load) {
    let page = null;
    let loading = null;
    let error = null;

    const refreshRoute = () => {
        const { pathname, search, hash } = window.location;
        _.router.navigate(`${pathname}${search}${hash}`, { replace: true });
    };

    return (ctx) => {
        if (page) return page(ctx);

        if (!loading && !error) {
            loading = load()
                .then(({ default: component }) => {
                    page = component;
                    refreshRoute();
                })
                .catch((reason) => {
                    error = reason;
                    refreshRoute();
                });
        }

        if (error) {
            return _.main({ class: 'at-dashboardLazyPage' },
                _.Alert({ type: 'danger', title: `Unable to load ${name}`, message: 'Try again to load this dashboard page.' }),
                _.Btn({ color: 'primary', icon: 'refresh', onClick: () => { error = null; loading = null; refreshRoute(); } }, 'Try again'),
            );
        }

        return _.main({ class: 'at-dashboardLazyPage' },
            _.Alert({ type: 'info', icon: 'progress_activity', message: `Loading ${name}…` }),
        );
    };
}

const newBookStart = lazyPage('New book', () => import('./dashboard/page/newBookStart.js'));
const bookEditor = lazyPage('Book editor', () => import('./dashboard/page/bookEditor.js'));
const pageDashboard = lazyPage('Dashboard', () => import('./dashboard/page/dashboardHome.js'));
const settingPage = lazyPage('Settings', () => import('./dashboard/page/setting.js'));
const booksPage = lazyPage('Books', () => import('./dashboard/page/books.js'));
const bookPanelPage = lazyPage('Book panel', () => import('./dashboard/page/bookPanel.js'));
const bookTraslatePage = lazyPage('Translations', () => import('./dashboard/page/bookTraslate.js'));
const audiobookEditPage = lazyPage('Audiobook studio', () => import('./dashboard/page/audiobookEdit.js'));
const abtPlayPage = lazyPage('Audiobook player', () => import('./dashboard/page/abtPlay.js'));
const uploadAudioPage = lazyPage('Audio library', () => import('./dashboard/page/uploadAudio.js'));
const bookDesignPage = lazyPage('Book design', () => import('./dashboard/page/bookDesign.js'));
const bookEpubPage = lazyPage('ePub', () => import('./dashboard/page/bookEpub.js'));
const bookPdfPage = lazyPage('PDF', () => import('./dashboard/page/bookPdf.js'));
const bookDistributionPage = lazyPage('Distribution', () => import('./dashboard/page/bookDistribution.js'));
const profilePage = lazyPage('Profile', () => import('./dashboard/page/profile.js'));
const tokensPage = lazyPage('Tokens', () => import('./dashboard/page/tokens.js'));
const activityPage = lazyPage('Activity', () => import('./dashboard/page/activity.js'));
const statisticsPage = lazyPage('Statistics', () => import('./dashboard/page/statistics.js'));
const teamPage = lazyPage('Team', () => import('./dashboard/page/team.js'));
const promptsPage = lazyPage('AI prompts', () => import('./dashboard/page/prompts.js'));
const supportPage = lazyPage('Help and support', () => import('./dashboard/page/support.js'));
const adminAiPricingPage = lazyPage('AI pricing', () => import('./dashboard/page/adminAiPricing.js'));
const adminSubscriptionPlansPage = lazyPage('Subscription plans', () => import('./dashboard/page/adminSubscriptionPlans.js'));
const adminTokenPackagesPage = lazyPage('Token packages', () => import('./dashboard/page/adminTokenPackages.js'));
const logoutPage = lazyPage('Logout', () => import('./dashboard/page/logout.js'));
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
        JSswift.reactive.untracked(() => {
            bookEditionOptions.value = editions.map((edition) => {
                const total = Number(edition.total_blocks || 0);
                const approved = Number(edition.approved_blocks || 0);
                const translationState = total > 0 && approved >= total
                    ? 'Complete'
                    : `${approved}/${total} working`;

                return {
                    value: String(edition.id),
                    label: `${edition.locale.toUpperCase()} · ${edition.is_original ? 'Original' : translationState}`,
                };
            });
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

function selectChangeValue(value, fallback = '') {
    return value && typeof value === 'object' && 'target' in value
        ? value.target?.value ?? fallback
        : value ?? fallback;
}

function setDashboardTheme(theme) {
    dashboardTheme.value = theme;
    _.setTheme(theme);
}

function setDashboardLocale(locale) {
    const nextLocale = selectChangeValue(locale, dashboardLocale.value);
    const selected = dashboardLocaleOptions.find((option) => option.value === nextLocale);
    if (!selected) return;

    dashboardLocale.value = nextLocale;
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = selected.direction || 'ltr';
    localStorage.setItem('audiobook-tools:locale', nextLocale);
}

setDashboardLocale(initialDashboardLocale);

window.AudiobookTools = {
    ...(window.AudiobookTools || {}),
    setPageHeaderActions,
    selectedBookEdition,
    setDashboardTheme,
    setDashboardLocale,
};

function isBookPanelAction(action) {
    return action?.classList?.contains('at-dashboardBookPanelAction');
}

const languageMenu = _.Menu({
    title: 'Language',
    subtitle: 'Choose the dashboard interface language.',
    icon: 'translate',
    placement: 'left-start',
    minWidth: 240,
    items: () => dashboardLocaleOptions.map((option) => ({
        label: option.label,
        checked: () => dashboardLocale.value === option.value,
        onClick: () => {
            setDashboardLocale(option.value);
            userMenu.close();
        },
    })),
});

const userMenu = _.Menu({
    title: 'Account',
    subtitle: 'Profile and display preferences.',
    icon: 'person',
    placement: 'bottom-end',
    minWidth: 260,
    items: [
        {
            label: 'Profile',
            icon: 'person',
            subtitle: 'View and manage your profile.',
            onClick: () => _.router.navigate('/dashboard/profile'),
        },
        { type: 'separator' },
        {
            label: 'Language',
            icon: 'translate',
            iconRight: 'chevron_left',
            subtitle: () => dashboardLocaleOptions.find((option) => option.value === dashboardLocale.value)?.label || dashboardLocale.value.toUpperCase(),
            closeOnSelect: false,
            onClick: (_, event) => languageMenu.open(event.currentTarget),
        },
        {
            label: 'Theme',
            icon: () => dashboardTheme.value === 'dark' ? 'light_mode' : 'dark_mode',
            subtitle: () => dashboardTheme.value === 'dark' ? 'Dark theme is active. Switch to light.' : 'Light theme is active. Switch to dark.',
            onClick: () => setDashboardTheme(dashboardTheme.value === 'dark' ? 'light' : 'dark'),
        },
    ],
});

const globalHeaderControls = () => _.Btn({
    class: 'at-dashboardUserMenuTrigger',
    color: 'secondary',
    icon: 'account_circle',
    title: 'Open account menu',
    ariaLabel: 'Open account menu',
    onClick: (event) => userMenu.toggle(event.currentTarget),
});

const dashboardBrand = () => _.span({ class: 'at-dashboardBrand' },
    _.span({ class: 'at-dashboardBrandCopy' }, 'Audiobook Tools'),
    _.span({ class: 'at-dashboardHeaderBookPanel' }, () => {
        pageHeaderActionsVersion.value;
        return pageHeaderActions().filter(isBookPanelAction);
    }),
);

const rightHeader = _.div({ class: 'at-dashboardPageActions' }, () => {
    pageHeaderActionsVersion.value;
    return [
        _.div({ class: 'at-dashboardEditionSlot' }, () => bookEditionVisible.value
            ? _.Select({ class: 'at-dashboardEditionSelect', model: selectedBookEdition, options: () => bookEditionOptions.value, onChange: changeBookEdition })
            : null),
        ...pageHeaderActions().filter((action) => !isBookPanelAction(action)),
        globalHeaderControls(),
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
            title: dashboardBrand,
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

let contentPage = _.div({ class: "jsswift-route-outlet" });
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
_.router.add('/dashboard/book/:key_book/audiobook/demo', routePage(abtPlayPage));
_.router.add('/dashboard/setting', routePage(settingPage));
_.router.add('/dashboard/books', routePage(booksPage));
_.router.add('/dashboard/upload-audio', routePage(uploadAudioPage));
_.router.add('/dashboard/profile', routePage(profilePage));
_.router.add('/dashboard/tokens', routePage(tokensPage));
_.router.add('/dashboard/activity', routePage(activityPage));
_.router.add('/dashboard/statistics', routePage(statisticsPage));
_.router.add('/dashboard/team', routePage(teamPage));
_.router.add('/dashboard/prompts', routePage(promptsPage));
_.router.add('/dashboard/support', routePage(supportPage));
_.router.add('/dashboard/admin', routePage(supportPage));
_.router.add('/dashboard/admin/tickets', routePage(supportPage));
_.router.add('/dashboard/admin/users', routePage(supportPage));
_.router.add('/dashboard/admin/ai-pricing', routePage(adminAiPricingPage));
_.router.add('/dashboard/admin/subscription-plans', routePage(adminSubscriptionPlansPage));
_.router.add('/dashboard/admin/token-packages', routePage(adminTokenPackagesPage));
_.router.add('/dashboard/logout', routePage(logoutPage));

_.router.start();
