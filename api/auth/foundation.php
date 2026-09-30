<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Authentication storage capability, registration mode, and password hashing primitives.
function dalli_auth_schema_ready(?PDO $pdo = null): bool
{
    static $ready = null;
    if (is_bool($ready)) {
        return $ready;
    }

    $pdo ??= dalli_pdo();
    try {
        $pdo->query('SELECT email, role, status, email_verified_at FROM users LIMIT 0');
        $pdo->query('SELECT selector FROM auth_sessions LIMIT 0');
        $pdo->query('SELECT selector FROM auth_tokens LIMIT 0');
        $pdo->query('SELECT bucket_hash FROM auth_rate_limits LIMIT 0');
        $ready = true;
    } catch (Throwable $e) {
        $ready = false;
    }

    return $ready;
}

function dalli_registration_mode(): string
{
    $mode = strtolower(trim(dalli_config('app', 'registration_mode')));
    if (!in_array($mode, ['invite', 'closed', 'public'], true)) {
        return 'invite';
    }
    return $mode;
}

function dalli_password_algorithm(): string|int|null
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

function dalli_password_options(): array
{
    if (defined('PASSWORD_ARGON2ID')) {
        return [
            'memory_cost' => 19456,
            'time_cost' => 2,
            'threads' => 1,
        ];
    }
    return [];
}

function dalli_hash_password(string $password): string
{
    $hash = password_hash($password, dalli_password_algorithm(), dalli_password_options());
    if (!is_string($hash)) {
        throw new RuntimeException('Password hashing failed.');
    }
    return $hash;
}

function dalli_password_needs_rehash(string $hash): bool
{
    return password_needs_rehash($hash, dalli_password_algorithm(), dalli_password_options());
}
