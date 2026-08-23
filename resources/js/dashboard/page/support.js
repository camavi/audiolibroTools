import '../../../css/support.css';

const profile = _.rod(null); const tickets = _.rod([]); const users = _.rod([]); const usersPage = _.rod(1); const usersLastPage = _.rod(1); const usersTotal = _.rod(0); const userSearch = _.rod(''); const loading = _.rod(true); const usersLoading = _.rod(false); const status = _.rod(null); const tab = _.rod('mine');
const dataOf = (payload) => payload?.data?.data || payload?.data || payload || {};
const errorMessage = (error, fallback) => error?.data?.message || error?.message || fallback;
const isStaff = () => ['support', 'admin'].includes(profile.value?.user?.role);
const isAdmin = () => profile.value?.user?.role === 'admin';
const isAdministration = () => window.location.pathname.startsWith('/dashboard/admin');
const isUsersAdministration = () => window.location.pathname === '/dashboard/admin/users';

async function load() {
    loading.value = true; status.value = null;
    try {
        profile.value = dataOf(await _.http.getJSON('/dashboard/api/profile'));
        if (!isUsersAdministration()) await loadTickets();
        if (isAdmin() && isUsersAdministration()) await loadUsers(true);
    } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load support.') }; }
    finally { loading.value = false; }
}
async function loadTickets() {
    const endpoint = isStaff() && (tab.value === 'staff' || isAdministration()) ? '/dashboard/api/admin/tickets' : '/dashboard/api/support/tickets';
    const data = dataOf(await _.http.getJSON(endpoint)); tickets.value = data.tickets || [];
}
async function loadUsers(reset = false) { if (reset) usersPage.value = 1; usersLoading.value = true; try { const query = new URLSearchParams({ page: String(usersPage.value) }); if (userSearch.value.trim()) query.set('search', userSearch.value.trim()); const data = dataOf(await _.http.getJSON(`/dashboard/api/admin/users?${query}`)); users.value = data.users || []; usersLastPage.value = data.pagination?.last_page || 1; usersTotal.value = data.pagination?.total || 0; } finally { usersLoading.value = false; } }
async function goUserPage(page) { if (page < 1 || page > usersLastPage.value || page === usersPage.value) return; usersPage.value = page; try { await loadUsers(); } catch (error) { status.value = { type: 'danger', message: errorMessage(error, 'Unable to load users.') }; } }
let userSearchTimer = null;
function searchUsers() { clearTimeout(userSearchTimer); userSearchTimer = setTimeout(() => loadUsers(true).catch((error) => { status.value = { type: 'danger', message: errorMessage(error, 'Unable to search users.') }; }), 250); }
function createTicket() {
    const subject = _.rod(''), category = _.rod('general'), message = _.rod(''), saving = _.rod(false), note = _.rod(null);
    const save = async (close) => { if (!subject.value.trim() || !message.value.trim()) { note.value = { type: 'warning', message: 'Enter a subject and a message.' }; return; } saving.value = true; try { await _.http.postJSON('/dashboard/api/support/tickets', { subject: subject.value.trim(), category: category.value, message: message.value.trim() }); close(); await loadTickets(); status.value = { type: 'success', message: 'Your request was sent to support.' }; } catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to create the request.') }; } finally { saving.value = false; } };
    _.Dialog({ size: 'md', stickyActions: true, slots: { header: _.div(_.span('Support request'), _.h3('How can we help?'), _.p('Do not include passwords, API keys, or payment-card data.')), content: ({ close }) => _.div({ class: 'at-supportDialog' }, _.Input({ label: 'Subject', model: subject, placeholder: 'Briefly describe the problem' }), _.Select({ label: 'Area', model: category, options: [{ value: 'general', label: 'General' }, { value: 'account', label: 'Account' }, { value: 'technical', label: 'Technical' }, { value: 'book', label: 'Book' }, { value: 'audio', label: 'Audio' }, { value: 'billing', label: 'Billing' }] }), _.Textarea({ label: 'Message', model: message, rows: 7, placeholder: 'Tell us what happened and the steps to reproduce it.' }), () => note.value ? _.Alert(note.value) : null, _.div({ class: 'at-supportActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', icon: 'send', loading: saving, onClick: () => save(close) }, 'Send request'))) } }).open();
}
function ticketDialog(ticket, staff = false) {
    const detail = _.rod(null), reply = _.rod(''), internal = _.rod(false), saving = _.rod(false), note = _.rod(null), ticketStatus = _.rod(ticket.status);
    const endpoint = staff ? `/dashboard/api/admin/tickets/${ticket.id}` : `/dashboard/api/support/tickets/${ticket.id}`;
    const fetchDetail = async () => { try { detail.value = dataOf(await _.http.getJSON(endpoint)).ticket; } catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to open the ticket.') }; } };
    const send = async () => { if (!reply.value.trim()) return; saving.value = true; try { const messageEndpoint = staff ? `/dashboard/api/admin/tickets/${ticket.id}/messages` : `/dashboard/api/support/tickets/${ticket.id}/messages`; await _.http.postJSON(messageEndpoint, { message: reply.value.trim(), ...(staff ? { is_internal: internal.value } : {}) }); reply.value = ''; await fetchDetail(); await loadTickets(); } catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to send the reply.') }; } finally { saving.value = false; } };
    const update = async () => { saving.value = true; try { await _.http.patchJSON(`/dashboard/api/admin/tickets/${ticket.id}`, { status: ticketStatus.value }); await fetchDetail(); await loadTickets(); } catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to update status.') }; } finally { saving.value = false; } };
    _.Dialog({ size: 'lg', stickyActions: true, slots: { header: _.div(_.span(staff ? 'Support desk' : 'Your request'), _.h3(ticket.subject), _.p(() => `#${ticket.id} · ${detail.value?.status || ticket.status}`)), content: ({ close }) => { fetchDetail(); return _.div({ class: 'at-supportDialog' }, () => detail.value ? _.div({ class: 'at-supportThread' }, ...(detail.value.messages || []).map((message) => _.article({ class: message.is_internal ? 'is-internal' : '' }, _.strong(message.author_name), _.small(new Date(message.created_at).toLocaleString()), _.p(message.body)))) : _.p('Loading conversation…'), staff ? _.div({ class: 'at-supportStatus' }, _.Select({ label: 'Ticket status', model: ticketStatus, options: ['open', 'pending', 'resolved', 'closed'].map((value) => ({ value, label: value })) }), _.Btn({ color: 'secondary', loading: saving, onClick: update }, 'Update')) : null, _.Textarea({ label: staff ? 'Reply' : 'Add a message', model: reply, rows: 4 }), staff ? _.Checkbox({ label: 'Internal note (customer cannot see it)', model: internal }) : null, () => note.value ? _.Alert(note.value) : null, _.div({ class: 'at-supportActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Close'), _.Btn({ color: 'primary', icon: 'send', loading: saving, onClick: send }, 'Send'))) } } }).open();
}
function ticketRow(ticket, staff) { return _.button({ class: 'at-supportTicket', type: 'button', onClick: () => ticketDialog(ticket, staff) }, _.div(_.strong(ticket.subject), _.small(staff && ticket.account ? `${ticket.account.name} · ${ticket.account.email}` : ticket.category)), _.div({ class: 'at-supportTicketMeta' }, _.span({ class: `is-${ticket.status}` }, ticket.status), _.small(new Date(ticket.updated_at).toLocaleDateString()))); }

function bookModerationDialog(user, book) {
    const moderationStatus = _.rod(book.moderation_status), reason = _.rod(book.moderation_reason || ''), saving = _.rod(false), note = _.rod(null);
    const save = async (close) => {
        saving.value = true; note.value = null;
        try { await _.http.request(`/dashboard/api/admin/users/${user.id}/books/${book.id}/moderation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moderation_status: moderationStatus.value, reason: reason.value }) }); close(); }
        catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to update book moderation.') }; }
        finally { saving.value = false; }
    };
    _.Dialog({ size: 'md', stickyActions: true, slots: { header: _.div(_.span('Book moderation'), _.h3(book.name), _.p('Suspension requires a clear reason and is recorded in the audit log.')), content: ({ close }) => _.div({ class: 'at-supportDialog' }, _.Select({ label: 'Book status', model: moderationStatus, options: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }] }), _.Textarea({ label: 'Reason', model: reason, rows: 3, placeholder: 'Required when suspending a book' }), () => note.value ? _.Alert(note.value) : null, _.div({ class: 'at-supportActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'danger', loading: saving, onClick: () => save(close) }, 'Save moderation'))) } }).open();
}

function userDialog(user) {
    const detail = _.rod(null), note = _.rod(null);
    const loadDetail = async () => {
        try { detail.value = dataOf(await _.http.getJSON(`/dashboard/api/admin/users/${user.id}`)); }
        catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to load this account.') }; }
    };
    _.Dialog({
        size: 'lg', stickyActions: true, slots: {
            header: _.div(_.span('User details'), _.h3(user.name), _.p(user.email)), content: () => {
                loadDetail(); return _.div({ class: 'at-supportDialog' },
                    () => detail.value ? _.div({ class: 'at-userDetail' },
                        _.section(_.span('Account'), _.p(`Role: ${detail.value.user.role}`), _.p(`Status: ${detail.value.user.account_status}`), detail.value.user.restriction_reason ? _.p(`Restriction reason: ${detail.value.user.restriction_reason}`) : null),
                        _.section(_.span('Credits'), _.p(`Available: ${detail.value.credits?.available || 0}`), _.p(`Reserved: ${detail.value.credits?.reserved || 0}`), _.p(`Consumed: ${detail.value.credits?.consumed || 0}`)),
                        _.section(_.span('Books'), (detail.value.books || []).length ? _.div({ class: 'at-supportUsers' }, ...detail.value.books.map((book) => _.div(_.strong(book.name), _.small(book.moderation_status)))) : _.p('No books.')),
                        _.section(_.span('Diagnostics'), (detail.value.failures || []).length ? _.div(...detail.value.failures.map((failure) => _.p(`#${failure.book_id}: ${failure.error_message || 'Failed job'}`))) : _.p('No recent failed jobs.')),
                        _.section(_.span('Recent support tickets'), (detail.value.tickets || []).length ? _.div({ class: 'at-supportTickets' }, ...detail.value.tickets.map((ticket) => ticketRow(ticket, true))) : _.p('No support tickets for this account.')),
                    ) : _.p('Loading account…'),
                    () => note.value ? _.Alert(note.value) : null,
                );
            }, actions: ({ close }) => _.Btn({ color: 'secondary', onClick: close }, 'Close')
        }
    }).open();
}

function actionDialog(user, action) {
    const saving = _.rod(false), note = _.rod(null), statusModel = _.rod(user.account_status || 'active'), reason = _.rod(''), roleModel = _.rod(user.role), credits = _.rod(''), message = _.rod('');
    const config = {
        status: { title: 'Account access', icon: 'block', color: 'danger', endpoint: `/dashboard/api/admin/users/${user.id}/status`, method: 'PATCH', submit: () => ({ account_status: statusModel.value, reason: reason.value }), button: 'Save account status' },
        role: { title: 'Access role', icon: 'admin_panel_settings', color: 'primary', endpoint: `/dashboard/api/admin/users/${user.id}`, method: 'PATCH', submit: () => ({ role: roleModel.value }), button: 'Save role' },
        credits: { title: 'Adjust credits', icon: 'token', color: 'secondary', endpoint: `/dashboard/api/admin/users/${user.id}/credits`, method: 'POST', submit: () => ({ credits: Number(credits.value), reason: reason.value }), button: 'Apply adjustment' },
        copyright: { title: 'Copyright notice', icon: 'gavel', color: 'warning', endpoint: `/dashboard/api/admin/users/${user.id}/copyright-notices`, method: 'POST', submit: () => ({ message: message.value }), button: 'Send notice' },
        reset: { title: 'Send password reset', icon: 'lock_reset', color: 'secondary', endpoint: `/dashboard/api/admin/users/${user.id}/password-reset`, method: 'POST', submit: () => null, button: 'Send reset email' },
    }[action];
    const submit = async (close) => {
        saving.value = true; note.value = null;
        try { await _.http.request(config.endpoint, { method: config.method, headers: { 'Content-Type': 'application/json' }, body: config.submit() ? JSON.stringify(config.submit()) : undefined }); await loadUsers(true); close(); }
        catch (error) { note.value = { type: 'danger', message: errorMessage(error, 'Unable to complete this action.') }; }
        finally { saving.value = false; }
    };
    const fields = () => {
        if (action === 'status') return [_.Select({ label: 'Account status', model: statusModel, options: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended · read only' }, { value: 'blocked', label: 'Blocked · no login' }] }), _.Textarea({ label: 'Reason', model: reason, rows: 3, placeholder: 'Required for a suspension or block' })];
        if (action === 'role') return [_.Select({ label: 'Role', model: roleModel, options: [{ value: 'user', label: 'User' }, { value: 'support', label: 'Support' }, { value: 'admin', label: 'Administrator' }] })];
        if (action === 'credits') return [_.Input({ label: 'Credit adjustment', type: 'number', model: credits, placeholder: 'Use a negative number to remove credits' }), _.Input({ label: 'Reason', model: reason, placeholder: 'Required for the audit log' })];
        if (action === 'copyright') return [_.Textarea({ label: 'Message to user', model: message, rows: 5, placeholder: 'Explain the concern and requested action.' })];
        return [_.p('This sends a secure password-reset link to the user. Their current password will not be displayed or changed by an administrator.')];
    };
    _.Dialog({ size: 'md', stickyActions: true, slots: { header: _.div(_.span('User action'), _.h3(config.title), _.p(`${user.name} · ${user.email}`)), content: ({ close }) => _.div({ class: 'at-supportDialog' }, ...fields(), () => note.value ? _.Alert(note.value) : null, _.div({ class: 'at-supportActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: config.color, icon: config.icon, loading: saving, onClick: () => submit(close) }, config.button))) } }).open();
}

function actionIcon(user, action, icon, label, color = 'secondary') {
    return _.Btn({ dense: true, color, size: 'sm', icon, 'aria-label': label, title: label, onClick: () => actionDialog(user, action) });
}

function usersWorkspace() {
    return _.section({ class: 'at-supportCard at-supportUsersPage' },
        _.div({ class: 'at-supportHead' }, _.h3('All users'), _.small(() => `${usersTotal.value} total`)),
        _.Input({ label: 'Search users', icon: 'search', model: userSearch, placeholder: 'Name or email', onInput: searchUsers }),
        _.Table({
            class: 'at-adminUsersTable',
            rows: () => users.value,
            rowKey: 'id',
            loading: () => usersLoading.value,
            pageSize: 30,
            pageSizeOptions: [30],
            hideFooter: true,
            emptyText: 'No users found.',
            columns: [
                { key: 'mail', label: 'Mail', render: (user) => _.div(_.small(user.email)) },
                { key: 'name', label: 'User', render: (user) => _.div(_.strong(user.name)) },
                { key: 'role', label: 'Role', render: (user) => _.span({ class: `at-adminRole is-${user.role}` }, user.role) },
                { key: 'account_status', label: 'Account status', render: (user) => _.span({ class: `at-adminStatus is-${user.account_status || 'active'}` }, user.account_status || 'active') },
                { key: 'open_tickets_count', label: 'Open tickets' },
            ],
            actionsLabel: 'Actions',
            actions: (user) => _.div({ class: 'at-adminActionButtons' },
                _.Btn({ dense: true, color: 'secondary', size: 'sm', icon: 'visibility', 'aria-label': `View ${user.name}`, title: `View details for ${user.name}`, onClick: () => userDialog(user) }),
                actionIcon(user, 'role', 'admin_panel_settings', 'Change role'),
                actionIcon(user, 'credits', 'token', 'Adjust credits'),
                actionIcon(user, 'reset', 'lock_reset', 'Send password reset'),
                actionIcon(user, 'copyright', 'gavel', 'Send copyright notice', 'warning'),
                actionIcon(user, 'status', 'block', 'Block or suspend account', 'danger'),
            ),
        }),
        () => usersLastPage.value > 1 ? _.div({ class: 'at-supportActions' },
            _.Btn({ color: 'secondary', icon: 'chevron_left', disabled: () => usersPage.value <= 1, onClick: () => goUserPage(usersPage.value - 1) }, 'Previous'),
            _.small(() => `Page ${usersPage.value} of ${usersLastPage.value}`),
            _.Btn({ color: 'secondary', icon: 'chevron_right', disabled: () => usersPage.value >= usersLastPage.value, onClick: () => goUserPage(usersPage.value + 1) }, 'Next'),
        ) : null,
    );
}

function ticketsWorkspace() {
    const administration = isAdministration();
    return _.section({ class: 'at-supportCard at-supportTicketsPage' },
        _.div({ class: 'at-supportHead' },
            _.h3(administration ? 'All support tickets' : (isStaff() ? 'Requests' : 'Your requests')),
            !administration && isStaff() ? _.Select({ model: tab, options: [{ value: 'mine', label: 'My requests' }, { value: 'staff', label: 'Support desk' }], onChange: loadTickets }) : null,
        ),
        () => tickets.value.length
            ? _.div({ class: 'at-supportTickets' }, ...tickets.value.map((ticket) => ticketRow(ticket, isStaff() && (tab.value === 'staff' || administration))))
            : _.p(administration ? 'No support tickets yet.' : 'No requests here yet.'),
    );
}

export default function supportPage() {
    load(); window.AudiobookTools?.setPageHeaderActions?.([]);
    const administration = isAdministration();
    return _.main({ class: 'at-supportPage' },
        _.section({ class: 'at-supportHero' }, _.div(
            _.span(administration ? 'Administration' : 'Help centre'),
            _.h2(administration ? (isUsersAdministration() ? 'All users' : 'Support tickets') : 'Support & assistance'),
            _.p(administration ? (isUsersAdministration() ? 'Browse and manage customer accounts.' : 'Review and resolve every customer support request.') : 'Open a private request and follow the conversation with our team.'),
        ), administration ? null : _.Btn({ color: 'primary', icon: 'add_comment', onClick: createTicket }, 'New request')),
        () => status.value ? _.Alert(status.value) : null,
        () => loading.value ? _.div({ class: 'at-supportLoading' }, 'Loading support…') : administration && !isAdmin()
            ? _.section({ class: 'at-supportCard' }, _.h3('Access restricted'), _.p('This area is available only to administrators.'))
            : isUsersAdministration() ? usersWorkspace() : ticketsWorkspace(),
    );
}
