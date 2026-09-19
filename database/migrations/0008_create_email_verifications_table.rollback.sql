DROP INDEX IF EXISTS idx_auth_email_verifications_email;
DROP INDEX IF EXISTS idx_auth_email_verifications_user_id;
DROP TABLE IF EXISTS auth_email_verifications;

ALTER TABLE auth_users
  DROP COLUMN IF EXISTS email_verified;
