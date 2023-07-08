<?php

namespace Symfony\Component\Messenger;

final class Envelope
{
    private array $stamps = [];
    private object $message;

    public function __construct(object $message, array $stamps = [])
    {
        $this->message = $message;

        foreach ($stamps as $stamp) {
            $this->stamps[$stamp::class][] = $stamp;
        }
    }
}
