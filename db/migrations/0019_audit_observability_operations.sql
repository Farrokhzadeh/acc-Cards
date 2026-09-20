BEGIN;

INSERT INTO permissions (key, description) VALUES
  ('operations.read', 'View operational health, alerts, workers, jobs, and sync diagnostics.'),
  ('operations.manage', 'Acknowledge and resolve operational alerts.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (p.key = 'operations.read' OR (p.key='operations.manage' AND r.name='operator'))
 WHERE r.name IN ('operator', 'finance_reviewer')
ON CONFLICT DO NOTHING;

CREATE TABLE operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('database','worker','provider','email','telegram','webhook','otp','operation','security')),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  title text NOT NULL,
  detail_redacted text NOT NULL,
  source_type text,
  source_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  acknowledged_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_alerts_status_severity_idx ON operational_alerts(status, severity, last_seen_at DESC);

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0);

INSERT INTO scheduled_jobs(job_key, job_type, interval_seconds, max_attempts, safe_config)
VALUES ('operations-health-scan', 'operations_health_scan', 60, 5, '{}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;

COMMIT;
