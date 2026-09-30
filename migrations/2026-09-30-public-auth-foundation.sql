-- MoLife public-auth foundation migration
-- Run once against an existing MoLife database before enabling the modern auth backend.
-- Existing accounts remain active. The oldest existing account becomes the explicit owner.

ALTER TABLE users
    ADD COLUMN email VARCHAR(254) NULL AFTER username,
    ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER password_hash,
    ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active' AFTER role,
    ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER status,
    ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL AFTER email_verified_at,
    ADD UNIQUE KEY uq_users_email (email);

UPDATE users
SET role = 'owner'
WHERE id = (
    SELECT owner_id
    FROM (SELECT MIN(id) AS owner_id FROM users) AS existing_owner
);

CREATE TABLE auth_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    selector CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    validator_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_sessions_selector (selector),
    KEY idx_auth_sessions_user (user_id),
    KEY idx_auth_sessions_expires (expires_at),
    CONSTRAINT fk_auth_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;

CREATE TABLE auth_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    purpose VARCHAR(32) NOT NULL,
    selector VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_tokens_selector (selector),
    KEY idx_auth_tokens_user_purpose (user_id, purpose),
    KEY idx_auth_tokens_expires (expires_at),
    CONSTRAINT fk_auth_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;

CREATE TABLE auth_rate_limits (
    action VARCHAR(32) NOT NULL,
    bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hit_count INT UNSIGNED NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP NULL DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (action, bucket_hash),
    KEY idx_auth_rate_limits_updated (updated_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;
