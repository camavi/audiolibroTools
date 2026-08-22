import '../../../css/bookDesign.css';
import { bookPanelButton } from '../shared/bookPanelButton';

const designBook = _.rod(null);
const assets = _.rod([]);
const loading = _.rod(true);
const uploading = _.rod(false);
const saving = _.rod(false);
const status = _.rod(null);

const format = _.rod('a5');
const widthMm = _.rod('148');
const heightMm = _.rod('210');
const formatOptions = [
    { value: 'a5', label: 'A5 · 148 × 210 mm' },
    { value: 'a6', label: 'A6 · 105 × 148 mm' },
    { value: 'custom', label: 'Custom size' },
];
const presets = { a5: ['148', '210'], a6: ['105', '148'] };

function keyBook(ctx) {
    return ctx?.params?.key_book || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/design/)?.[1] || null;
}

function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function csrfToken() { return document.querySelector('meta[name="csrf-token"]')?.content || ''; }

function currentCover() {
    return assets.value.find((asset) => asset.image_url === designBook.value?.cover_img) || null;
}

async function loadDesign(bookKey) {
    if (!bookKey) return;
    loading.value = true;
    try {
        const [bookPayload, assetsPayload] = await Promise.all([
            _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}`),
            _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/design-assets`),
        ]);
        const book = dataOf(bookPayload);
        const library = dataOf(assetsPayload);
        CMSwift.reactive.untracked(() => {
            designBook.value = book;
            assets.value = library.assets || [];
            const cover = book.book_design_json?.cover || {};
            format.value = cover.format || 'a5';
            widthMm.value = String(cover.width_mm || 148);
            heightMm.value = String(cover.height_mm || 210);
        });
    } catch (error) {
        status.value = { type: 'danger', message: error.message || 'Unable to load the design workspace.' };
    } finally { loading.value = false; }
}

function selectFormat(value) {
    format.value = value;
    if (presets[value]) [widthMm.value, heightMm.value] = presets[value];
}

async function saveFormat(bookKey) {
    const width = Number(widthMm.value); const height = Number(heightMm.value);
    if (!width || !height || width < 50 || height < 50) {
        status.value = { type: 'warning', message: 'Enter a valid cover width and height.' };
        return;
    }
    saving.value = true; status.value = null;
    try {
        const payload = await _.http.patchJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/cover-spec`, { format: format.value, width_mm: width, height_mm: height });
        const cover = dataOf(payload).cover;
        designBook.value = { ...designBook.value, book_design_json: { ...(designBook.value.book_design_json || {}), cover } };
        status.value = { type: 'success', message: 'Cover format saved.' };
    } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to save the cover format.' }; }
    finally { saving.value = false; }
}

async function uploadAsset(bookKey, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { status.value = { type: 'warning', message: 'Choose a JPG, PNG or WebP image.' }; return; }
    uploading.value = true; status.value = null;
    try {
        const body = new FormData(); body.append('image', file); body.append('name', file.name.replace(/\.[^.]+$/, ''));
        // CMSwift's JSON helpers intentionally serialize JSON. Upload needs a
        // multipart request so the selected image can remain a real file.
        const response = await fetch(`/dashboard/api/books/${encodeURIComponent(bookKey)}/design-assets`, { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrfToken() }, body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Unable to upload the image.');
        const asset = dataOf(payload).asset;
        assets.value = [asset, ...assets.value];
        status.value = { type: 'success', message: 'Image added to the design library.' };
    } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to upload the image.' }; }
    finally { uploading.value = false; }
}

function openGenerateImageDialog(bookKey) {
    const prompt = _.rod('');
    const generating = _.rod(false);
    const dialogStatus = _.rod(null);
    const generate = async (close) => {
        const value = prompt.value.trim();
        if (value.length < 3) {
            dialogStatus.value = { type: 'warning', message: 'Describe the cover image you want to generate.' };
            return;
        }
        generating.value = true;
        dialogStatus.value = null;
        try {
            const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/design-assets/generate`, { prompt: value }, { timeout: 240000, retry: { attempts: 0 } });
            const asset = dataOf(payload).asset;
            assets.value = [asset, ...assets.value];
            status.value = { type: 'success', message: 'Generated image added to the design library.' };
            close();
        } catch (error) {
            dialogStatus.value = { type: 'danger', message: error.message || 'Unable to generate the image.' };
        } finally {
            generating.value = false;
        }
    };

    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.h3('Generate cover image'), _.span({ class: 'text-muted' }, 'Describe the artwork. A portrait PNG is generated and saved to this book library.')),
        content: ({ close }) => _.div({ class: 'at-bookDesignGenerateDialog' },
            _.Textarea({ label: 'Image prompt', model: prompt, rows: 6, placeholder: 'Example: A moody illustrated landscape of misty Italian hills at dusk, deep blue and gold palette, cinematic composition, no text or lettering.' }),
            _.small({ class: 'at-bookDesignGenerateNote' }, 'The generated image uses the managed OpenAI image service and can be selected as the cover afterwards.'),
            () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-bookDesignDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'auto_awesome', loading: generating, onClick: () => generate(close) }, 'Generate image')),
        ),
    } }).open();
}

async function useCover(bookKey, asset) {
    try {
        const payload = await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/design-assets/${encodeURIComponent(asset.id)}/use-cover`, {});
        designBook.value = { ...designBook.value, cover_img: dataOf(payload).cover_img };
        status.value = { type: 'success', message: 'Book cover updated.' };
    } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to update the cover.' }; }
}

async function removeAsset(bookKey, asset) {
    if (!window.confirm(`Delete “${asset.name}” from this book library?`)) return;
    try {
        await _.http.delJSON(`/dashboard/api/books/${encodeURIComponent(bookKey)}/design-assets/${encodeURIComponent(asset.id)}`);
        assets.value = assets.value.filter((item) => item.id !== asset.id);
    } catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to delete this image.' }; }
}

export default function bookDesign(ctx) {
    const bookKey = keyBook(ctx);
    loadDesign(bookKey);
    window.AudiobookTools?.setPageHeaderActions?.([bookPanelButton(bookKey)]);

    return _.main({ class: 'at-bookDesignPage' },
        _.section({ class: 'at-bookDesignHeader' }, _.div(_.span('Design studio'), _.h2(() => designBook.value?.name || 'Book design'), _.p('Set the final cover format and keep every visual asset ready for your editions.'))),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-bookDesignLoading' }, 'Loading design workspace…') : _.div({ class: 'at-bookDesignGrid' },
            _.section({ class: 'at-bookDesignLibrary' },
                _.div({ class: 'at-bookDesignSectionHead' }, _.div(_.span('Image library'), _.h3('Cover artwork')), _.div({ class: 'at-bookDesignLibraryActions' }, _.small(() => `${assets.value.length} image${assets.value.length === 1 ? '' : 's'}`), _.Btn({ color: 'secondary', icon: 'auto_awesome', onClick: () => openGenerateImageDialog(bookKey) }, 'Generate image'), _.Btn({ color: 'primary', icon: 'upload_file', loading: uploading, onClick: () => document.querySelector('#book-design-upload')?.click() }, 'Upload image'))),
                _.input({ id: 'book-design-upload', type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onchange: (event) => uploadAsset(bookKey, event) }),
                () => assets.value.length ? _.div({ class: 'at-bookDesignAssetGrid' }, assets.value.map((asset) => _.article({ class: () => `at-bookDesignAsset ${designBook.value?.cover_img === asset.image_url ? 'is-cover' : ''}` },
                    _.img({ src: asset.image_url, alt: asset.name }),
                    _.div({ class: 'at-bookDesignAssetMeta' }, _.strong(asset.name), _.small(asset.width && asset.height ? `${asset.width} × ${asset.height}px` : 'Image')),
                    _.div({ class: 'at-bookDesignAssetActions' }, designBook.value?.cover_img === asset.image_url ? _.span('Current cover') : _.Btn({ dense: true, color: 'primary', onClick: () => useCover(bookKey, asset) }, 'Use as cover'), _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Delete image', onClick: () => removeAsset(bookKey, asset) })),
                ))) : _.div({ class: 'at-bookDesignLibraryEmpty' }, _.Icon({ name: 'collections' }), _.strong('Your image library is empty'), _.span('Generate or upload a cover image to start your design library.')),
            ),
            _.section({ class: 'at-bookDesignCover' },
                _.div({ class: 'at-bookDesignSectionHead' }, _.div(_.span('Book cover'), _.h3('Format & current artwork'))),
                _.div({ class: 'at-bookDesignCoverStage' }, () => currentCover()
                    ? _.img({ src: currentCover().image_url, alt: `Cover of ${designBook.value?.name || 'book'}` })
                    : _.div({ class: 'at-bookDesignCoverEmpty' }, _.Icon({ name: 'image' }), _.span('Choose an image from the library'))),
                _.div({ class: 'at-bookDesignFormat' },
                    _.Select({ label: 'Trim size', model: format, options: formatOptions, onChange: selectFormat }),
                    _.Input({ label: 'Width', type: 'number', suffix: 'mm', min: 50, max: 500, disabled: () => format.value !== 'custom', model: widthMm }),
                    _.Input({ label: 'Height', type: 'number', suffix: 'mm', min: 50, max: 700, disabled: () => format.value !== 'custom', model: heightMm }),
                    _.Btn({ color: 'secondary', icon: 'save', loading: saving, onClick: () => saveFormat(bookKey) }, 'Save format'),
                ),
            ),
        ),
    );
}
