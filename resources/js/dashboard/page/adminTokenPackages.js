import '../../../css/adminTokenPackages.css';

const packages = _.rod([]);
const loading = _.rod(true);
const status = _.rod(null);
const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const formatCredits = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatPrice = (cents, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(Number(cents || 0) / 100);

async function load() {
    loading.value = true;
    try { packages.value = dataOf(await _.http.getJSON('/dashboard/api/admin/token-packages')).packages || []; }
    catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load token packages.') }; }
    finally { loading.value = false; }
}

function packageDialog(existing = null) {
    const name = _.rod(existing?.name || '');
    const description = _.rod(existing?.description || '');
    const price = _.rod(existing ? String(Number(existing.price_cents || 0) / 100) : '');
    const credits = _.rod(existing ? String(existing.credits || 0) : '');
    const active = _.rod(existing ? Boolean(existing.is_active) : true);
    const saving = _.rod(false);
    const dialogStatus = _.rod(null);
    const save = async (close) => {
        if (saving.value) return;
        saving.value = true; dialogStatus.value = null;
        try {
            const body = { name: name.value.trim(), description: description.value.trim() || null, price_cents: Math.round(Number(price.value) * 100), currency: existing?.currency || 'EUR', credits: Number(credits.value), is_active: active.value };
            if (existing) await _.http.patchJSON(`/dashboard/api/admin/token-packages/${existing.id}`, body); else await _.http.postJSON('/dashboard/api/admin/token-packages', body);
            await load(); status.value = { type: 'success', message: existing ? `${name.value.trim()} package saved.` : `${name.value.trim()} package added.` }; close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: errorMessage(error, 'Check the package details before saving.') }; }
        finally { saving.value = false; }
    };
    _.Dialog({ size: 'md', stickyActions: true, slots: {
        header: _.div(_.span('Token package'), _.h3(existing ? `Edit ${existing.name}` : 'Add token package'), _.p('The price and tokens will be used only when a verified top-up checkout is connected.')),
        content: ({ close }) => _.div({ class: 'at-tokenPackageDialog' },
            _.Input({ label: 'Package name', model: name, required: true }), _.Textarea({ label: 'Description', rows: 2, model: description }),
            _.div({ class: 'at-tokenPackageFields' }, _.Input({ label: 'Price', type: 'number', min: 0, step: '.01', prefix: '€', model: price }), _.Input({ label: 'Tokens', type: 'number', min: 1, step: 1, model: credits })),
            _.Checkbox({ label: 'Package available for purchase', model: active }), () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
            _.div({ class: 'at-tokenPackageActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: existing ? 'save' : 'add', loading: saving, onClick: () => save(close) }, existing ? 'Save package' : 'Add package')),
        ),
    } }).open();
}

function removePackage(item) {
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.span('Remove token package'), _.h3(`Remove ${item.name}?`), _.p('It will no longer be offered for new top-up purchases. Past payment records will remain intact when checkout is introduced.')),
        content: ({ close }) => _.div({ class: 'at-tokenPackageConfirm' }, _.div({ class: 'at-tokenPackageActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'danger', icon: 'delete', onClick: async () => { try { await _.http.del(`/dashboard/api/admin/token-packages/${item.id}`); await load(); status.value = { type: 'success', message: `${item.name} package removed.` }; } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to remove this package.') }; } finally { close(); } } }, 'Remove package'))),
    } }).open();
}

export default function adminTokenPackagesPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    return _.main({ class: 'at-tokenPackagesPage' },
        _.section({ class: 'at-tokenPackagesHero' }, _.div(_.span('Administration'), _.h2('Token packages'), _.p('Manage one-time token top-ups separately from monthly subscriptions.')), _.Btn({ color: 'primary', icon: 'add', onClick: () => packageDialog() }, 'Add package')),
        () => status.value ? _.Alert(status.value) : null,
        _.section({ class: 'at-tokenPackagesNotice' }, _.Icon({ name: 'info' }), _.span('This catalog is already shown in My tokens. Payment, invoice creation and token crediting will only happen after a verified checkout is connected.')),
        () => loading.value ? _.div({ class: 'at-tokenPackagesLoading' }, 'Loading token packages…') : _.section({ class: 'at-tokenPackagesCard' }, _.Table({ rows: () => packages.value, rowKey: 'id', pageSize: 50, pageSizeOptions: [50], hideFooter: true, emptyText: 'No token packages are configured.', columns: [
            { key: 'name', label: 'Package', render: (item) => _.div({ class: 'at-tokenPackageName' }, _.strong(item.name), _.small(item.package_key)) },
            { key: 'description', label: 'Description', render: (item) => _.span(item.description || '—') },
            { key: 'price', label: 'Price', render: (item) => _.span(formatPrice(item.price_cents, item.currency)) },
            { key: 'credits', label: 'Tokens', render: (item) => _.span(formatCredits(item.credits)) },
            { key: 'status', label: 'Status', render: (item) => _.span({ class: `at-tokenPackageStatus ${item.is_active ? '' : 'is-inactive'}` }, item.is_active ? 'Active' : 'Inactive') },
        ], actionsLabel: 'Actions', actions: (item) => _.div({ class: 'at-tokenPackageActions' }, _.Btn({ dense: true, color: 'secondary', size: 'sm', icon: 'edit', onClick: () => packageDialog(item) }, 'Edit'), _.Btn({ dense: true, color: 'danger', size: 'sm', icon: 'delete', onClick: () => removePackage(item) }, 'Remove')) })),
    );
}
