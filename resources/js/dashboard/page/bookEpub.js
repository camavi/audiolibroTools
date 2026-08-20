import '../../../css/bookEpub.css';

const epubData = _.rod(null);
const loading = _.rod(true);
const saving = _.rod(false);
const generating = _.rod(false);
const pageStatus = _.rod(null);

const title = _.rod(''); const subtitle = _.rod(''); const author = _.rod(''); const publisher = _.rod('');
const publicationDate = _.rod(''); const identifier = _.rod(''); const language = _.rod('en'); const description = _.rod(''); const subjects = _.rod(''); const rights = _.rod('');
const direction = _.rod('auto'); const includeToc = _.rod(true); const includeTitlePage = _.rod(true); const chapterBreak = _.rod('heading');

const languageOptions = [
    { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' }, { value: 'pt', label: 'Português' }, { value: 'ar', label: 'العربية' }, { value: 'zh', label: '中文' }, { value: 'ja', label: '日本語' },
];

function keyBook(ctx) { return ctx?.params?.key_book || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/epub/)?.[1] || null; }
function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }

function settingsPayload() {
    return { settings: { metadata: {
        title: title.value.trim(), subtitle: subtitle.value.trim(), author: author.value.trim(), publisher: publisher.value.trim(), publication_date: publicationDate.value || null, identifier: identifier.value.trim(), language: language.value, description: description.value.trim(), subjects: subjects.value.split(',').map((item) => item.trim()).filter(Boolean), rights: rights.value.trim(),
    }, reading: { direction: direction.value, include_toc: includeToc.value, include_title_page: includeTitlePage.value, chapter_break: chapterBreak.value } } };
}

function hydrate(data) {
    const meta = data.settings?.metadata || {}; const reading = data.settings?.reading || {};
    CMSwift.reactive.untracked(() => {
        title.value = meta.title || ''; subtitle.value = meta.subtitle || ''; author.value = meta.author || ''; publisher.value = meta.publisher || '';
        publicationDate.value = meta.publication_date || ''; identifier.value = meta.identifier || ''; language.value = meta.language || 'en'; description.value = meta.description || ''; subjects.value = (meta.subjects || []).join(', '); rights.value = meta.rights || '';
        direction.value = reading.direction || 'auto'; includeToc.value = Boolean(reading.include_toc); includeTitlePage.value = Boolean(reading.include_title_page); chapterBreak.value = reading.chapter_break || 'heading';
    });
}

async function loadEpub(bookKey) {
    loading.value = true;
    try { const data = dataOf(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/epub`)); epubData.value = data; hydrate(data); }
    catch (error) { pageStatus.value = { type: 'danger', message: error.message || 'Unable to load ePub settings.' }; }
    finally { loading.value = false; }
}

async function saveEpub(bookKey, quiet = false) {
    if (!title.value.trim()) { pageStatus.value = { type: 'warning', message: 'An ePub title is required.' }; return false; }
    saving.value = true; if (!quiet) pageStatus.value = null;
    try {
        const data = dataOf(await _.http.putJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/epub`, settingsPayload()));
        epubData.value = { ...epubData.value, settings: data.settings };
        if (!quiet) pageStatus.value = { type: 'success', message: 'ePub settings saved.' };
        return true;
    } catch (error) { pageStatus.value = { type: 'danger', message: error.message || 'Unable to save ePub settings.' }; return false; }
    finally { saving.value = false; }
}

async function generateEpub(bookKey) {
    if (!title.value.trim()) { pageStatus.value = { type: 'warning', message: 'An ePub title is required.' }; return; }
    generating.value = true; pageStatus.value = null;
    try {
        const data = dataOf(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/epub/generate`, settingsPayload(), { timeout: 180000, retry: { attempts: 0 } }));
        epubData.value = { ...epubData.value, settings: data.settings, generated_at: data.generated_at, download_url: data.download_url };
        pageStatus.value = { type: 'success', message: 'Your ePub 3 edition is ready to download.' };
    } catch (error) { pageStatus.value = { type: 'danger', message: error.message || 'Unable to create the ePub.' }; }
    finally { generating.value = false; }
}

export default function bookEpub(ctx) {
    const bookKey = keyBook(ctx); loadEpub(bookKey);
    window.AudiobookTools?.setPageHeaderActions?.([_.Btn({ color: 'secondary', icon: 'arrow_back', onClick: () => _.router.navigate(`/dashboard/book/${bookKey}/panel`) }, 'Book panel')]);
    return _.main({ class: 'at-bookEpubPage' },
        _.section({ class: 'at-bookEpubHeader' }, _.div(_.span('ePub studio'), _.h2('Professional ePub edition'), _.p('Set publication metadata, reading navigation and a clean, reflowable edition ready for e-readers.')), _.Btn({ color: 'primary', icon: 'auto_stories', loading: generating, onClick: () => generateEpub(bookKey) }, 'Create ePub')),
        () => pageStatus.value ? _.Alert(pageStatus.value) : null,
        () => loading.value ? _.div({ class: 'at-bookEpubLoading' }, 'Loading ePub workspace…') : _.div({ class: 'at-bookEpubGrid' },
            _.section({ class: 'at-bookEpubCard at-bookEpubMetadata' },
                _.div({ class: 'at-bookEpubCardHead' }, _.div(_.span('Publication metadata'), _.h3('Book details')), _.small('Used by bookstores and reading apps')),
                _.div({ class: 'at-bookEpubFields' },
                    _.Input({ class: 'cms-col-12', label: 'Title', model: title, required: true }), _.Input({ class: 'cms-col-12', label: 'Subtitle', model: subtitle }),
                    _.Input({ class: 'cms-col-12', label: 'Author', model: author, placeholder: 'Author or pen name' }), _.Input({ class: 'cms-col-12', label: 'Publisher / imprint', model: publisher }),
                    _.Input({ class: 'cms-col-8', label: 'Publication date', type: 'date', model: publicationDate }), _.Input({ class: 'cms-col-8', label: 'ISBN or identifier', model: identifier, placeholder: '978-…' }), _.Select({ class: 'cms-col-8', label: 'Language', model: language, options: languageOptions }),
                    _.Textarea({ class: 'cms-col-24', label: 'Description', rows: 4, model: description, placeholder: 'Short book description for the ePub metadata.' }),
                    _.Input({ class: 'cms-col-24', label: 'Subjects / keywords', model: subjects, placeholder: 'Fantasy, Italian fiction, Coming of age' }),
                    _.Textarea({ class: 'cms-col-24', label: 'Copyright and rights', rows: 2, model: rights, placeholder: '© 2026 Author name. All rights reserved.' }),
                ),
            ),
            _.aside({ class: 'at-bookEpubSide' },
                _.section({ class: 'at-bookEpubCard' },
                    _.div({ class: 'at-bookEpubCardHead' }, _.div(_.span('Reading experience'), _.h3('ePub structure'))),
                    _.div({ class: 'at-bookEpubReading' },
                        _.Select({ label: 'Reading direction', model: direction, options: [{ value: 'auto', label: 'Automatic (left to right)' }, { value: 'ltr', label: 'Left to right' }, { value: 'rtl', label: 'Right to left' }] }),
                        _.Select({ label: 'Chapter splitting', model: chapterBreak, options: [{ value: 'heading', label: 'Create a file at every heading' }, { value: 'single', label: 'Keep the manuscript in one chapter' }] }),
                        _.Checkbox({ label: 'Include navigation table of contents', model: includeToc }),
                        _.Checkbox({ label: 'Include generated title page', model: includeTitlePage }),
                    ),
                ),
                _.section({ class: 'at-bookEpubCard at-bookEpubExport' },
                    _.div({ class: 'at-bookEpubCardHead' }, _.div(_.span('Export readiness'), _.h3('ePub 3 package'))),
                    () => _.div({ class: 'at-bookEpubChecks' },
                        _.div(_.Icon({ name: 'article' }), _.span(`${epubData.value?.statistics?.blocks || 0} manuscript blocks · ${epubData.value?.statistics?.words || 0} words`)),
                        _.div(_.Icon({ name: epubData.value?.statistics?.has_cover ? 'check_circle' : 'warning_amber' }), _.span(epubData.value?.statistics?.has_cover ? 'Cover image included' : 'No cover selected yet')),
                        _.div(_.Icon({ name: 'format_paint' }), _.span('Uses your global book styles')),
                    ),
                    () => epubData.value?.download_url ? _.div({ class: 'at-bookEpubDownload' }, _.small(`Last generated ${new Date(epubData.value.generated_at).toLocaleString()}`), _.Btn({ color: 'secondary', icon: 'download', onClick: () => window.open(epubData.value.download_url, '_blank', 'noopener') }, 'Download ePub')) : _.small({ class: 'at-bookEpubPending' }, 'Generate the edition when the metadata is ready.'),
                    _.div({ class: 'at-bookEpubActions' }, _.Btn({ color: 'secondary', icon: 'save', loading: saving, onClick: () => saveEpub(bookKey) }, 'Save settings'), _.Btn({ color: 'primary', icon: 'auto_stories', loading: generating, onClick: () => generateEpub(bookKey) }, 'Create ePub')),
                ),
            ),
        ),
    );
}
