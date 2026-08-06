


const indexView = _.rod(false);
const commandView = _.rod(false);
function indexBook() {
    return _.div({
        class: () => !indexView.value ? 'at-indexBook cms-d-none' : 'at-indexBook', area: 'indexBook'
    }, 'Index Book');
}
function content() {
    return _.div({ class: 'at-content', area: 'content' },
        _.div({ class: 'at-topBar' },
            _.Button({ onclick: () => indexView.value = !indexView.value, icon: 'menu' }),
            _.div({ class: 'at-topBar-title' }, 'Content'),
            _.Button({ onclick: () => commandView.value = !commandView.value, icon: 'auto_awesome' })
        ),
    );
}
function navCommand() {
    return _.div({ class: () => !commandView.value ? 'at-navCommand cms-d-none' : 'at-navCommand', area: 'navCommand' }, 'Nav Command');
}
function bottomBar() {
    return _.div({ class: 'at-bottomBar', area: 'bottomBar' }, 'Bottom Bar');
}
export default function bookEditor() {

    return _.div({
        class: 'at-page-bookEditor',
    }, _.div({ class: 'at-content-editor' },
        indexBook(), content(), navCommand()
    ), bottomBar());
}
