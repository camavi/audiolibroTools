import 'cmswift';

const _ = window._;

const navGroups = [
    {
        label: 'My books',
        icon: 'menu_book',
        expanded: true,
        items: [
            { label: 'New book' },
            { label: 'List of books' },
        ],
    },
    { label: 'Activity book', icon: 'pie_chart' },
    { label: 'Monetize', icon: 'monetization_on' },
    { label: 'My tokens', icon: 'token' },
    { label: 'External services', icon: 'folder_special' },
    { label: 'Team', icon: 'diversity_3' },
    { label: 'Profile', icon: 'person' },
    { label: 'Organization', icon: 'hub' },
    {
        label: 'Admin',
        icon: 'settings',
        expanded: true,
        items: [
            { label: 'Test Audio' },
            { label: 'Upload audio' },
            { label: 'Prompts AI' },
        ],
    },
    { label: 'Logout', icon: 'logout' },
];

function brandMark() {
    return _.div(
        _.div({  'aria-hidden': 'true' },
            _.Icon({ name: 'headphones', size: 'xl' }),
        ),
        _.div(
            _.span('Audiobook Tools'),
            _.strong('Editor'),
        ),
    );
}

function navItem(item) {
    return _.div(
        _.Btn({ type: 'button' },
            item.icon ? _.Icon({ name: item.icon, size: 'md'}) : null,
            _.span(item.label),
            item.expanded ? _.span({ 'aria-hidden': 'true' }) : null,
        ),
        item.children?.length ? _.div(
            ...item.children.map((child) => _.a({ href: '#' }, child.label)),
        ) : null,
    );
}

function aside() {
    return _.Drawer({
        header: brandMark(),
        items: navGroups,
    },
    );
}

function page() {
    return _.Page(
        _.Card('Dashboard work area'),
    );
}

function mountDashboard() {
    const root = document.getElementById('dashboard-root');
    if (!root || !_) return;

    const layout = _.Layout({
        header: _.Header({
          left: false,
          title: 'Audiobook Tools',
          subtitle: 'Editor',
          right: _.div({ style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          )
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
        page,
    });

    _.mount(root, layout, { clear: true });
}

_.ready(mountDashboard);
