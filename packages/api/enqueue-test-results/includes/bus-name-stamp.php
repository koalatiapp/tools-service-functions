<?php

namespace Symfony\Component\Messenger\Stamp;

final class BusNameStamp
{
    private string $busName;

    public function __construct(string $busName)
    {
        $this->busName = $busName;
    }
}
