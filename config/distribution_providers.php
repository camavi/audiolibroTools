<?php

return [
    ['key' => 'amazon_kdp', 'name' => 'Amazon KDP', 'types' => ['ebook', 'print'], 'integration' => 'manual_only', 'note' => 'Prepare a package, then upload and publish from your KDP account.'],
    ['key' => 'draft2digital', 'name' => 'Draft2Digital', 'types' => ['ebook', 'print'], 'integration' => 'delegated_portal', 'note' => 'Use Draft2Digital Account Sharing to invite a separate, revocable AT collaborator account.'],
    ['key' => 'infrastructure', 'name' => 'IngramSpark', 'types' => ['print'], 'integration' => 'manual_only', 'note' => 'Prepare the print package, then complete upload and approval in IngramSpark.'],
    ['key' => 'apple_books', 'name' => 'Apple Books', 'types' => ['ebook', 'audiobook'], 'integration' => 'manual_only', 'note' => 'The customer retains the Apple account, agreements, tax and payout details.'],
    ['key' => 'google_play_books', 'name' => 'Google Play Books', 'types' => ['ebook', 'audiobook'], 'integration' => 'file_feed', 'note' => 'Automated content feeds require official Google setup and publisher consent.'],
    ['key' => 'kobo_writing_life', 'name' => 'Kobo Writing Life', 'types' => ['ebook'], 'integration' => 'manual_only', 'note' => 'Prepare the package, then upload it from the Kobo Writing Life portal.'],
    ['key' => 'barnes_noble_press', 'name' => 'Barnes & Noble Press', 'types' => ['ebook', 'print'], 'integration' => 'delegated_portal', 'note' => 'The customer may invite a revocable contributor; AT never uses a customer password.'],
    ['key' => 'streetlib', 'name' => 'StreetLib', 'types' => ['ebook', 'audiobook', 'print'], 'integration' => 'partnership_api', 'note' => 'The Partners API is available only through a publishing-organization partnership.'],
    ['key' => 'publishdrive', 'name' => 'PublishDrive', 'types' => ['ebook', 'audiobook'], 'integration' => 'partnership_api', 'note' => 'Automation requires a commercial partnership; it is not an open self-service connection.'],
    ['key' => 'smashwords', 'name' => 'Smashwords', 'types' => ['ebook'], 'integration' => 'manual_only', 'note' => 'Prepare the eBook package, then complete distribution in the provider portal.'],
    ['key' => 'findaway_voices', 'name' => 'Findaway Voices', 'types' => ['audiobook'], 'integration' => 'partnership_api', 'note' => 'Keep this channel pending until an official partner integration is approved.'],
    ['key' => 'acx', 'name' => 'ACX', 'types' => ['audiobook'], 'integration' => 'manual_only', 'note' => 'AT prepares masters; the rights holder completes agreements and upload in ACX.'],
    ['key' => 'spotify_for_authors', 'name' => 'Spotify for Authors', 'types' => ['audiobook'], 'integration' => 'manual_only', 'note' => 'Prepare the audiobook package, then publish from Spotify for Authors.'],
    ['key' => 'author_republic', 'name' => 'Author’s Republic', 'types' => ['audiobook'], 'integration' => 'partnership_api', 'note' => 'Keep this channel pending until an official partner integration is approved.'],
    ['key' => 'soundwise', 'name' => 'Soundwise', 'types' => ['audiobook'], 'integration' => 'manual_only', 'note' => 'Prepare the audiobook package, then complete direct-sale setup in the provider portal.'],
    ['key' => 'library_bound', 'name' => 'Library channels', 'types' => ['ebook', 'audiobook'], 'integration' => 'partnership_api', 'note' => 'Library delivery is available through an approved aggregator or direct partner agreement.'],
];
