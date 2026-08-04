const categoryOptions = _.rod([]);
const loadingCategories = _.rod(false);
const createdBook = _.rod(null);
const formStatus = _.rod(null);
const submittingBook = _.rod(false);

const title = _.rod('');
const description = _.rod('');
const categories = _.rod([]);
async function loadCategories() {
    if (loadingCategories.value || categoryOptions.value.length) return;
    loadingCategories.value = true;
    try {
        const payload = await _.http.getJSON('/dashboard/api/book-categories');
        categoryOptions.value = (payload.data.data || []).map((category) => ({
            label: category.name,
            value: category.id,
        }));
    } catch (error) {
        formStatus.value = { type: 'danger', title: 'Categories unavailable', message: error.message };
    } finally {
        loadingCategories.value = false;
    }
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
    //Categories must be selected
    if (!categories.value.length) {
        formStatus.value = {
            type: 'warning',
            title: 'Missing categories',
            message: 'Select at least one category before creating the book.',
        };
        return;
    }

    submittingBook.value = true;
    try {
        const payload = await _.http.postJSON('/dashboard/api/books', {
            title: title.value.trim(),
            description: description.value.trim(),
            categories: (categories.value || []).map(Number),
        });

        createdBook.value = payload.data.data;
        formStatus.value = {
            type: 'success',
            title: 'Book created',
            message: `${createdBook.value.name} is ready for the editor workflow.`,
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
function statusAlert() {
    const status = formStatus.value;
    if (!status) return null;

    return _.Alert({
        type: status.type,
        title: status.title,
        message: status.message,
    });
}

function writeBookForm(close) {
    return _.form({
        action: '#',
        method: 'post',
        onSubmit: (event) => {
            event.preventDefault();
            createBook();
        },
    },
        _.Row({ gap: 'md' },
            _.Input({
                class: 'cms-col-24',
                label: 'Title',
                icon: 'title',
                clearable: true,
                model: title,
            }),
            _.Select({
                class: 'cms-col-24',
                label: () => loadingCategories.value ? 'Loading categories...' : 'Categories',
                icon: 'category',
                multiple: true,
                filterable: true,
                model: categories,
                options: () => categoryOptions.value,
            }),
            _.Textarea({
                class: 'cms-col-24',
                label: 'Description',
                icon: 'notes',
                rows: 5,
                model: description,
            }),
            _.div({ class: 'cms-col-24' }, () => formStatus.value?.message ? statusAlert() : null),
            _.div({ class: 'cms-col-24', align: 'right' },
                _.Btn({ type: "button", class: 'cms-m-r-sm', color: "secondary", onClick: close }, "Close"), _.Btn({ type: "submit", color: "primary" }, "Create book")
            )
        )
    );

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

export default function newBookStart() {
    loadCategories();
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
                            console.log('Write book');
                            _.Dialog({
                                size: "lg",
                                stickyActions: true,
                                slots: {
                                    header: _.div(
                                        _.h3('Create a new book'),
                                        _.span({ class: 'text-muted' }, 'A blank book follows the old Write book flow; upload will handle manuscript import.'),
                                    ),
                                    content: ({ close }) => writeBookForm(close),
                                }
                            }).open();
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
