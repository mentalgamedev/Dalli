<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

// MoLife application-state validation lives outside the reusable auth runtime.
// These functions intentionally keep their existing names and validation rules.
function dalli_string_ok(mixed $value, int $min, int $max): bool
{
    return is_string($value) && strlen($value) >= $min && strlen($value) <= $max;
}

function dalli_number_between(mixed $value, float $min, float $max): bool
{
    return is_int($value) || is_float($value)
        ? (float) $value >= $min && (float) $value <= $max
        : false;
}

function dalli_keys_allowed(array $value, array $allowed): bool
{
    return count(array_diff(array_keys($value), $allowed)) === 0;
}

function dalli_validate_state_v2(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history'])
        || ($state['version'] ?? null) !== 2) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;

    if (!is_array($settings) || !dalli_keys_allowed($settings, ['goal', 'categories', 'actions'])) {
        dalli_fail('Invalid settings.', 422);
    }
    if (!is_int($settings['goal'] ?? null) || $settings['goal'] < 20 || $settings['goal'] > 1000) {
        dalli_fail('Invalid daily goal.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
            dalli_fail('Invalid category data.', 422);
        }

        $categoryIds[$id] = true;
    }

    $actions = $settings['actions'] ?? null;
    if (!is_array($actions) || count($actions) > 500) {
        dalli_fail('Invalid actions.', 422);
    }

    $actionIds = [];
    foreach ($actions as $action) {
        if (!is_array($action) || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseXp', 'type', 'trackVisible'])) {
            dalli_fail('Invalid action.', 422);
        }

        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;

        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }
        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['baseXp'] ?? null) || $action['baseXp'] < 1 || $action['baseXp'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || (array_key_exists('trackVisible', $action) && !is_bool($action['trackVisible']))) {
            dalli_fail('Invalid action data.', 422);
        }

        $actionIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['lifetimeXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['lifetimeXp'] ?? null)
        || $progression['lifetimeXp'] < 0 || $progression['lifetimeXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateTransaction = static function (mixed $tx): bool {
        if (!is_array($tx)
            || !dalli_keys_allowed($tx, [
                'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseXp', 'effectiveXp', 'efficiency', 'timestamp'
            ])) {
            return false;
        }

        $categoryId = $tx['categoryId'] ?? null;
        return dalli_string_ok($tx['id'] ?? null, 1, 128)
            && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
            && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
            && is_string($categoryId)
            && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
            && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
            && is_int($tx['baseXp'] ?? null) && $tx['baseXp'] >= 1 && $tx['baseXp'] <= 200
            && is_int($tx['effectiveXp'] ?? null) && $tx['effectiveXp'] >= 1 && $tx['effectiveXp'] <= 200
            && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
            && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
            && (float) $tx['timestamp'] > 0;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) {
            return true;
        }

        if (!is_array($card)
            || !dalli_keys_allowed($card, ['date', 'type', 'headline', 'copy', 'xp', 'rank', 'streak'])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['xp'] ?? null) && $card['xp'] >= 0 && $card['xp'] <= 100000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };

    $validateXpMap = static function (mixed $map): bool {
        if (!is_array($map)) {
            return false;
        }

        foreach ($map as $categoryId => $xp) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($xp) || $xp < 0 || $xp > 100000) {
                return false;
            }
        }
        return true;
    };

    if (!is_array($current)
        || !dalli_keys_allowed($current, ['date', 'transactions', 'clearedAt', 'dayCard'])) {
        dalli_fail('Invalid current day.', 422);
    }

    $currentDate = $current['date'] ?? '';
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)) {
        dalli_fail('Invalid current date.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) {
            dalli_fail('Invalid transaction data.', 422);
        }
    }

    if (!$validTimestamp($current['clearedAt'] ?? null)
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current completion data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'xp', 'baseXp', 'goal', 'won', 'categoryXp', 'categoryBaseXp',
                'clearedAt', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['xp'] ?? null) || $day['xp'] < 0 || $day['xp'] > 100000
            || !is_int($day['baseXp'] ?? null) || $day['baseXp'] < 0 || $day['baseXp'] > 100000
            || !is_int($day['goal'] ?? null) || $day['goal'] < 20 || $day['goal'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateXpMap($day['categoryXp'] ?? null)
            || !$validateXpMap($day['categoryBaseXp'] ?? null)
            || !$validTimestamp($day['clearedAt'] ?? null)
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) {
                dalli_fail('Invalid historical transaction data.', 422);
            }
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state_v3(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history'])
        || ($state['version'] ?? null) !== 3) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, ['fullEnemyHp', 'categories', 'actions', 'combos'])
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
            dalli_fail('Invalid category data.', 422);
        }

        $categoryIds[$id] = true;
    }

    $actions = $settings['actions'] ?? null;
    if (!is_array($actions) || count($actions) > 500) {
        dalli_fail('Invalid actions.', 422);
    }

    $actionIds = [];
    foreach ($actions as $action) {
        if (!is_array($action)
            || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseDamage', 'type', 'trackVisible'])) {
            dalli_fail('Invalid action.', 422);
        }

        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }
        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    if ($isV8) {
        if (!is_array($oneOffs) || count($oneOffs) > 500) {
            dalli_fail('Invalid One-offs.', 422);
        }

        $oneOffIds = [];
        foreach ($oneOffs as $oneOff) {
            if (!is_array($oneOff)
                || !dalli_keys_allowed($oneOff, ['id', 'categoryId', 'name', 'baseDamage', 'createdAt'])) {
                dalli_fail('Invalid One-off.', 422);
            }

            $oneOffId = $oneOff['id'] ?? null;
            $oneOffCategoryId = $oneOff['categoryId'] ?? null;
            if (!is_string($oneOffId)
                || strlen($oneOffId) < 1
                || strlen($oneOffId) > 128
                || isset($oneOffIds[$oneOffId])
                || !is_string($oneOffCategoryId)
                || !isset($categoryIds[$oneOffCategoryId])
                || !dalli_string_ok($oneOff['name'] ?? null, 1, 100)
                || !is_int($oneOff['baseDamage'] ?? null)
                || $oneOff['baseDamage'] < 1
                || $oneOff['baseDamage'] > 200
                || (is_int($oneOff['createdAt'] ?? null) || is_float($oneOff['createdAt'] ?? null)) === false
                || (float) $oneOff['createdAt'] <= 0) {
                dalli_fail('Invalid One-off data.', 422);
            }
            $oneOffIds[$oneOffId] = true;
        }
    } elseif ($oneOffs !== null) {
        dalli_fail('One-offs are not valid for this state version.', 422);
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };

    $validateTransaction = static function (mixed $tx): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            $allowedActionTxKeys = $isV8
                ? [
                    'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                    'baseDamage', 'damage', 'efficiency', 'oneOff', 'timestamp'
                ]
                : [
                    'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                    'baseDamage', 'damage', 'efficiency', 'timestamp'
                ];
            if (!dalli_keys_allowed($tx, $allowedActionTxKeys)) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 200
                && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'defeatedAt',
            'victoryXpAwarded', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}

function dalli_validate_state_v4(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history', 'armory'])
        || ($state['version'] ?? null) !== 4) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;
    $armory = $state['armory'] ?? null;

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, ['fullEnemyHp', 'categories', 'actions', 'combos'])
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
            dalli_fail('Invalid category data.', 422);
        }

        $categoryIds[$id] = true;
    }

    $actions = $settings['actions'] ?? null;
    if (!is_array($actions) || count($actions) > 500) {
        dalli_fail('Invalid actions.', 422);
    }

    $actionIds = [];
    foreach ($actions as $action) {
        if (!is_array($action)
            || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseDamage', 'type', 'trackVisible'])) {
            dalli_fail('Invalid action.', 422);
        }

        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }
        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };


    $weaponBases = [
        'snub-nosed' => 10,
        'sawed-off' => 20,
        'tommy-gun' => 25,
        'grenade-launcher' => 30,
        'bazooka' => 35,
        'flamethrower' => 40,
        'golden-gun' => 999,
    ];
    $conditionMultipliers = [
        'rusty' => 0.5,
        'clean' => 1.0,
        'pimped' => 1.5,
        'over-engineered' => 2.0,
    ];

    $validateWeaponItem = static function (mixed $item) use ($weaponBases, $conditionMultipliers, $validTimestamp): bool {
        if (!is_array($item)
            || !dalli_keys_allowed($item, [
                'id', 'weaponId', 'conditionId', 'multiplier', 'damage',
                'acquiredDate', 'acquiredAt'
            ])) {
            return false;
        }

        $weaponId = $item['weaponId'] ?? null;
        if (!is_string($weaponId) || !array_key_exists($weaponId, $weaponBases)
            || !dalli_string_ok($item['id'] ?? null, 1, 128)
            || !is_string($item['acquiredDate'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $item['acquiredDate']) !== 1
            || !$validTimestamp($item['acquiredAt'] ?? null)
            || !is_int($item['damage'] ?? null)) {
            return false;
        }

        if ($weaponId === 'golden-gun') {
            return ($item['conditionId'] ?? null) === null
                && dalli_number_between($item['multiplier'] ?? null, 1, 1)
                && $item['damage'] === 999;
        }

        $conditionId = $item['conditionId'] ?? null;
        if (!is_string($conditionId) || !array_key_exists($conditionId, $conditionMultipliers)) {
            return false;
        }

        $multiplier = $conditionMultipliers[$conditionId];
        $expectedDamage = (int) round($weaponBases[$weaponId] * $multiplier);
        return dalli_number_between($item['multiplier'] ?? null, $multiplier, $multiplier)
            && $item['damage'] === $expectedDamage;
    };

    $validateTransaction = static function (mixed $tx) use ($weaponBases, $conditionMultipliers): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseDamage', 'damage', 'efficiency', 'timestamp'
            ])) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 200
                && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }


        if ($tx['type'] === 'weapon') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'weaponItemId', 'weaponId', 'weaponName',
                'conditionId', 'conditionName', 'multiplier', 'damage', 'timestamp'
            ])) {
                return false;
            }

            $weaponId = $tx['weaponId'] ?? null;

            if (!is_string($weaponId) || !array_key_exists($weaponId, $weaponBases)
                || !dalli_string_ok($tx['id'] ?? null, 1, 128)
                || !dalli_string_ok($tx['weaponItemId'] ?? null, 1, 128)
                || !dalli_string_ok($tx['weaponName'] ?? null, 1, 80)
                || !is_int($tx['damage'] ?? null)
                || (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null)) === false
                || (float) $tx['timestamp'] <= 0) {
                return false;
            }

            if ($weaponId === 'golden-gun') {
                return ($tx['conditionId'] ?? null) === null
                    && ($tx['conditionName'] ?? null) === null
                    && dalli_number_between($tx['multiplier'] ?? null, 1, 1)
                    && $tx['damage'] >= 999 && $tx['damage'] <= 1000;
            }

            $conditionId = $tx['conditionId'] ?? null;
            if (!is_string($conditionId)
                || !array_key_exists($conditionId, $conditionMultipliers)
                || !dalli_string_ok($tx['conditionName'] ?? null, 1, 80)) {
                return false;
            }

            $multiplier = $conditionMultipliers[$conditionId];
            $expectedDamage = (int) round($weaponBases[$weaponId] * $multiplier);
            return dalli_number_between($tx['multiplier'] ?? null, $multiplier, $multiplier)
                && $tx['damage'] === $expectedDamage;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };


    if (!is_array($armory)
        || !dalli_keys_allowed($armory, ['weapons'])
        || !is_array($armory['weapons'] ?? null)
        || count($armory['weapons']) > 500) {
        dalli_fail('Invalid armory.', 422);
    }

    $weaponItemIds = [];
    foreach ($armory['weapons'] as $item) {
        if (!$validateWeaponItem($item)) {
            dalli_fail('Invalid armory weapon.', 422);
        }
        if (isset($weaponItemIds[$item['id']])) {
            dalli_fail('Duplicate armory weapon id.', 422);
        }
        $weaponItemIds[$item['id']] = true;
    }

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'defeatedAt',
            'victoryXpAwarded', 'loot', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }


    $loot = $current['loot'] ?? null;
    if (!is_array($loot)
        || !dalli_keys_allowed($loot, ['rolled', 'available', 'claimed', 'pendingWeapon'])
        || !is_bool($loot['rolled'] ?? null)
        || !is_bool($loot['available'] ?? null)
        || !is_bool($loot['claimed'] ?? null)) {
        dalli_fail('Invalid victory loot.', 422);
    }

    $pendingWeapon = $loot['pendingWeapon'] ?? null;
    if ($pendingWeapon !== null && !$validateWeaponItem($pendingWeapon)) {
        dalli_fail('Invalid pending weapon.', 422);
    }
    if (!$loot['rolled'] && ($loot['available'] || $loot['claimed'] || $pendingWeapon !== null)) {
        dalli_fail('Invalid unrolled victory loot.', 422);
    }
    if ($loot['available'] && ($pendingWeapon === null || $loot['claimed'])) {
        dalli_fail('Invalid available victory loot.', 422);
    }
    if ($loot['claimed'] && ($pendingWeapon === null || $loot['available'])) {
        dalli_fail('Invalid claimed victory loot.', 422);
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state_v5_v8(mixed $state): array
{
    $version = is_array($state) ? ($state['version'] ?? null) : null;
    $isV6Plus = in_array($version, [6, 7, 8], true);
    $isV7Plus = in_array($version, [7, 8], true);
    $isV8 = $version === 8;
    $allowedTopLevel = $isV8
        ? ['version', 'settings', 'progression', 'current', 'history', 'inventory', 'oneOffs']
        : ['version', 'settings', 'progression', 'current', 'history', 'inventory'];
    if (!is_array($state)
        || !dalli_keys_allowed($state, $allowedTopLevel)
        || !in_array($version, [5, 6, 7, 8], true)) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;
    $inventory = $state['inventory'] ?? null;
    $oneOffs = $state['oneOffs'] ?? null;

    $allowedSettings = $isV7Plus
        ? ['fullEnemyHp', 'focusCategoryId', 'focusFactor', 'resistanceBuildup', 'categories', 'actions', 'combos']
        : ['fullEnemyHp', 'categories', 'actions', 'combos'];

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, $allowedSettings)
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        $allowedCategoryKeys = $isV7Plus
            ? ['id', 'name', 'icon', 'color']
            : ['id', 'name', 'icon', 'focus', 'color'];
        if (!is_array($category) || !dalli_keys_allowed($category, $allowedCategoryKeys)) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $validFocus = true;
        if (!$isV7Plus) {
            $focus = $category['focus'] ?? null;
            $validFocus = $id === 'uncategorized'
                ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
                : dalli_number_between($focus, 0.25, 10);
        }

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
            dalli_fail('Invalid category data.', 422);
        }

        $categoryIds[$id] = true;
    }

    if ($isV7Plus) {
        $focusCategoryId = $settings['focusCategoryId'] ?? null;
        if ($focusCategoryId !== null
            && (!is_string($focusCategoryId)
                || $focusCategoryId === 'uncategorized'
                || !isset($categoryIds[$focusCategoryId]))) {
            dalli_fail('Invalid focused category.', 422);
        }
        if (!dalli_number_between($settings['focusFactor'] ?? null, 1, 10)
            || !dalli_number_between($settings['resistanceBuildup'] ?? null, 0, 2)) {
            dalli_fail('Invalid combat tuning.', 422);
        }
    }

    $actions = $settings['actions'] ?? null;
    if (!is_array($actions) || count($actions) > 500) {
        dalli_fail('Invalid actions.', 422);
    }

    $actionIds = [];
    foreach ($actions as $action) {
        if (!is_array($action)
            || !dalli_keys_allowed($action, [
                'id', 'categoryId', 'name', 'baseDamage', 'type',
                'trackVisible', 'requiredForVictory', 'requiredCount'
            ])) {
            dalli_fail('Invalid action.', 422);
        }

        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;
        $type = $action['type'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }

        $requiredCount = $action['requiredCount'] ?? null;
        $validRequiredCount = $isV6Plus
            ? is_int($requiredCount)
                && $requiredCount >= 1
                && $requiredCount <= 1000
                && ($type !== 'once' || $requiredCount === 1)
            : !array_key_exists('requiredCount', $action);

        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($type, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)
            || !is_bool($action['requiredForVictory'] ?? null)
            || (($action['requiredForVictory'] ?? false) && !($action['trackVisible'] ?? false))
            || !$validRequiredCount) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };


    $itemBases = [
        'molight-pro' => 10,
        'cosmic-laser-gun' => 20,
        'flash-tube' => 25,
        'light-rabbit-launcher' => 30,
        'sunflower-beam' => 35,
        'light-sword' => 40,
        'rite-of-illumination' => 999,
    ];
    $conditionMultipliers = [
        'questionable' => 0.5,
        'standard' => 1.0,
        'pimped' => 1.5,
        'over-engineered' => 2.0,
    ];

    $validatePawnshopItem = static function (mixed $item) use ($itemBases, $conditionMultipliers, $validTimestamp): bool {
        if (!is_array($item)
            || !dalli_keys_allowed($item, [
                'id', 'itemId', 'conditionId', 'multiplier', 'damage',
                'acquiredDate', 'acquiredAt'
            ])) {
            return false;
        }

        $itemId = $item['itemId'] ?? null;
        if (!is_string($itemId) || !array_key_exists($itemId, $itemBases)
            || !dalli_string_ok($item['id'] ?? null, 1, 128)
            || !is_string($item['acquiredDate'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $item['acquiredDate']) !== 1
            || !$validTimestamp($item['acquiredAt'] ?? null)
            || !is_int($item['damage'] ?? null)) {
            return false;
        }

        if ($itemId === 'rite-of-illumination') {
            return ($item['conditionId'] ?? null) === null
                && dalli_number_between($item['multiplier'] ?? null, 1, 1)
                && $item['damage'] === 999;
        }

        $conditionId = $item['conditionId'] ?? null;
        if (!is_string($conditionId) || !array_key_exists($conditionId, $conditionMultipliers)) {
            return false;
        }

        $multiplier = $conditionMultipliers[$conditionId];
        $expectedDamage = (int) round($itemBases[$itemId] * $multiplier);
        return dalli_number_between($item['multiplier'] ?? null, $multiplier, $multiplier)
            && $item['damage'] === $expectedDamage;
    };

    $validateTransaction = static function (mixed $tx) use ($itemBases, $conditionMultipliers, $isV6Plus, $isV7Plus, $isV8): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseDamage', 'damage', 'efficiency', 'timestamp'
            ])) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= ($isV6Plus ? 800 : 200)
                && dalli_number_between($tx['efficiency'] ?? null, $isV7Plus ? 0.001 : 0.01, $isV6Plus ? 4 : 1)
                && (!$isV8 || is_bool($tx['oneOff'] ?? null))
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }


        if ($tx['type'] === 'item') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'itemInstanceId', 'itemId', 'itemName',
                'conditionId', 'conditionName', 'multiplier', 'damage', 'timestamp'
            ])) {
                return false;
            }

            $itemId = $tx['itemId'] ?? null;

            if (!is_string($itemId) || !array_key_exists($itemId, $itemBases)
                || !dalli_string_ok($tx['id'] ?? null, 1, 128)
                || !dalli_string_ok($tx['itemInstanceId'] ?? null, 1, 128)
                || !dalli_string_ok($tx['itemName'] ?? null, 1, 80)
                || !is_int($tx['damage'] ?? null)
                || (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null)) === false
                || (float) $tx['timestamp'] <= 0) {
                return false;
            }

            if ($itemId === 'rite-of-illumination') {
                return ($tx['conditionId'] ?? null) === null
                    && ($tx['conditionName'] ?? null) === null
                    && dalli_number_between($tx['multiplier'] ?? null, 1, 1)
                    && $tx['damage'] >= 999 && $tx['damage'] <= 1000;
            }

            $conditionId = $tx['conditionId'] ?? null;
            if (!is_string($conditionId)
                || !array_key_exists($conditionId, $conditionMultipliers)
                || !dalli_string_ok($tx['conditionName'] ?? null, 1, 80)) {
                return false;
            }

            $multiplier = $conditionMultipliers[$conditionId];
            $expectedDamage = (int) round($itemBases[$itemId] * $multiplier);
            return dalli_number_between($tx['multiplier'] ?? null, $multiplier, $multiplier)
                && $tx['damage'] === $expectedDamage;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };


    if (!is_array($inventory)
        || !dalli_keys_allowed($inventory, ['items'])
        || !is_array($inventory['items'] ?? null)
        || count($inventory['items']) > 500) {
        dalli_fail('Invalid Pawnshop inventory.', 422);
    }

    $itemInstanceIds = [];
    foreach ($inventory['items'] as $item) {
        if (!$validatePawnshopItem($item)) {
            dalli_fail('Invalid Pawnshop item.', 422);
        }
        if (isset($itemInstanceIds[$item['id']])) {
            dalli_fail('Duplicate Pawnshop item id.', 422);
        }
        $itemInstanceIds[$item['id']] = true;
    }

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'requiredActionIds', 'requiredActions', 'defeatedAt',
            'victoryXpAwarded', 'loot', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    if ($isV6Plus) {
        if (array_key_exists('requiredActionIds', $current)) {
            dalli_fail('Legacy required action snapshot is not valid for this state version.', 422);
        }

        $requiredActions = $current['requiredActions'] ?? null;
        if (!is_array($requiredActions) || count($requiredActions) > 500) {
            dalli_fail('Invalid required action snapshot.', 422);
        }

        $seenRequiredActionIds = [];
        foreach ($requiredActions as $required) {
            if (!is_array($required)
                || !dalli_keys_allowed($required, ['actionId', 'requiredCount'])) {
                dalli_fail('Invalid required action requirement.', 422);
            }

            $actionId = $required['actionId'] ?? null;
            $requiredCount = $required['requiredCount'] ?? null;
            if (!is_string($actionId)
                || !isset($actionIds[$actionId])
                || isset($seenRequiredActionIds[$actionId])
                || !is_int($requiredCount)
                || $requiredCount < 1
                || $requiredCount > 1000) {
                dalli_fail('Invalid required action requirement.', 422);
            }
            $seenRequiredActionIds[$actionId] = true;
        }
    } else {
        if (array_key_exists('requiredActions', $current)) {
            dalli_fail('Modern required action snapshot is not valid for v5.', 422);
        }

        $requiredActionIds = $current['requiredActionIds'] ?? null;
        if (!is_array($requiredActionIds) || count($requiredActionIds) > 500) {
            dalli_fail('Invalid required action snapshot.', 422);
        }
        $seenRequiredActionIds = [];
        foreach ($requiredActionIds as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId]) || isset($seenRequiredActionIds[$actionId])) {
                dalli_fail('Invalid required action id.', 422);
            }
            $seenRequiredActionIds[$actionId] = true;
        }
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }


    $loot = $current['loot'] ?? null;
    if (!is_array($loot)
        || !dalli_keys_allowed($loot, ['rolled', 'available', 'claimed', 'pendingItem'])
        || !is_bool($loot['rolled'] ?? null)
        || !is_bool($loot['available'] ?? null)
        || !is_bool($loot['claimed'] ?? null)) {
        dalli_fail('Invalid victory loot.', 422);
    }

    $pendingItem = $loot['pendingItem'] ?? null;
    if ($pendingItem !== null && !$validatePawnshopItem($pendingItem)) {
        dalli_fail('Invalid pending item.', 422);
    }
    if (!$loot['rolled'] && ($loot['available'] || $loot['claimed'] || $pendingItem !== null)) {
        dalli_fail('Invalid unrolled victory loot.', 422);
    }
    if ($loot['available'] && ($pendingItem === null || $loot['claimed'])) {
        dalli_fail('Invalid available victory loot.', 422);
    }
    if ($loot['claimed'] && ($pendingItem === null || $loot['available'])) {
        dalli_fail('Invalid claimed victory loot.', 422);
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state(mixed $state): array
{
    $version = is_array($state) ? ($state['version'] ?? null) : null;
    if ($version === 2) return dalli_validate_state_v2($state);
    if ($version === 3) return dalli_validate_state_v3($state);
    if ($version === 4) return dalli_validate_state_v4($state);
    if ($version === 5 || $version === 6 || $version === 7 || $version === 8) return dalli_validate_state_v5_v8($state);
    dalli_fail('Unsupported Dalli state.', 422);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
