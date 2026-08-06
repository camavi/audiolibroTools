<?php

namespace App\Exceptions;

use RuntimeException;

class BookBlockVersionConflictException extends RuntimeException
{
    public function __construct(
        public readonly int $expectedVersionId,
        public readonly ?int $currentVersionId,
        public readonly ?string $blockUuid = null,
    ) {
        parent::__construct('The block was changed before this save request.');
    }
}
