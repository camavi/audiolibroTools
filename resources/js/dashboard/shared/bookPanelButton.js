export const BOOK_PANEL_ICON = 'dashboard';

/** Standard navigation action for returning to a book workspace. */
export function bookPanelButton(keyBook) {
    return _.Btn({
        color: 'secondary',
        icon: BOOK_PANEL_ICON,
        onClick: () => _.router.navigate(`/dashboard/book/${keyBook}/panel`),
    }, 'Book panel');
}
