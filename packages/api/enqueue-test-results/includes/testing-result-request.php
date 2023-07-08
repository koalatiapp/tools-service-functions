<?php

namespace App\Message;

class TestingResultRequest
{
    public function __construct(
        private readonly array $payload,
    ) {
    }
}
