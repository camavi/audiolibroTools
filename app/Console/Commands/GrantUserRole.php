<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class GrantUserRole extends Command
{
    protected $signature = 'audiobook:grant-role {email : Email of the account} {role : user, support or admin}';

    protected $description = 'Grant a dashboard role to an existing user account';

    public function handle(): int
    {
        $role = strtolower((string) $this->argument('role'));
        if (! in_array($role, ['user', 'support', 'admin'], true)) {
            $this->error('Role must be user, support, or admin.');

            return self::FAILURE;
        }
        $email = strtolower(trim((string) $this->argument('email')));
        $user = User::query()->whereRaw('lower(email) = ?', [$email])->first();
        if (! $user) {
            $this->error("No user found for {$email}.");

            return self::FAILURE;
        }
        $user->update(['role' => $role]);
        $this->info("{$user->email} is now {$role}.");

        return self::SUCCESS;
    }
}
