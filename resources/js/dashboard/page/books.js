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

function openBookRemovalDialog(book) {
    const hasReleases = Number(book.release_count || 0) > 0;
    const confirmation = _.rod(false);
    const action = _.rod('idle');
    const status = _.rod(null);

    const pauseBook = async (close) => {
        action.value = 'pausing';
        status.value = null;
        try {
            await _.http.patchJSON(`/dashboard/api/books/${book.key_book}/pause`, {});
            books.value = books.value.map((item) => item.key_book === book.key_book
                ? { ...item, online_release_count: 0, is_paused: true }
                : item);
            close();
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to pause this book.' };
        } finally {
            action.value = 'idle';
        }
    };

    const deleteBook = async (close) => {
        if (!confirmation.value) return;

        action.value = 'deleting';
        status.value = null;
        try {
            await _.http.delJSON(`/dashboard/api/books/${book.key_book}`);
            books.value = books.value.filter((item) => item.key_book !== book.key_book);
            close();
        } catch (error) {
            status.value = { type: 'danger', message: error.message || 'Unable to delete this book.' };
        } finally {
            action.value = 'idle';
        }
    };

    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3(hasReleases ? 'Pause book' : 'Delete book'),
                _.span({ class: 'text-muted' }, book.name),
            ),
            content: ({ close }) => _.div({ class: 'at-libraryDeleteDialog' },
                hasReleases
                    ? _.div(
                        _.strong('This book has release records and cannot be deleted.'),
                        _.p(`Pause will make ${book.online_release_count || 0} public release${Number(book.online_release_count || 0) === 1 ? '' : 's'} unavailable and set the book to private. All data and release files stay protected.`),
                        Number(book.distribution_release_count || 0) > 0
                            ? _.p({ class: 'at-libraryDeleteWarning' }, 'Distribution releases must also be paused with their external provider.')
                            : null,
                    )
                    : _.div(
                        _.strong('This permanently deletes the book.'),
                        _.p('All manuscript data, editor blocks and book-specific files will be removed. This cannot be undone.'),
                        _.Checkbox({
                            label: 'I understand that this cannot be undone.',
                            model: confirmation,
                        }),
                    ),
                () => status.value ? _.Alert(status.value) : null,
                _.div({ class: 'at-libraryDeleteActions' },
                    _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                    hasReleases
                        ? _.Btn({ color: 'warning', icon: 'pause_circle', loading: () => action.value === 'pausing', onClick: () => pauseBook(close) }, 'Pause public releases')
                        : _.Btn({ color: 'danger', icon: 'delete_outline', loading: () => action.value === 'deleting', disabled: () => !confirmation.value, onClick: () => deleteBook(close) }, 'Delete permanently'),
                ),
            ),
        },
    }).open();
}

function bookCard(book, index) {
    return _.article({ class: 'at-libraryBook' },
        _.div({ class: 'at-libraryBookCoverWrap' },
            _.button({
                type: 'button',
                class: 'at-libraryBookCover',
                title: `Open ${book.name}`,
                onclick: () => _.router.navigate(`/dashboard/book/${book.key_book}/panel`),
            }, bookCover(book, index)),
            _.button({
                type: 'button',
                class: 'at-libraryBookManage',
                title: `Delete or pause ${book.name}`,
                'aria-label': `Delete or pause ${book.name}`,
                onclick: () => openBookRemovalDialog(book),
            }, _.Icon ? _.Icon({ name: 'delete_outline' }) : '⌫'),
        ),
        _.div({ class: 'at-libraryBookMeta' },
            _.h3(book.name),
            _.p({ class: 'at-libraryBookDescription' }, book.description || 'No description yet.'),
            _.div({ class: 'at-libraryBookDetails' },
                _.span(_.Icon ? _.Icon({ name: 'category' }) : null, `${book.categories_count || 0} categories`),
                _.span(_.Icon ? _.Icon({ name: 'schedule' }) : null, updatedAt(book.updated_at)),
                Number(book.release_count || 0) > 0
                    ? _.span({ class: book.is_paused ? 'at-libraryBookRelease is-paused' : 'at-libraryBookRelease' },
                        _.Icon ? _.Icon({ name: book.is_paused ? 'pause_circle' : 'public' }) : null,
                        book.is_paused ? 'Public releases paused' : `${book.release_count} release${Number(book.release_count) === 1 ? '' : 's'}`,
                    )
                    : null,
            ),
        ),
    );
}

function emptyLibrary() {
    return _.div({ class: 'at-libraryEmpty' },
        _.div({ class: 'at-libraryEmptyIcon' }, _.Icon ? _.Icon({ name: 'auto_stories', size: 'xxl' }) : '📚'),
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
