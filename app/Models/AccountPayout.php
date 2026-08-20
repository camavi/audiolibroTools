<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class AccountPayout extends Model { protected $fillable=['account_id','amount_cents','currency','status','provider_reference','paid_at']; protected function casts(): array{return ['paid_at'=>'datetime'];} }
