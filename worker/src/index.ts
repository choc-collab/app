/**
 * Choccy Chat directory — Cloudflare Worker entry point.
 *
 * Mounted at https://choc-collab.org/api/* via [[routes]] in wrangler.toml.
 *
 * Routes:
 *   POST /api/choccy-chat/submit          public form intake (Turnstile gated)
 *   GET  /api/choccy-chat/friends         public approved-entries list
 *   POST /api/choccy-chat/remove?token=…  self-removal
 *   GET  /api/choccy-chat/admin/list?status=…   admin (CF Access)
 *   POST /api/choccy-chat/admin/approve         admin (CF Access)
 *   POST /api/choccy-chat/admin/reject          admin (CF Access)
 */
import {
  handleAdminApprove,
  handleAdminList,
  handleAdminReject,
  handleFriends,
  handleSelfRemove,
  handleSubmit,
} from "./handlers";
import { corsHeaders, json } from "./lib";
import type { Env } from "./types";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (path === "/api/choccy-chat/submit") {
        return await handleSubmit(req, env);
      }
      if (path === "/api/choccy-chat/friends") {
        return await handleFriends(req, env);
      }
      if (path === "/api/choccy-chat/remove") {
        return await handleSelfRemove(req, env);
      }
      if (path === "/api/choccy-chat/admin/list") {
        return await handleAdminList(req, env);
      }
      if (path === "/api/choccy-chat/admin/approve") {
        return await handleAdminApprove(req, env);
      }
      if (path === "/api/choccy-chat/admin/reject") {
        return await handleAdminReject(req, env);
      }
      return json({ error: "Not found" }, { status: 404 }, env);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Internal error";
      console.error("Worker error:", message, e);
      return json({ error: "Internal error" }, { status: 500 }, env);
    }
  },
};
