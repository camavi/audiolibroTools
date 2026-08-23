<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'role', 'account_status', 'restriction_reason', 'restricted_at', 'restricted_by', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'restricted_at' => 'datetime',
        ];
    }

    public function supportTickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'account_id');
    }

    public function assignedSupportTickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'assigned_to');
    }

    public function isStaff(): bool
    {
        return in_array($this->role, ['support', 'admin'], true);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isRestricted(): bool
    {
        return in_array($this->account_status, ['suspended', 'blocked'], true);
    }

    public function isBlocked(): bool
    {
        return $this->account_status === 'blocked';
    }

    public function isSuspended(): bool
    {
        return $this->account_status === 'suspended';
    }
}
