<?php

namespace App\Notifications;

use App\Models\BookAudioPublication;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AudioReleaseRendered extends Notification
{
    use Queueable;

    public function __construct(
        private readonly BookAudioPublication $release,
        private readonly string $bookName,
        private readonly bool $successful,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $version = "v{$this->release->version_number}";
        $url = url("/dashboard/book/{$this->release->book->key_book}/audiobook/edit");

        if ($this->successful) {
            return (new MailMessage)
                ->subject("Audiobook release {$version} is ready")
                ->greeting("Your audiobook release is ready")
                ->line("{$this->bookName} · {$version} has finished rendering.")
                ->line('Voice, Music and FX masters are available from Audiobook releases.')
                ->action('Open audiobook releases', $url);
        }

        return (new MailMessage)
            ->subject("Audiobook release {$version} needs attention")
            ->greeting('Audiobook release failed')
            ->line("{$this->bookName} · {$version} could not finish rendering.")
            ->line($this->release->failure_message ?: 'Open Audiobook releases to review the error and retry it.')
            ->action('Open audiobook releases', $url);
    }
}
