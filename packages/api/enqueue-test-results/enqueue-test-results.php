
<?php
function main(array $event, object $context): array
{
    return ["body" => ["event" => $event, "context" => $context]];
}
