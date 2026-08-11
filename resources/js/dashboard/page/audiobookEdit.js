export default function audiobookEdit() {

    return [
        _.Card({
            icon: 'edit',
            title: 'Audiobook edit',
            subtitle: 'Create a Audiobook.',
            body: _.Grid({ gap: 'lg' },
                'Audiobook edit',
            ),
        }),
    ];
}
