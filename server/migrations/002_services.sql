CREATE TABLE IF NOT EXISTS services_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{"services":[],"history":[],"plans":[],"updatedAt":""}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
