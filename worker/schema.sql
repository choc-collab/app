-- Choccy Chat directory — D1 schema.
-- Apply with: npm run schema   (production)
--             npm run schema:local   (local wrangler dev)

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',

  -- Public — shown on the map after approval
  business_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  lat REAL,
  lng REAL,
  instagram TEXT,
  website TEXT,
  blurb TEXT,

  -- Private — only visible in admin UI
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  notes TEXT,

  -- Bookkeeping
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  approved_by TEXT,
  rejected_at INTEGER,
  removal_token TEXT NOT NULL,

  -- Light forensic metadata (no raw IP — IP is hashed for rate-limiting only)
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_removal_token ON submissions(removal_token);
