import '../../../css/dashboardHome.css';

const workspace = _.rod(null);
const loading = _.rod(true);
const status = _.rod(null);
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};

async function loadWorkspace() {
    loading.value = true;
    try {
        const [booksPayload, tokensPayload, teamPayload] = await Promise.all([
            _.http.getJSON('/dashboard/api/books'),
            _.http.getJSON('/dashboard/api/tokens'),
            _.http.getJSON('/dashboard/api/team'),
        ]);
        workspace.value = { books: unwrap(booksPayload) || [], tokens: unwrap(tokensPayload), team: unwrap(teamPayload) };
    } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to load your workspace.' }; }
    finally { loading.value = false; }
}

function action(icon, title, copy, path) { return _.button({ type: 'button', class: 'at-homeAction', onclick: () => _.router.navigate(path) }, _.Icon({ name: icon }), _.div(_.strong(title), _.span(copy)), _.Icon({ name: 'arrow_forward' })); }
function bookCard(book) { return _.button({ type: 'button', class: 'at-homeBook', onclick: () => _.router.navigate(`/dashboard/book/${book.key_book}/panel`) }, book.cover_img ? _.img({ src: book.cover_img, alt: '' }) : _.div({ class: 'at-homeBookCover' }, _.Icon({ name: 'menu_book' })), _.div(_.strong(book.name), _.span(book.description || 'Continue your book workspace'), _.small(book.updated_at ? `Updated ${new Date(book.updated_at).toLocaleDateString()}` : 'New book'))); }

export default function dashboardHome() {
    loadWorkspace();
    return _.main({ class: 'at-homePage' },
        () => loading.value ? _.div({ class: 'at-homeLoading' }, 'Loading your workspace…') : workspace.value ? _.div({ class: 'at-homeWorkspace' },
            _.section({ class: 'at-homeHero' }, _.div(_.span('Audiobook Tools workspace'), _.h2(() => workspace.value.books.length ? 'Pick up where you left off' : 'Ready to create your first book?'), _.p(() => workspace.value.books.length ? 'Your recent work, workflow shortcuts and account status are all here.' : 'Start with a manuscript, then turn it into a book, audiobook and published edition.')), _.Btn({ color: 'primary', icon: 'add', onClick: () => _.router.navigate('/dashboard/new-book') }, 'New book')),
            workspace.value.books.length ? _.section({ class: 'at-homeSection' }, _.div({ class: 'at-homeSectionHead' }, _.div(_.span('Continue working'), _.h3('Recent books')), _.Btn({ color: 'secondary', onClick: () => _.router.navigate('/dashboard/books') }, 'View all')), _.div({ class: 'at-homeBooks' }, ...workspace.value.books.slice(0, 3).map(bookCard))) : _.section({ class: 'at-homeStart' }, _.div({ class: 'at-homeStartIcon' }, _.Icon({ name: 'auto_stories' })), _.div(_.span('First steps'), _.h3('Build your first edition'), _.p('Create a blank book or upload your manuscript. The editor will guide the rest of the workflow.'), _.div({ class: 'at-homeSteps' }, _.span('1 · Manuscript'), _.span('2 · Edit'), _.span('3 · Create audio'))), _.Btn({ color: 'primary', icon: 'add', onClick: () => _.router.navigate('/dashboard/new-book') }, 'Create a book')),
            _.section({ class: 'at-homeSection' }, _.div({ class: 'at-homeSectionHead' }, _.div(_.span('Quick actions'), _.h3('Move your work forward'))), _.div({ class: 'at-homeActions' }, action('upload_file', 'Upload manuscript', 'Import a document and start editing', '/dashboard/new-book'), action('graphic_eq', 'Audio library', 'Add voices and sound references', '/dashboard/upload-audio'), action('psychology', 'Prompts AI', 'Save reusable AI instructions', '/dashboard/prompts'), action('group', 'Invite a collaborator', 'Share book work securely', '/dashboard/team'))),
            workspace.value.books.length ? _.section({ class: 'at-homeStats' }, _.div(_.Icon({ name: 'menu_book' }), _.div(_.strong(String(workspace.value.books.length)), _.span('Books in your library'))), _.div(_.Icon({ name: 'token' }), _.div(_.strong(String(workspace.value.tokens?.balance?.available_credits || 0)), _.span('Tokens available'))), _.div(_.Icon({ name: 'mail' }), _.div(_.strong(String(workspace.value.team?.received?.length || 0)), _.span('Team invites pending')))) : null,
        ) : null,
        () => status.value ? _.Alert(status.value) : null,
    );
}
