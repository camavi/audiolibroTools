<?php
namespace App\Models;use Illuminate\Database\Eloquent\Model;use Illuminate\Database\Eloquent\Relations\BelongsTo;
class BookCollaborationInvite extends Model{protected $fillable=['book_id','owner_id','invited_user_id','email','permissions','status','accepted_at','declined_at'];protected function casts():array{return ['permissions'=>'array','accepted_at'=>'datetime','declined_at'=>'datetime'];}public function book():BelongsTo{return $this->belongsTo(Book::class);}public function owner():BelongsTo{return $this->belongsTo(User::class,'owner_id');}}
