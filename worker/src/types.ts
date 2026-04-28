/**
 * Worker bindings and shared types.
 */
export type Env = {
  DB: D1Database;

  // From wrangler.toml [vars] — public, build-time
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_ADMIN_EMAILS: string; // comma-separated
  ALLOWED_ORIGIN: string;

  // From `wrangler secret put` — runtime secrets
  TURNSTILE_SECRET: string;
};

export type SubmissionRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  business_name: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  instagram: string | null;
  website: string | null;
  blurb: string | null;
  contact_name: string;
  email: string;
  notes: string | null;
  created_at: number;
  approved_at: number | null;
  approved_by: string | null;
  rejected_at: number | null;
  removal_token: string;
  ip_hash: string | null;
  user_agent: string | null;
};

/** Public projection — what the world sees on the map. */
export type FriendPublic = {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  instagram: string | null;
  website: string | null;
  blurb: string | null;
};

/** Admin projection — adds private contact + status fields. */
export type SubmissionAdmin = FriendPublic & {
  status: "pending" | "approved" | "rejected";
  contact_name: string;
  email: string;
  notes: string | null;
  created_at: number;
  approved_at: number | null;
  approved_by: string | null;
};
