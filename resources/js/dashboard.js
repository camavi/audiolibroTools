import 'cmswift';

const _ = window._;
const currentView = _.rod('new-book');
const categoryOptions = _.rod([]);
const loadingCategories = _.rod(false);
const createdBook = _.rod(null);
const formStatus = _.rod(null);
const submittingBook = _.rod(false);

const title = _.rod('');
const description = _.rod('');
const categories = _.rod([]);

const navGroups = [
    {
        label: 'My books',
        icon: 'menu_book',
        expanded: true,
        items: [
            { label: 'New book', key: 'new-book', icon: 'add' },
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

async function apiJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            ...(options.headers || {}),
        },
        ...options,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload.message || 'Request failed';
        throw new Error(message);
    }

    return payload;
}

async function loadCategories() {
    if (loadingCategories.value || categoryOptions.value.length) return;

    loadingCategories.value = true;
    try {
        const payload = await apiJson('/dashboard/api/book-categories');
        categoryOptions.value = (payload.data || []).map((category) => ({
            label: category.name,
            value: category.id,
        }));
    } catch (error) {
        formStatus.value = { type: 'danger', title: 'Categories unavailable', message: error.message };
    } finally {
        loadingCategories.value = false;
    }
}

function resetNewBookForm() {
    title.value = '';
    description.value = '';
    categories.value = [];
    createdBook.value = null;
    formStatus.value = null;
}

async function createBook() {
    formStatus.value = null;

    if (!title.value.trim()) {
        formStatus.value = {
            type: 'warning',
            title: 'Missing title',
            message: 'Add a title before creating the book.',
        };
        return;
    }

    submittingBook.value = true;
    try {
        const payload = await apiJson('/dashboard/api/books', {
            method: 'POST',
            body: JSON.stringify({
                title: title.value.trim(),
                description: description.value.trim(),
                categories: (categories.value || []).map(Number),
            }),
        });

        createdBook.value = payload.data;
        formStatus.value = {
            type: 'success',
            title: 'Book created',
            message: `${payload.data.name} is ready for the editor workflow.`,
        };
    } catch (error) {
        formStatus.value = {
            type: 'danger',
            title: 'Creation failed',
            message: error.message,
        };
    } finally {
        submittingBook.value = false;
    }
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

function choiceCard({ icon, title, subtitle, action, disabled = false }) {
    return _.Card({
        icon,
        title,
        subtitle,
        dense: true,
        actions: _.Btn({
            color: 'primary',
            outline: disabled,
            disabled,
            iconRight: disabled ? null : 'arrow_forward',
            onClick: action,
        }, disabled ? 'Coming soon' : 'Open'),
    });
}

function newBookStart() {
    return [
        _.Card({
            title: 'Choose how to start',
            subtitle: 'A blank book follows the old Write book flow; upload will handle manuscript import.',
            body: _.Grid({ gap: 'lg' },
                _.GridCol({ span: 6, mobile: { span: 12 } },
                    choiceCard({
                        icon: 'edit_note',
                        title: 'Write book',
                        subtitle: 'Create an empty book with title, description and categories.',
                        action: () => {
                            currentView.value = 'new-book-write';
                            loadCategories();
                        },
                    }),
                ),
                _.GridCol({ span: 6, mobile: { span: 12 } },
                    choiceCard({
                        icon: 'upload_file',
                        title: 'Upload book',
                        subtitle: 'Import a manuscript and prepare it for block editing.',
                        disabled: true,
                    }),
                ),
            ),
        }),
    ];
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

function writeBookForm() {
    const book = createdBook.value;

    return [
        statusAlert(),
        _.Card({
            title: 'Write book',
            subtitle: 'Create the empty book record and prepare its editing file.',
            body: _.form({
                onSubmit: (event) => {
                    event.preventDefault();
                    createBook();
                },
            },
                _.Input({
                    label: 'Title',
                    icon: 'title',
                    clearable: true,
                    model: title,
                }),
                _.Select({
                    label: () => loadingCategories.value ? 'Loading categories...' : 'Categories',
                    icon: 'category',
                    multiple: true,
                    filterable: true,
                    model: categories,
                    options: () => categoryOptions.value,
                }),
                _.Textarea({
                    label: 'Description',
                    icon: 'notes',
                    rows: 5,
                    model: description,
                }),
                _.Toolbar({
                    align: 'center',
                    justify: 'space-between',
                },
                    _.Btn({
                        type: 'button',
                        icon: 'arrow_back',
                        outline: true,
                        onClick: () => {
                            currentView.value = 'new-book';
                            formStatus.value = null;
                        },
                    }, 'Back'),
                    _.Btn({
                        type: 'submit',
                        color: 'primary',
                        icon: 'add',
                        loading: submittingBook.value,
                    }, 'Create new book'),
                ),
            ),
        }),
        book ? _.Card({
                icon: 'check_circle',
                title: book.name,
                subtitle: `Key book: ${book.key_book}`,
                actions: _.Btn({
                    icon: 'edit',
                    color: 'primary',
                    outline: true,
                    disabled: true,
                }, 'Editor page next'),
            }) : null,
    ];
}

function placeholderPage() {
    const meta = pageMeta[currentView.value] || {
        title: navGroups.flatMap((item) => item.items || item).find((item) => item.key === currentView.value)?.label || 'Dashboard',
        subtitle: 'This dashboard page is not implemented yet.',
        icon: 'dashboard',
    };

    return [
        _.EmptyState({
            icon: meta.icon,
            title: meta.title,
            message: meta.subtitle,
        }),
    ];
}

function pageBody() {
    if (currentView.value === 'new-book') return newBookStart();
    if (currentView.value === 'new-book-write') return writeBookForm();
    return placeholderPage();
}

function page() {
    return _.Page({
        icon: () => (pageMeta[currentView.value]?.icon || 'dashboard'),
        title: () => (pageMeta[currentView.value]?.title || (currentView.value === 'new-book-write' ? 'Write book' : 'Dashboard')),
        subtitle: () => (pageMeta[currentView.value]?.subtitle || 'Create a blank book with Laravel backend.'),
        body: pageBody,
    });
}

function mountDashboard() {
    const root = document.getElementById('dashboard-root');
    if (!root || !_) return;

    const layout = _.Layout({
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
        page,
    });

    _.mount(root, layout, { clear: true });
}

_.ready(() => {
    loadCategories();
    mountDashboard();
});
