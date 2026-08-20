<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class BookActivityDailyMetric extends Model { protected $fillable=['book_id','provider_key','metric_date','plays','listeners','completions','shares','listening_seconds','revenue_cents']; protected function casts(): array { return ['metric_date'=>'date']; } public function book(): BelongsTo { return $this->belongsTo(Book::class); } }
