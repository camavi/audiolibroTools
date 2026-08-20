import '../../../css/profile.css';

const profile = _.rod(null);
const loading = _.rod(true);
const savingDetails = _.rod(false);
const pageStatus = _.rod(null);
const name = _.rod('');

function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function errorMessage(error, fallback) { return error?.data?.message || error?.message || fallback; }

async function loadProfile() {
    loading.value = true;
    try {
        const data = dataOf(await _.http.getJSON('/dashboard/api/profile'));
        profile.value = data;
        CMSwift.reactive.untracked(() => { name.value = data.user?.name || ''; });
    } catch (error) {
        pageStatus.value = { type: 'danger', message: errorMessage(error, 'Unable to load your profile.') };
    } finally { loading.value = false; }
}

async function saveDetails() {
    if (savingDetails.value) return;
    if (!name.value.trim()) { pageStatus.value = { type: 'warning', message: 'Name is required.' }; return; }
    savingDetails.value = true; pageStatus.value = null;
    try {
        const data = dataOf(await _.http.patchJSON('/dashboard/api/profile', { name: name.value.trim() }));
        profile.value = { ...profile.value, user: data.user };
        pageStatus.value = { type: 'success', message: 'Profile details saved.' };
    } catch (error) { pageStatus.value = { type: 'danger', message: errorMessage(error, 'Unable to save profile details.') }; }
    finally { savingDetails.value = false; }
}

function openPasswordDialog() {
    const currentPassword = _.rod(''); const password = _.rod(''); const passwordConfirmation = _.rod(''); const saving = _.rod(false); const status = _.rod(null);
    const save = async (close) => {
        if (saving.value) return;
        if (!currentPassword.value || !password.value || !passwordConfirmation.value) { status.value = { type: 'warning', message: 'Complete all password fields.' }; return; }
        saving.value = true; status.value = null;
        try {
            await _.http.putJSON('/dashboard/api/profile/password', { current_password: currentPassword.value, password: password.value, password_confirmation: passwordConfirmation.value });
            pageStatus.value = { type: 'success', message: 'Password updated.' }; close();
        } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to update the password.') }; }
        finally { saving.value = false; }
    };
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div(_.span({ class: 'at-profileEyebrow' }, 'Security'), _.h3('Change password'), _.p('Use at least 8 characters and keep it unique to this account.')),
        content: ({ close }) => _.div({ class: 'at-profileDialog' },
            _.Input({ label: 'Current password', type: 'password', model: currentPassword, autocomplete: 'current-password' }),
            _.Input({ label: 'New password', type: 'password', model: password, autocomplete: 'new-password' }),
            _.Input({ label: 'Confirm new password', type: 'password', model: passwordConfirmation, autocomplete: 'new-password' }),
            () => status.value ? _.Alert(status.value) : null,
            _.div({ class: 'at-profileDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'lock_reset', loading: saving, onClick: () => save(close) }, 'Update password')),
        ),
    } }).open();
}

function openDeleteDialog() {
    const currentPassword = _.rod(''); const confirmation = _.rod(''); const deleting = _.rod(false); const status = _.rod(null);
    const destroy = async () => {
        if (deleting.value) return;
        deleting.value = true; status.value = null;
        try {
            const response = await _.http.request('/dashboard/api/profile', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: currentPassword.value, confirmation: confirmation.value }),
            });
            const data = dataOf(await response.jsonStrict());
            window.location.assign(data.redirect || '/');
        } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to delete the account.') }; deleting.value = false; }
    };
    _.Dialog({ size: 'sm', stickyActions: true, slots: {
        header: _.div({ class: 'at-profileDangerDialogHead' }, _.span({ class: 'at-profileEyebrow' }, 'Danger zone'), _.h3('Delete account permanently'), _.p('This cannot be undone. Your books, generated files, audio library and AI connection data will be deleted.')),
        content: ({ close }) => _.div({ class: 'at-profileDialog' },
            _.Input({ label: 'Current password', type: 'password', model: currentPassword, autocomplete: 'current-password' }),
            _.Input({ label: 'Type DELETE to confirm', model: confirmation, placeholder: 'DELETE' }),
            () => status.value ? _.Alert(status.value) : null,
            _.div({ class: 'at-profileDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Keep my account'), _.Btn({ color: 'danger', icon: 'delete_forever', loading: deleting, onClick: destroy }, 'Delete everything')),
        ),
    } }).open();
}

function summaryItem(icon, value, label) { return _.div({ class: 'at-profileSummaryItem' }, _.Icon({ name: icon }), _.div(_.strong(String(value || 0)), _.span(label))); }

export default function profilePage() {
    loadProfile();
    window.AudiobookTools?.setPageHeaderActions?.([]);

    return _.main({ class: 'at-profilePage' },
        _.section({ class: 'at-profileHero' }, _.div(_.span({ class: 'at-profileEyebrow' }, 'Account'), _.h2('Profile & security'), _.p('Manage your personal details, password and account data.'))),
        () => pageStatus.value ? _.Alert(pageStatus.value) : null,
        () => loading.value ? _.div({ class: 'at-profileLoading' }, 'Loading profile…') : profile.value ? _.div({ class: 'at-profileGrid' },
            _.section({ class: 'at-profileCard at-profileDetails' },
                _.div({ class: 'at-profileCardHead' }, _.div(_.span('Personal details'), _.h3('Your account')), _.Icon({ name: 'person' })),
                _.div({ class: 'at-profileFields' },
                    _.Input({ label: 'Name', model: name, autocomplete: 'name' }),
                    _.div({ class: 'at-profileEmail' }, _.span('Email address'), _.strong(() => profile.value?.user?.email || '—'), _.small('Email changes require a verified security flow.')),
                ),
                _.div({ class: 'at-profileCardActions' }, _.small(() => profile.value?.user?.created_at ? `Member since ${new Date(profile.value.user.created_at).toLocaleDateString()}` : ''), _.Btn({ color: 'primary', icon: 'save', loading: savingDetails, onClick: saveDetails }, 'Save changes')),
            ),
            _.aside({ class: 'at-profileSide' },
                _.section({ class: 'at-profileCard' }, _.div({ class: 'at-profileCardHead' }, _.div(_.span('Security'), _.h3('Password')), _.Icon({ name: 'shield' })), _.p('Change your password at any time. We ask for your current password to keep the account protected.'), _.Btn({ color: 'secondary', icon: 'lock_reset', onClick: openPasswordDialog }, 'Change password')),
                _.section({ class: 'at-profileCard at-profileDataCard' }, _.div({ class: 'at-profileCardHead' }, _.div(_.span('Your workspace'), _.h3('Stored data')), _.Icon({ name: 'inventory_2' })), () => _.div({ class: 'at-profileSummary' }, summaryItem('menu_book', profile.value?.data_summary?.books, 'Books'), summaryItem('record_voice_over', profile.value?.data_summary?.voices, 'Library voices'), summaryItem('music_note', profile.value?.data_summary?.audio_media, 'Audio files'), summaryItem('key', profile.value?.data_summary?.ai_connections, 'AI connections'))),
                _.section({ class: 'at-profileCard at-profileDangerCard' }, _.div({ class: 'at-profileCardHead' }, _.div(_.span('Danger zone'), _.h3('Delete account')), _.Icon({ name: 'warning' })), _.p('Permanently erase this account and all workspace data. This action cannot be reversed.'), _.Btn({ color: 'danger', icon: 'delete_forever', onClick: openDeleteDialog }, 'Delete account')),
            ),
        ) : _.div({ class: 'at-profileEmpty' }, _.Icon({ name: 'lock' }), _.h3('Sign in to manage your profile'), _.p('Your profile is available after you sign in.')),
    );
}
