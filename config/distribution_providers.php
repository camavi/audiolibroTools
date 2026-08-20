<?php

return collect([
    ['key' => 'amazon_kdp', 'name' => 'Amazon KDP', 'types' => ['ebook', 'print'], 'connection' => 'manual', 'note' => 'KDP does not provide a self-service publishing API. Export files and publish in KDP.'],
    ['key' => 'draft2digital', 'name' => 'Draft2Digital', 'types' => ['ebook', 'print'], 'connection' => 'api', 'note' => 'Aggregator connection for bookstore distribution.'],
    ['key' => 'infrastructure', 'name' => 'IngramSpark', 'types' => ['print'], 'connection' => 'api', 'note' => 'Global print-on-demand and bookstore distribution.'],
    ['key' => 'apple_books', 'name' => 'Apple Books', 'types' => ['ebook', 'audiobook'], 'connection' => 'api', 'note' => 'Direct publishing for Apple readers and listeners.'],
    ['key' => 'google_play_books', 'name' => 'Google Play Books', 'types' => ['ebook', 'audiobook'], 'connection' => 'api', 'note' => 'Google Play Partner API integration.'],
    ['key' => 'kobo_writing_life', 'name' => 'Kobo Writing Life', 'types' => ['ebook'], 'connection' => 'manual', 'note' => 'Direct Kobo upload and sales reporting.'],
    ['key' => 'barnes_noble_press', 'name' => 'Barnes & Noble Press', 'types' => ['ebook', 'print'], 'connection' => 'manual', 'note' => 'Direct NOOK and print publishing.'],
    ['key' => 'streetlib', 'name' => 'StreetLib', 'types' => ['ebook', 'audiobook', 'print'], 'connection' => 'api', 'note' => 'International distribution and library channels.'],
    ['key' => 'publishdrive', 'name' => 'PublishDrive', 'types' => ['ebook', 'audiobook'], 'connection' => 'api', 'note' => 'Global publishing aggregator.'],
    ['key' => 'smashwords', 'name' => 'Smashwords', 'types' => ['ebook'], 'connection' => 'manual', 'note' => 'Independent eBook distribution.'],
    ['key' => 'findaway_voices', 'name' => 'Findaway Voices', 'types' => ['audiobook'], 'connection' => 'api', 'note' => 'Wide audiobook distribution, including libraries.'],
    ['key' => 'acx', 'name' => 'ACX', 'types' => ['audiobook'], 'connection' => 'manual', 'note' => 'Audible, Amazon and Apple audiobook marketplace.'],
    ['key' => 'spotify_for_authors', 'name' => 'Spotify for Authors', 'types' => ['audiobook'], 'connection' => 'manual', 'note' => 'Formerly Findaway publishing workflow for Spotify.'],
    ['key' => 'author_republic', 'name' => 'Author’s Republic', 'types' => ['audiobook'], 'connection' => 'api', 'note' => 'Audiobook distribution to global retail and library channels.'],
    ['key' => 'soundwise', 'name' => 'Soundwise', 'types' => ['audiobook'], 'connection' => 'manual', 'note' => 'Direct-sale audiobook storefront.'],
    ['key' => 'library_bound', 'name' => 'Library channels', 'types' => ['ebook', 'audiobook'], 'connection' => 'aggregator', 'note' => 'OverDrive, Hoopla, Bibliotheca and other library partners.'],
])->map(fn (array $provider) => [...$provider, 'connection_mode' => $provider['connection']])->all();
