<?php

use App\Message\TestingResultRequest;
use Symfony\Component\Messenger\Envelope;
use Symfony\Component\Messenger\Stamp\BusNameStamp;

require_once './includes/testing-result-request.php';
require_once './includes/envelope.php';
require_once './includes/bus-name-stamp.php';

function main(array $event): array
{
    $accessToken = getenv('AUTH_ACCESS_TOKEN');

    if ($event['http']['authorization'] != "Bearer {$accessToken}") {
        throw new Error("Unauthorized");
    }

    $payload = json_decode($event['payload'], true, 512, JSON_THROW_ON_ERROR);

    if (!$payload) {
        throw new Exception('An invalid payload was sent to the test results webhook.');
    }

    $testingResultRequest = new TestingResultRequest($payload);
    $envelope = new Envelope($testingResultRequest, [
        new BusNameStamp("messenger.bus.default")
    ]);
    $serializedEnvelope = serialize($envelope);

    $host = getenv('APP_DATABASE_HOST');
    $username = getenv('APP_DATABASE_USERNAME');
    $password = getenv('APP_DATABASE_PASSWORD');
    $database = getenv('APP_DATABASE_NAME');
    $port = getenv('APP_DATABASE_PORT');

    try {
        $connection = new PDO("mysql:host=$host;port=$port;dbname=$database", $username, $password);
        $connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    } catch (PDOException $e) {
        die('Failed to connect to MySQL: ' . $e->getMessage());
    }

    $query = "INSERT INTO messenger_messages (body, headers, queue_name, created_at, available_at, delivered_at)
		VALUES (:body, :headers, :queue_name, :created_at, :available_at, :delivered_at)";
    $statement = $connection->prepare($query);

    date_default_timezone_set('America/Toronto');
    $now = date('Y-m-d H:i:s');

    $statement->bindParam(':body', $serializedEnvelope);
    $statement->bindParam(':headers', '[]');
    $statement->bindParam(':queue_name', 'high');
    $statement->bindParam(':created_at', $now);
    $statement->bindParam(':available_at', $now);
    $statement->bindParam(':delivered_at', null);

    try {
        $statement->execute();
    } catch (PDOException $e) {
        return [
            "body" => [
                "success" => false
            ]
        ];
    }

    // This closes the database connection
    $connection = null;

    return [
        "body" => [
            "success" => true
        ]
    ];
}
