import '../../../css/newBookStart.css';

const categoryOptions = _.rod([]);
const loadingCategories = _.rod(false);
const createdBook = _.rod(null);
const formStatus = _.rod(null);
const submittingBook = _.rod(false);
const loadingCreateBook = _.rod(false);

const title = _.rod('');
const description = _.rod('');
const categories = _.rod([]);

const uploadFile = _.Upload({
    label: 'Upload book',
    multiple: false,
    model: 'upload',
    accept: ".txt,.pdf/*",
    uploadButton: false,
});
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
        loadingCreateBook.value = true;
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
        // redirect to editor
        _.router.navigate(`/dashboard/book/${createdBook.value.key_book}/edit`);
    } catch (error) {
        formStatus.value = {
            type: 'danger',
            title: 'Creation failed',
            message: error.message,
        };
    } finally {
        loadingCreateBook.value = false;
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
        class: 'at-newBookDialogForm',
        action: '#',
        method: 'post',
        onSubmit: (event) => {
            event.preventDefault();
            createBook();
        },
    },
        _.Row({ gap: 'md', class: 'at-newBookDialogFields' },
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
            _.div({ class: 'cms-col-24 at-newBookDialogActions' },
                _.Btn({ type: "button", color: "secondary", onClick: close }, "Cancel"),
                _.Btn({ type: "submit", color: "primary", icon: 'auto_stories', loading: loadingCreateBook }, "Create book")
            )
        )
    );

}
function uploadBook(close) {
    return _.form({
        class: 'at-newBookDialogForm',
        action: '#',
        method: 'post',
        onSubmit: (event) => {
            event.preventDefault();
        },
    },
        _.div({ class: 'at-newBookUploadArea' }, uploadFile),
        _.Row({ gap: 'md', class: 'at-newBookDialogFields' },
            _.div({ class: 'cms-col-24' }, () => formStatus.value?.message ? statusAlert() : null),
            _.div({ class: 'cms-col-24 at-newBookDialogActions' },
                _.Btn({ type: "button", color: "secondary", onClick: close }, "Cancel"),
                _.Btn({ type: "submit", color: "primary", icon: 'upload_file' }, "Upload manuscript")
            )
        )
    );
}
function choiceCard({ icon, title, subtitle, action, disabled = false }) {
    return _.button({ type: 'button', class: 'at-newBookChoice', disabled, onClick: action },
        _.span({ class: 'at-newBookChoiceIcon' }, _.Icon({ name: icon })),
        _.div({ class: 'at-newBookChoiceCopy' }, _.h3(title), _.p(subtitle)),
        _.span({ class: 'at-newBookChoiceAction' }, disabled ? 'Coming soon' : ['Start', _.Icon({ name: 'arrow_forward' })]),
    );
}

export default function newBookStart() {
    loadCategories();
    return _.main({ class: 'at-newBookPage' },
        _.section({ class: 'at-newBookHero' }, _.div(
            _.span('Create a new project'), _.h2('How would you like to start?'),
            _.p('Begin with a blank book or bring an existing manuscript into your workspace.'),
        )),
        _.section({ class: 'at-newBookChoices' },
            _.div({ class: 'at-newBookSectionHead' }, _.span('Start your book'), _.h3('Choose a workflow')),
            _.div({ class: 'at-newBookChoiceGrid' },
                choiceCard({
                        icon: 'edit_note',
                        title: 'Write book',
                        subtitle: 'Start from a blank manuscript. Add the details, then build your book in the editor.',
                        action: () => {
                            _.Dialog({
                                size: "lg",
                                stickyActions: true,
                                panelClass: 'at-newBookDialogPanel',
                                slots: {
                                    header: _.div({ class: 'at-newBookDialogHeader' },
                                        _.span({ class: 'at-newBookDialogEyebrow' }, 'New manuscript'),
                                        _.h3('Create a new book'),
                                        _.p('Add the essentials now. You can refine the manuscript, design and publishing settings later.'),
                                    ),
                                    content: ({ close }) => writeBookForm(close),
                                }
                            }).open();
                        },
                    }),
                choiceCard({
                        icon: 'upload_file',
                        title: 'Upload book',
                        subtitle: 'Import a manuscript and prepare it for block editing.',
                        action: () => {
                            _.Dialog({
                                size: "lg",
                                stickyActions: true,
                                panelClass: 'at-newBookDialogPanel',
                                slots: {
                                    header: _.div({ class: 'at-newBookDialogHeader' },
                                        _.span({ class: 'at-newBookDialogEyebrow' }, 'Manuscript import'),
                                        _.h3('Upload a book'),
                                        _.p('Upload your source file and prepare it for block editing in the workspace.'),
                                    ),
                                    content: ({ close }) => uploadBook(close),
                                }
                            }).open();
                        },
                    }),
            ),
        ),
        _.section({ class: 'at-newBookNote' }, _.Icon({ name: 'info' }), _.span('You can add cover design, ePub, PDF, audiobook and distribution settings after creating the book.')),
    );
}
