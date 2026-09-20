BEGIN;

CREATE TABLE security_rate_limits (
  key_hash char(64) NOT NULL,
  bucket_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash, bucket_started_at)
);

CREATE INDEX security_rate_limits_expiry_idx ON security_rate_limits(expires_at);
CREATE INDEX admin_sessions_active_lookup_idx
  ON admin_sessions(token_hash, expires_at, last_seen_at)
  WHERE revoked_at IS NULL;

COMMIT;
