import '../../../css/newBookStart.css';

const categoryOptions = _.rod([]);
const loadingCategories = _.rod(false);
const createdBook = _.rod(null);
const formStatus = _.rod(null);
const submittingBook = _.rod(false);
const loadingCreateBook = _.rod(false);
const importingManuscript = _.rod(false);

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
function uploadBook() {
    const importPreview = _.rod(null);
    const confirmingImport = _.rod(false);
    const importProcessingStage = _.rod(null);
    let importProcessingTimer = null;

    const clearImportProcessingState = () => {
        if (importProcessingTimer) window.clearTimeout(importProcessingTimer);
        importProcessingTimer = null;
        importProcessingStage.value = null;
    };

    const startImportProcessingState = () => {
        clearImportProcessingState();
        importProcessingStage.value = 'uploading';
        importProcessingTimer = window.setTimeout(() => {
            importProcessingStage.value = 'analysing';
        }, 1200);
    };
    const manuscriptUpload = _.Upload({
        class: 'at-newBookUploadArea',
        label: 'Manuscript',
        subtitle: 'Choose a DOCX, TXT or text-based PDF file (max 25 MB).',
        accept: '.docx,.txt,application/pdf',
        multiple: false,
        maxFileSize: 25 * 1024 * 1024,
        url: '/dashboard/api/books/import-preview',
        method: 'POST',
        fieldName: 'manuscript',
        uploadButton: false,
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
        },
        onStart: () => {
            importingManuscript.value = true;
            formStatus.value = null;
            startImportProcessingState();
        },
        onSuccess: (item, { response }) => {
            const payload = JSON.parse(response.text || '{}');
            const preview = payload?.data?.data || payload?.data;
            if (!preview?.preview_token) {
                formStatus.value = { type: 'danger', title: 'Preview failed', message: 'The import preview did not include a confirmation token.' };
                return;
            }
            JSswift.reactive.untracked(() => {
                preview.blockTypeModels = (preview.summary?.structure || []).map((block) => _.rod(block.type));
                importPreview.value = preview;
            });
        },
        onError: (item, { error }) => {
            let message = error.message || 'Unable to analyse the manuscript.';
            try { message = JSON.parse(error.response?.text || '{}').message || message; } catch (_) { /* Keep the upload error. */ }
            formStatus.value = { type: 'danger', title: 'Preview failed', message };
        },
        onFinish: () => {
            importingManuscript.value = false;
            clearImportProcessingState();
        },
    });

    const submitImport = async () => {
        formStatus.value = null;
        if (importPreview.value) return;
        if (!manuscriptUpload._upload.files().length) {
            formStatus.value = { type: 'warning', title: 'Missing manuscript', message: 'Choose a DOCX, TXT or text-based PDF manuscript before importing.' };
            return;
        }
        manuscriptUpload._upload.upload();
    };

    const confirmImport = async (close) => {
        const preview = importPreview.value;
        if (!preview?.preview_token || confirmingImport.value) return;
        confirmingImport.value = true;
        formStatus.value = null;
        try {
            const payload = await _.http.postJSON('/dashboard/api/books/import-confirm', {
                preview_token: preview.preview_token,
                title: title.value.trim() || null,
                block_types: (preview.blockTypeModels || []).map((model) => model.value),
            });
            const book = payload?.data?.data || payload?.data;
            close();
            _.router.navigate(`/dashboard/book/${book.key_book}/edit`);
        } catch (error) {
            formStatus.value = { type: 'danger', title: 'Import failed', message: error.message || 'Unable to create the book from this preview.' };
        } finally {
            confirmingImport.value = false;
        }
    };

    const content = _.div({
        class: 'at-newBookDialogForm',
    },
        _.Row({ gap: 'md', class: 'at-newBookDialogFields' },
            _.Input({
                class: 'cms-col-24',
                label: 'Book title (optional)',
                icon: 'title',
                clearable: true,
                model: title,
                placeholder: 'Uses the file name when left blank',
            }),
            _.div({ class: 'cms-col-24' }, manuscriptUpload),
            _.div({ class: 'cms-col-24' }, () => {
                const stage = importProcessingStage.value;
                if (!stage) return null;

                const isAnalysing = stage === 'analysing';
                return _.div({ class: 'at-newBookImportProgress', role: 'status', ariaLive: 'polite' },
                    _.span({ class: 'at-newBookImportSpinner', ariaHidden: 'true' }),
                    _.div(
                        _.strong(isAnalysing ? 'Reviewing your manuscript' : 'Uploading your manuscript'),
                        _.span(isAnalysing
                            ? 'The server is extracting chapters and preparing the review. Larger books can take a little longer—please keep this window open.'
                            : 'Your file is on its way to the server. The review will open automatically when it is ready.'),
                    ),
                );
            }),
            _.div({ class: 'cms-col-24' }, () => {
                const preview = importPreview.value;
                if (!preview) return null;
                const summary = preview.summary || {};
                return _.section({ class: 'at-newBookImportPreview' },
                    _.div(_.span('Import review'), _.h3('Structure detected')),
                    _.p(`${summary.chapters || 0} chapters · ${summary.blocks || 0} blocks · ${summary.words || 0} words`),
                    _.p('Change a block to Chapter heading when it should appear in the book index.'),
                    _.div({ class: 'at-newBookImportHeadings' }, ...(summary.structure || []).map((block, index) => _.div({ class: 'at-newBookImportBlock' },
                        _.Select({ label: false, model: preview.blockTypeModels?.[index], options: [{ value: 'heading', label: 'Chapter heading' }, { value: 'paragraph', label: 'Paragraph' }] }),
                        _.span(block.text),
                    ))),
                );
            }),
            _.div({ class: 'cms-col-24' }, () => formStatus.value?.message ? statusAlert() : null),
        )
    );

    return {
        content,
        actions: (close) => _.div({ class: 'at-newBookDialogActions' },
            _.Btn({ type: 'button', color: 'secondary', onClick: () => { clearImportProcessingState(); close(); } }, 'Cancel'),
            () => importPreview.value
                ? _.Btn({ type: 'button', color: 'primary', icon: 'auto_stories', loading: confirmingImport, onClick: () => confirmImport(close) }, 'Confirm and create book')
                : _.Btn({ type: 'button', color: 'primary', icon: 'preview', loading: importingManuscript, onClick: submitImport }, () => importingManuscript.value ? 'Reviewing manuscript…' : 'Review manuscript'),
        ),
    };
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
                            const importer = uploadBook();
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
                                    content: importer.content,
                                    actions: ({ close }) => importer.actions(close),
                                }
                            }).open();
                        },
                    }),
            ),
        ),
        _.section({ class: 'at-newBookNote' }, _.Icon({ name: 'info' }), _.span('You can add cover design, ePub, PDF, audiobook and distribution settings after creating the book.')),
    );
}
