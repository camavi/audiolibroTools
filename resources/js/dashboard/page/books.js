import '../../../css/books.css';

const books = _.rod([]);
const booksStatus = _.rod('idle');
const booksError = _.rod(null);

function normalizeDataPayload(payload) {
    if (payload?.data?.data) return payload.data.data;
    if (payload?.data) return payload.data;

    return payload || {};
}

function coverStyle(index) {
    return `at-bookCover at-bookCover--${(index % 6) + 1}`;
}

function updatedAt(date) {
    if (!date) return 'New book';

    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(date));
}

function bookCover(book, index) {
    if (book.cover_img) {
        return _.img({
            class: 'at-bookCoverImage',
            src: book.cover_img,
            alt: `Cover of ${book.name}`,
        });
    }

    return _.div({ class: coverStyle(index), 'aria-hidden': 'true' },
        _.span({ class: 'at-bookCoverKicker' }, 'Audiobook Tools'),
        _.span({ class: 'at-bookCoverTitle' }, book.name),
        _.span({ class: 'at-bookCoverMark' }, _.Icon ? _.Icon({ name: 'menu_book' }) : '✦'),
    );
}

function bookCard(book, index) {
    return _.article({ class: 'at-libraryBook' },
        _.button({
            type: 'button',
            class: 'at-libraryBookCover',
            title: `Open ${book.name}`,
            onclick: () => _.router.navigate(`/dashboard/book/${book.key_book}/panel`),
        }, bookCover(book, index)),
        _.div({ class: 'at-libraryBookMeta' },
            _.h3(book.name),
            _.p({ class: 'at-libraryBookDescription' }, book.description || 'No description yet.'),
            _.div({ class: 'at-libraryBookDetails' },
                _.span(_.Icon ? _.Icon({ name: 'category' }) : null, `${book.categories_count || 0} categories`),
                _.span(_.Icon ? _.Icon({ name: 'schedule' }) : null, updatedAt(book.updated_at)),
            ),
        ),
    );
}

function emptyLibrary() {
    return _.div({ class: 'at-libraryEmpty' },
        _.div({ class: 'at-libraryEmptyIcon' }, _.Icon ? _.Icon({ name: 'auto_stories' }) : '📚'),
        _.h3('Your library is waiting for its first book'),
        _.p('Create a blank book or upload a manuscript to begin.'),
        _.Btn({ color: 'primary', iconRight: 'arrow_forward', onClick: () => _.router.navigate('/dashboard/new-book') }, 'Create a book'),
    );
}

function libraryContent() {
    if (booksStatus.value === 'loading') {
        return _.div({ class: 'at-libraryNotice' }, 'Loading your library…');
    }

    if (booksStatus.value === 'error') {
        return _.div({ class: 'at-libraryNotice at-libraryNotice--error' },
            _.span(booksError.value || 'Unable to load your books.'),
            _.Btn({ color: 'secondary', onClick: loadBooks }, 'Try again'),
        );
    }

    if (!books.value.length) return emptyLibrary();

    return _.div({ class: 'at-libraryShelf' },
        () => books.value.map((book, index) => bookCard(book, index)),
    );
}

async function loadBooks() {
    if (booksStatus.value === 'loading') return;

    booksStatus.value = 'loading';
    booksError.value = null;

    try {
        const payload = await _.http.getJSON('/dashboard/api/books');
        books.value = normalizeDataPayload(payload) || [];
        booksStatus.value = 'ready';
    } catch (error) {
        booksStatus.value = 'error';
        booksError.value = error.message;
    }
}

export default function booksPage() {
    loadBooks();

    return _.section({ class: 'at-libraryPage' },
        _.div({ class: 'at-libraryHeader' },
            _.div(
                _.span({ class: 'at-libraryEyebrow' }, 'My library'),
                _.h1('Your books'),
                _.p(() => booksStatus.value === 'ready'
                    ? `${books.value.length} ${books.value.length === 1 ? 'book' : 'books'} in your library`
                    : 'All the books you are creating in one place.'),
            ),
            _.Btn({ color: 'primary', iconRight: 'add', onClick: () => _.router.navigate('/dashboard/new-book') }, 'New book'),
        ),
        () => libraryContent(),
    );
}
