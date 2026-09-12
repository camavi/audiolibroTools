<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookCorrectionJobFailure extends Model
{
    protected $fillable = [
        'book_correction_job_id',
        'book_id',
        'book_block_id',
        'book_block_version_id',
        'block_uuid',
        'error_message',
        'attempts',
        'last_attempt_at',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'last_attempt_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function job(): BelongsTo
    {
        return $this->belongsTo(BookCorrectionJob::class, 'book_correction_job_id');
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(BookBlock::class, 'book_block_id');
    }

    public function blockVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'book_block_version_id');
    }
}
