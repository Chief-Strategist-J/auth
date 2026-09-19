ALTER TABLE auth_api_keys
  ADD COLUMN IF NOT EXISTS expires_at_ms BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_used_at_ms BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_used_ip VARCHAR(64) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_api_keys_expires_at
  ON auth_api_keys (expires_at_ms)
  WHERE expires_at_ms IS NOT NULL AND deleted_at IS NULL;
