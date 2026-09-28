<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header_remove('X-Powered-By');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

$configPath = dirname(__DIR__) . '/dalli-config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    exit('Dalli configuration is missing.');
}

$config = require $configPath;
$setupToken = is_array($config) ? (string) ($config['app']['setup_token'] ?? '') : '';

if ($setupToken === '') {
    http_response_code(404);
    exit('Not found.');
}

function setup_same_origin(array $config): bool
{
    $expected = rtrim((string) ($config['app']['origin'] ?? ''), '/');
    if ($expected === '') {
        return false;
    }

    $origin = rtrim($_SERVER['HTTP_ORIGIN'] ?? '', '/');
    if ($origin !== '') {
        return hash_equals($expected, $origin);
    }

    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer !== '') {
        $parts = parse_url($referer);
        $scheme = $parts['scheme'] ?? '';
        $host = $parts['host'] ?? '';
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        return $scheme !== '' && $host !== '' && hash_equals($expected, $scheme . '://' . $host . $port);
    }

    return false;
}

$message = '';
$success = false;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!setup_same_origin($config)) {
        http_response_code(403);
        exit('Request origin rejected.');
    }

    $providedToken = (string) ($_POST['setup_token'] ?? '');
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (!hash_equals($setupToken, $providedToken)) {
        usleep(200000);
        $message = 'Invalid setup token.';
    } elseif (preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username) !== 1) {
        $message = 'Username must be 3–64 characters using letters, numbers, dot, underscore or hyphen.';
    } elseif (strlen($password) < 12 || strlen($password) > 200) {
        $message = 'Password must be at least 12 characters.';
    } else {
        try {
            $db = $config['database'] ?? [];
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=utf8mb4',
                (string) ($db['host'] ?? ''),
                (string) ($db['name'] ?? '')
            );
            $pdo = new PDO($dsn, (string) ($db['user'] ?? ''), (string) ($db['password'] ?? ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);

            $hash = password_hash($password, PASSWORD_DEFAULT);
            if (!is_string($hash)) {
                throw new RuntimeException('Password hashing failed.');
            }

            $stmt = $pdo->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
            $stmt->execute([$username, $hash]);
            $success = true;
            $message = 'Account created. Disable setup_token in dalli-config.php now.';
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                $message = 'That username already exists.';
            } else {
                error_log('Dalli setup failed: ' . $e->getMessage());
                $message = 'Could not create account.';
            }
        } catch (Throwable $e) {
            error_log('Dalli setup failed: ' . $e->getMessage());
            $message = 'Could not create account.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Dalli account setup</title>
</head>
<body>
  <main>
    <h1>Dalli account setup</h1>
    <?php if ($message !== ''): ?>
      <p><strong><?= htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong></p>
    <?php endif; ?>

    <?php if (!$success): ?>
      <form method="post" autocomplete="off">
        <p>
          <label>Setup token<br>
            <input type="password" name="setup_token" required autocomplete="off">
          </label>
        </p>
        <p>
          <label>Username<br>
            <input type="text" name="username" minlength="3" maxlength="64" required autocomplete="username">
          </label>
        </p>
        <p>
          <label>Password<br>
            <input type="password" name="password" minlength="12" maxlength="200" required autocomplete="new-password">
          </label>
        </p>
        <button type="submit">Create account</button>
      </form>
    <?php endif; ?>
  </main>
</body>
</html>
