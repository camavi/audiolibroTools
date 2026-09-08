<?php

namespace App\Services;

use App\Models\Book;
use Illuminate\Http\Request;

class PublicBookAccessService
{
    public function allows(Book $book, Request $request): bool
    {
        if ($book->public_access === 'public') {
            return true;
        }

        return $book->public_access === 'invite'
            && filled($book->public_share_token)
            && hash_equals($book->public_share_token, (string) $request->query('access'));
    }

    public function query(Book $book): array
    {
        return $book->public_access === 'invite' && filled($book->public_share_token)
            ? ['access' => $book->public_share_token]
            : [];
    }
}
