<?php
declare(strict_types=1);

if (!defined('DALLI_SESSION_NAME')) {
    require __DIR__ . '/bootstrap.php';
}

function dalli_mail_value(string $key): string
{
    return trim(dalli_config('mail', $key));
}

function dalli_mail_configured(): bool
{
    $from = dalli_mail_value('from_email');
    $transport = strtolower(dalli_mail_value('transport'));

    if (defined('MOLIFE_TESTING') && MOLIFE_TESTING === true && $transport === 'test') {
        return filter_var($from, FILTER_VALIDATE_EMAIL) !== false
            && dalli_mail_value('test_sink') !== '';
    }

    $host = dalli_mail_value('host');
    $port = dalli_mail_value('port');
    $encryption = strtolower(dalli_mail_value('encryption'));
    $username = dalli_mail_value('username');
    $password = dalli_mail_value('password');

    return $host !== ''
        && ctype_digit($port)
        && (int) $port >= 1
        && (int) $port <= 65535
        && in_array($encryption, ['tls', 'ssl'], true)
        && $username !== ''
        && $password !== ''
        && filter_var($from, FILTER_VALIDATE_EMAIL) !== false;
}

function dalli_public_signup_ready(): bool
{
    return dalli_auth_schema_ready()
        && dalli_registration_mode() === 'public'
        && dalli_mail_configured();
}

function dalli_mail_header_text(string $value): string
{
    $clean = trim(str_replace(["\r", "\n"], '', $value));
    return '=?UTF-8?B?' . base64_encode($clean) . '?=';
}

function dalli_mailbox(string $email, string $name = ''): string
{
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || preg_match('/[\r\n]/', $email)) {
        throw new InvalidArgumentException('Invalid email address.');
    }

    $name = trim(str_replace(["\r", "\n"], '', $name));
    return $name === '' ? $email : dalli_mail_header_text($name) . ' <' . $email . '>';
}

function dalli_smtp_read($socket): array
{
    $message = '';
    $code = 0;

    while (($line = fgets($socket, 4096)) !== false) {
        $message .= $line;
        if (preg_match('/^(\d{3})([ -])/', $line, $matches) === 1) {
            $code = (int) $matches[1];
            if ($matches[2] === ' ') {
                break;
            }
        }
    }

    if ($message === '') {
        throw new RuntimeException('SMTP server closed the connection unexpectedly.');
    }

    return [$code, trim($message)];
}

function dalli_smtp_expect($socket, array $allowedCodes): string
{
    [$code, $message] = dalli_smtp_read($socket);
    if (!in_array($code, $allowedCodes, true)) {
        throw new RuntimeException('SMTP command failed with response ' . $code . '.');
    }
    return $message;
}

function dalli_smtp_command($socket, string $command, array $allowedCodes): string
{
    if (fwrite($socket, $command . "\r\n") === false) {
        throw new RuntimeException('Could not write to SMTP server.');
    }
    return dalli_smtp_expect($socket, $allowedCodes);
}

function dalli_build_verification_email(string $username, string $verificationUrl): array
{
    $safeName = htmlspecialchars($username, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeUrl = htmlspecialchars($verificationUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    $subject = 'Activate your MoLife account';
    $plain = "MoLife // mo.les.tech identity transmission\n\n"
        . "Hello {$username},\n\n"
        . "Activate your MoLife account using this link:\n{$verificationUrl}\n\n"
        . "The link expires in 60 minutes and works once.\n\n"
        . "If you did not request this account, you can ignore this message.\n";

    $html = '<!doctype html><html><body style="margin:0;background:#0d1016;color:#f3f4f7;font-family:Arial,sans-serif;">'
        . '<div style="max-width:560px;margin:0 auto;padding:32px 24px;">'
        . '<div style="font-size:11px;letter-spacing:.18em;color:#8b94a4;text-transform:uppercase;">mo.les.tech // identity department</div>'
        . '<h1 style="margin:10px 0 8px;font-size:30px;">TRANSMISSION RECEIVED</h1>'
        . '<p style="color:#b8bfca;line-height:1.55;">Hello ' . $safeName . '. Your MoLife cloud identity is waiting for activation.</p>'
        . '<p style="margin:28px 0;"><a href="' . $safeUrl . '" style="display:inline-block;padding:13px 18px;border-radius:10px;background:#d8b95e;color:#101217;text-decoration:none;font-weight:800;">ACTIVATE MOLIFE ACCOUNT</a></p>'
        . '<p style="color:#8f98a6;font-size:13px;line-height:1.5;">This one-use link expires in 60 minutes. If you did not request a MoLife account, ignore this message.</p>'
        . '<p style="margin-top:28px;color:#68717f;font-size:11px;">powered by MoThink-6.7</p>'
        . '</div></body></html>';

    return [
        'subject' => $subject,
        'plain' => $plain,
        'html' => $html,
    ];
}

function dalli_send_transactional_email(
    string $toEmail,
    string $toName,
    string $subject,
    string $plain,
    string $html
): void {
    if (!dalli_mail_configured()) {
        throw new RuntimeException('Transactional email is not configured.');
    }

    if (defined('MOLIFE_TESTING') && MOLIFE_TESTING === true && strtolower(dalli_mail_value('transport')) === 'test') {
        $record = json_encode([
            'to' => $toEmail,
            'name' => $toName,
            'subject' => $subject,
            'plain' => $plain,
            'html' => $html,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $sink = dalli_mail_value('test_sink');
        if (file_put_contents($sink, $record . PHP_EOL, FILE_APPEND | LOCK_EX) === false) {
            throw new RuntimeException('Could not write test mail sink.');
        }
        return;
    }

    $host = dalli_mail_value('host');
    $port = (int) dalli_mail_value('port');
    $encryption = strtolower(dalli_mail_value('encryption'));
    $username = dalli_mail_value('username');
    $password = dalli_mail_value('password');
    $fromEmail = dalli_mail_value('from_email');
    $fromName = dalli_mail_value('from_name') ?: 'MoLife';

    if (filter_var($toEmail, FILTER_VALIDATE_EMAIL) === false) {
        throw new InvalidArgumentException('Invalid recipient email address.');
    }

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'peer_name' => $host,
            'SNI_enabled' => true,
        ],
    ]);

    $remote = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client(
        $remote,
        $errno,
        $errstr,
        12,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!is_resource($socket)) {
        throw new RuntimeException('Could not connect to the transactional email server.');
    }

    stream_set_timeout($socket, 12);

    try {
        dalli_smtp_expect($socket, [220]);

        $helo = $_SERVER['SERVER_NAME'] ?? 'molife';
        $helo = preg_replace('/[^A-Za-z0-9.-]/', '', (string) $helo) ?: 'molife';
        dalli_smtp_command($socket, 'EHLO ' . $helo, [250]);

        if ($encryption === 'tls') {
            dalli_smtp_command($socket, 'STARTTLS', [220]);
            $crypto = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($crypto !== true) {
                throw new RuntimeException('Could not establish SMTP TLS.');
            }
            dalli_smtp_command($socket, 'EHLO ' . $helo, [250]);
        }

        dalli_smtp_command($socket, 'AUTH LOGIN', [334]);
        dalli_smtp_command($socket, base64_encode($username), [334]);
        dalli_smtp_command($socket, base64_encode($password), [235]);

        dalli_smtp_command($socket, 'MAIL FROM:<' . $fromEmail . '>', [250]);
        dalli_smtp_command($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
        dalli_smtp_command($socket, 'DATA', [354]);

        $boundary = 'molife-' . bin2hex(random_bytes(12));
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $helo . '>',
            'From: ' . dalli_mailbox($fromEmail, $fromName),
            'To: ' . dalli_mailbox($toEmail, $toName),
            'Subject: ' . dalli_mail_header_text($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $body = implode("\r\n", $headers) . "\r\n\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . str_replace("\n", "\r\n", str_replace("\r\n", "\n", $plain)) . "\r\n\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . str_replace("\n", "\r\n", str_replace("\r\n", "\n", $html)) . "\r\n\r\n"
            . '--' . $boundary . "--\r\n";

        $body = preg_replace('/(?m)^\./', '..', $body) ?? $body;
        if (fwrite($socket, $body . "\r\n.\r\n") === false) {
            throw new RuntimeException('Could not send SMTP message body.');
        }
        dalli_smtp_expect($socket, [250]);
        dalli_smtp_command($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function dalli_build_existing_account_email(string $username): array
{
    $safeName = htmlspecialchars($username, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $subject = 'MoLife account request';
    $plain = "MoLife // mo.les.tech identity transmission\n\n"
        . "Hello {$username},\n\n"
        . "Someone tried to create a MoLife account using this email address, but it is already attached to an active account.\n\n"
        . "If this was you, return to MoLife and log in. If it was not you, no action is required.\n";

    $html = '<!doctype html><html><body style="margin:0;background:#0d1016;color:#f3f4f7;font-family:Arial,sans-serif;">'
        . '<div style="max-width:560px;margin:0 auto;padding:32px 24px;">'
        . '<div style="font-size:11px;letter-spacing:.18em;color:#8b94a4;text-transform:uppercase;">mo.les.tech // identity department</div>'
        . '<h1 style="margin:10px 0 8px;font-size:30px;">IDENTITY ALREADY ON FILE</h1>'
        . '<p style="color:#b8bfca;line-height:1.55;">Hello ' . $safeName . '. Someone tried to create a MoLife account using this email address, but it is already attached to an active account.</p>'
        . '<p style="color:#8f98a6;font-size:13px;line-height:1.5;">If this was you, return to MoLife and log in. If it was not you, no action is required.</p>'
        . '<p style="margin-top:28px;color:#68717f;font-size:11px;">powered by MoThink-6.7</p>'
        . '</div></body></html>';

    return ['subject' => $subject, 'plain' => $plain, 'html' => $html];
}

function dalli_send_existing_account_email(string $email, string $username): void
{
    $message = dalli_build_existing_account_email($username);
    dalli_send_transactional_email(
        $email,
        $username,
        $message['subject'],
        $message['plain'],
        $message['html']
    );
}


function dalli_send_verification_email(string $email, string $username, string $verificationUrl): void
{
    $message = dalli_build_verification_email($username, $verificationUrl);
    dalli_send_transactional_email(
        $email,
        $username,
        $message['subject'],
        $message['plain'],
        $message['html']
    );
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
