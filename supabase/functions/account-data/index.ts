import { createHandler } from "./handler.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { Problem, service } from "./service.ts";
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error("Missing server configuration: " + key);
  return value;
};
const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
});
const allowed = new Set(
  env("DAILY_DECK_ALLOWED_ORIGINS").split(",").map((v) => v.trim()),
);
const workerSecret = env("DAILY_DECK_WORKER_SECRET");
if (workerSecret.length < 32) {
  throw new Error("Worker secret must be at least 32 characters");
}
const api = service({
  verify: async (token) => {
    if (!token) throw new Problem(401, "AUTH", "Sign in to your account.");
    const r = await admin.auth.getUser(token);
    if (r.error || !r.data.user) {
      throw new Problem(
        401,
        "AUTH",
        "Your account session could not be verified. Sign in again.",
      );
    }
    const claims = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      claims.role !== "authenticated" || claims.sub !== r.data.user.id ||
      !/^[a-f0-9-]{36}$/i.test(claims.session_id ?? "")
    ) throw new Problem(401, "AUTH", "Sign in again.");
    const session = await admin.rpc("daily_deck_verify_session", {
      p_owner: r.data.user.id,
      p_session: claims.session_id,
    });
    if (session.error) {
      throw new Problem(
        503,
        "SESSION_VERIFY_UNAVAILABLE",
        "Live session verification is unavailable. Check the new migration and server configuration; no deletion started.",
      );
    }
    if (session.data !== true) {
      throw new Problem(
        401,
        "AUTH",
        "This session is revoked or expired. Sign in again.",
      );
    }
    return r.data.user;
  },
  rpc: async (name, args) => {
    const r = await admin.rpc(name, args);
    if (r.error) {
      throw new Problem(
        r.error.code === "PDA01" ? 409 : 503,
        r.error.code === "PDA02"
          ? "WORKER_NOT_READY"
          : r.error.code === "PDA03"
          ? "DELETION_EXISTS"
          : r.error.code ?? "DATABASE",
        r.error.code === "PDA02"
          ? "The server erasure worker is not ready. No deletion started. Ask the operator to verify the scheduled worker."
          : r.error.code === "PDA03"
          ? "This account is already being deleted under another request. The server worker will continue it."
          : "Account operation could not finish. Retry using the same request.",
      );
    }
    return r.data;
  },
  download: async (name) => {
    const r = await admin.storage.from("daily-deck-photos").download(name);
    if (r.error || !r.data) {
      throw new Problem(
        503,
        "PHOTO",
        "A photo could not be exported. No complete archive was created.",
      );
    }
    return new Uint8Array(await r.data.arrayBuffer());
  },
  remove: async (names) => {
    const r = await admin.storage.from("daily-deck-photos").remove(names);
    if (r.error) {
      throw new Problem(
        503,
        "STORAGE",
        "Deletion is pending. Storage cleanup will retry.",
      );
    }
  },
  deleteIdentity: async (owner) => {
    const before = await admin.auth.admin.getUserById(owner);
    if (before.error) {
      if (
        before.error.code === "user_not_found" && before.error.status === 404
      ) return;
      throw new Problem(
        503,
        "AUTH_DELETE",
        "Deletion is pending. Identity verification will retry.",
      );
    }
    const r = await admin.auth.admin.deleteUser(owner, false);
    if (r.error) {
      throw new Problem(
        503,
        "AUTH_DELETE",
        "Deletion is pending. Identity removal will retry.",
      );
    }
    const after = await admin.auth.admin.getUserById(owner);
    if (
      !(after.error?.code === "user_not_found" && after.error.status === 404)
    ) {
      throw new Problem(
        503,
        "AUTH_DELETE",
        "Identity removal is not confirmed. Deletion will retry.",
      );
    }
  },
});
Deno.serve(createHandler(api, allowed, workerSecret));
