DROP INDEX IF EXISTS idx_auth_api_keys_expires_at;

ALTER TABLE auth_api_keys
  DROP COLUMN IF EXISTS expires_at_ms,
  DROP COLUMN IF EXISTS last_used_at_ms,
  DROP COLUMN IF EXISTS last_used_ip;
