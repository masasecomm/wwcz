<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond($status, $data)
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, array('ok' => false, 'error' => 'This endpoint only accepts form submissions.'));
}

$rawBody = file_get_contents('php://input', false, null, 0, 12001);
if ($rawBody === false || strlen($rawBody) > 12000) {
    respond(413, array('ok' => false, 'error' => 'Your message is too large to send.'));
}

$submission = json_decode($rawBody, true);
if (!is_array($submission)) {
    $submission = $_POST;
}

$name = isset($submission['name']) && is_string($submission['name']) ? trim($submission['name']) : '';
$email = isset($submission['email']) && is_string($submission['email']) ? trim($submission['email']) : '';
$phone = isset($submission['phone']) && is_string($submission['phone']) ? trim($submission['phone']) : '';
$message = isset($submission['message']) && is_string($submission['message']) ? trim($submission['message']) : '';
$website = isset($submission['website']) && is_string($submission['website']) ? trim($submission['website']) : '';

if ($website !== '') {
    respond(400, array('ok' => false, 'error' => 'This submission could not be accepted.'));
}

if (strlen($name) < 2 || strlen($name) > 160) {
    respond(422, array('ok' => false, 'error' => 'Please enter a name between 2 and 160 characters.'));
}

if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) {
    respond(422, array('ok' => false, 'error' => 'Please enter a valid email address.'));
}

if (strlen($phone) > 64 || strlen($message) < 10 || strlen($message) > 10000) {
    respond(422, array('ok' => false, 'error' => 'Please check your phone number and message length.'));
}

$recipients = array(
    'Info@Warriorwomen.co.za',
    'Pastorjudy@warriorwomen.co.za',
    'masasecomm@gmail.com'
);
$sender = 'website@warriorwomen.co.za';
$subject = 'New Warrior Women website message';
$body = "A new message was sent through the Warrior Women website contact form.\n\n"
    . "Name: {$name}\n"
    . "Email: {$email}\n"
    . "Phone: " . ($phone !== '' ? $phone : 'Not provided') . "\n\n"
    . "Message:\n{$message}\n";
$headers = array(
    'From: Warrior Women Website <' . $sender . '>',
    'Reply-To: ' . $email,
    'Bcc: ' . implode(', ', array_slice($recipients, 1)),
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . phpversion()
);

if (!mail($recipients[0], $subject, $body, implode("\r\n", $headers), '-f' . $sender)) {
    error_log('Warrior Women contact form: PHP mail() could not send a message.');
    respond(500, array('ok' => false, 'error' => 'We could not send your message right now. Please try again or email the ministry directly.'));
}

respond(200, array('ok' => true, 'emailSent' => true));
