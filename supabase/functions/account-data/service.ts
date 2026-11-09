import { bytes, sha256, tar } from "./archive.ts";
export class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public pending?: { request_id: string; owner_id: string },
  ) {
    super(message);
  }
}
export type Job = {
  owner_id: string;
  request_id: string;
  token_hash: string;
  stage: "storage" | "app" | "auth" | "complete";
  created_at: string;
  completed_at?: string;
};
export type Identity = {
  id: string;
  email?: string;
  created_at?: string;
  email_confirmed_at?: string;
  app_metadata?: { providers?: string[] };
  user_metadata?: Record<string, unknown>;
};
export type Dependencies = {
  verify: (token: string) => Promise<Identity>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<any>;
  download: (name: string) => Promise<Uint8Array>;
  remove: (names: string[]) => Promise<void>;
  deleteIdentity: (owner: string) => Promise<void>;
  now?: () => number;
  uuid?: () => string;
};
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function account(u: Identity) {
  return {
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    providers: (u.app_metadata?.providers ?? []).filter((p) =>
      ["email", "google", "apple"].includes(p)
    ),
    name: typeof u.user_metadata?.full_name === "string"
      ? u.user_metadata.full_name.slice(0, 500)
      : null,
  };
}
/** Never use iat: refreshed old sessions have a recent iat but old authentication. */
export function recentAuthentication(
  token: string,
  owner: string,
  now: number,
) {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.sub === owner && payload.role === "authenticated" &&
      Array.isArray(payload.amr) && payload.amr.some((v: any) =>
        ["password", "oauth"].includes(v.method) &&
        Number.isFinite(v.timestamp) && v.timestamp <= now / 1000 + 30 &&
        v.timestamp >= now / 1000 - 300
      );
  } catch {
    return false;
  }
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let n = 0; n < Math.max(a.length, b.length); n++) {
    diff |= (a.charCodeAt(n) || 0) ^ (b.charCodeAt(n) || 0);
  }
  return diff === 0;
}
export function service(d: Dependencies) {
  const now = d.now ?? Date.now, random = d.uuid ?? (() => crypto.randomUUID());
  async function exportData(token: string, expectedOwner?: string) {
    const user = await d.verify(token),
      identity = account(user),
      snapshot = await d.rpc("daily_deck_account_export", { p_owner: user.id });
    if (
      (expectedOwner !== undefined && expectedOwner !== user.id) ||
      snapshot?.owner_id !== user.id
    ) throw new Problem(403, "OWNER", "Account changed.");
    const records = bytes(
      JSON.stringify(
        {
          format: "daily-deck-account",
          version: 1,
          account: identity,
          data: snapshot,
        },
        null,
        2,
      ),
    );
    if (records.length > 64 * 1024 * 1024) {
      throw new Problem(
        413,
        "EXPORT_LIMIT",
        "Account records exceed the automatic export limit. No partial export was created.",
      );
    }
    let total = records.length;
    const files: { name: string; data: Uint8Array }[] = [{
        name: "account.json",
        data: records,
      }],
      manifest: any[] = [];
    if (!Array.isArray(snapshot.files)) {
      throw new Problem(503, "EXPORT", "Storage manifest is unavailable.");
    }
    const names = new Set<string>();
    for (const f of snapshot.files) {
      if (
        typeof f.name !== "string" || !f.name.startsWith(user.id + "/") ||
        !new RegExp(
          "^" + user.id +
            "/[a-f0-9-]{36}/(original\\.(png|jpg|jpeg|webp|avif)|card\\.jpg)$",
          "i",
        ).test(f.name) || names.has(f.name)
      ) {
        throw new Problem(
          422,
          "EXPORT",
          "Unexpected photo path. No complete export was created.",
        );
      }
      names.add(f.name);
      const length = Number(f.metadata?.size);
      if (!Number.isSafeInteger(length) || length < 1 || length > 20971520) {
        throw new Problem(422, "EXPORT", "Photo size metadata is invalid.");
      }
      total += length;
      if (total > 64 * 1024 * 1024) {
        throw new Problem(
          413,
          "EXPORT_LIMIT",
          "This account exceeds the 64 MiB automatic export limit. No partial export was downloaded. Use the documented operator export procedure.",
        );
      }
      const data = await d.download(f.name);
      if (data.length !== length) {
        throw new Problem(
          503,
          "EXPORT",
          "A photo is missing or incomplete. Retry export.",
        );
      }
      const name = "photos/" + f.name.slice(user.id.length + 1);
      files.push({ name, data });
      manifest.push({
        path: name,
        bytes: data.length,
        sha256: await sha256(data),
      });
    }
    const lengths = new Map(
      snapshot.files.map((f: any) => [f.name, Number(f.metadata?.size)]),
    );
    for (const p of snapshot.daily_deck_photos ?? []) {
      if (
        !names.has(p.source_path) || !names.has(p.rendered_path) ||
        lengths.get(p.source_path) !== p.source_bytes ||
        lengths.get(p.rendered_path) !== p.rendered_bytes
      ) {
        throw new Problem(
          503,
          "EXPORT",
          "A registered photo is incomplete. Retry or contact the operator; no complete archive was created.",
        );
      }
    }
    const final = await d.rpc("daily_deck_account_export", {
        p_owner: user.id,
      }),
      verified = account(await d.verify(token));
    if (
      JSON.stringify(final) !== JSON.stringify(snapshot) ||
      JSON.stringify(verified) !== JSON.stringify(identity)
    ) {
      throw new Problem(
        409,
        "EXPORT_CHANGED",
        "Account data changed during export. Retry for a consistent archive.",
      );
    }
    files.push({
      name: "manifest.json",
      data: bytes(JSON.stringify(
        {
          format: "daily-deck-account",
          version: 1,
          complete: true,
          exported_at: new Date(now()).toISOString(),
          owner_id: user.id,
          restorable: false,
          files: [{
            path: "account.json",
            bytes: records.length,
            sha256: await sha256(records),
          }, ...manifest],
        },
        null,
        2,
      )),
    });
    files.push({
      name: "README.txt",
      data: bytes(
        "Daily Deck account export v1. account.json contains structured account records; photos/ contains original and cropped files. manifest.json contains checksums. Credentials, sessions, deletion recovery capabilities and other accounts are excluded. This archive has no supported import/restore path. Original photos are the normalized sources stored by Daily Deck, not original camera metadata. No local guest data was uploaded or included.\n",
      ),
    });
    const body = tar(files);
    return { body, digest: await sha256(body) };
  }
  async function advance(requestId: string) {
    const lease = random(),
      job: Job | null = await d.rpc("daily_deck_delete_claim", {
        p_request: requestId,
        p_lease: lease,
      });
    if (!job) return { complete: false, request_id: requestId, state: "busy" };
    if (job.stage === "complete") {
      return { complete: true, request_id: requestId, owner_id: job.owner_id };
    }
    let j = job;
    try {
      if (j.stage === "storage") {
        const files: string[] = await d.rpc("daily_deck_delete_files", {
          p_request: requestId,
        });
        if (
          !Array.isArray(files) ||
          files.some((n) =>
            !n.startsWith(j.owner_id + "/") || n.split("/").some((part) =>
              part === ".." || part === "."
            ) || n.includes("\\")
          )
        ) throw new Problem(500, "OWNER", "Invalid deletion manifest.");
        // Bounded per invocation; persisted state + scheduled worker finish large jobs.
        for (let n = 0; n < Math.min(files.length, 500); n += 100) {
          await d.remove(files.slice(n, n + 100));
        }
        if (
          (await d.rpc("daily_deck_delete_files", { p_request: requestId }))
            .length
        ) return { complete: false, request_id: requestId, state: "storage" };
        j = await d.rpc("daily_deck_delete_step", {
          p_request: requestId,
          p_lease: lease,
          p_next: "app",
        });
      }
      if (j.stage === "app") {
        j = await d.rpc("daily_deck_delete_step", {
          p_request: requestId,
          p_lease: lease,
          p_next: "auth",
        });
      }
      if (j.stage === "auth") {
        await d.deleteIdentity(j.owner_id);
        j = await d.rpc("daily_deck_delete_step", {
          p_request: requestId,
          p_lease: lease,
          p_next: "complete",
        });
      }
      return {
        complete: j.stage === "complete",
        request_id: requestId,
        owner_id: j.owner_id,
        state: j.stage,
      };
    } finally {
      await d.rpc("daily_deck_delete_release", {
        p_request: requestId,
        p_lease: lease,
      }).catch(() => {});
    }
  }
  async function deletion(body: any, token: string) {
    if (
      !uuid.test(body.request_id ?? "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.resume_token ?? "")
    ) throw new Problem(400, "INPUT", "Invalid deletion recovery request.");
    const hash = await sha256(bytes(body.resume_token)),
      existing: Job | null = await d.rpc("daily_deck_delete_job", {
        p_request: body.request_id,
      });
    let authorizedOwner: string;
    if (existing) {
      authorizedOwner = existing.owner_id;
      if (existing.request_id !== body.request_id) {
        throw new Problem(
          503,
          "RECOVERY",
          "Deletion status ownership could not be verified.",
        );
      }
      if (
        !equal(existing.token_hash, hash) ||
        (existing.stage === "complete" &&
          now() - Date.parse(existing.completed_at ?? existing.created_at) >
            24 * 3600_000)
      ) {
        throw new Problem(
          403,
          "RECOVERY",
          "Deletion recovery expired or is unavailable. The operator worker can finish the existing request.",
        );
      }
    } else {
      if (body.confirm !== true) {
        throw new Problem(
          404,
          "NO_JOB",
          "No authorized deletion job was found. Sign in and confirm deletion again; completion was not established.",
        );
      }
      const user = await d.verify(token);
      if (body.expected_owner !== user.id) {
        throw new Problem(
          403,
          "OWNER",
          "The account changed. Confirm deletion again for the intended account.",
        );
      }
      // Both tokens are verified by Auth before inspecting signed AMR claims.
      const proof = typeof body.reauth_token === "string"
          ? body.reauth_token
          : token,
        verified = await d.verify(proof);
      if (
        verified.id !== user.id || !recentAuthentication(proof, user.id, now())
      ) {
        throw new Problem(
          403,
          "REAUTH",
          "Sign in again to the same account using email/password or Google within five minutes, then confirm deletion.",
        );
      }
      authorizedOwner = user.id;
      await d.rpc("daily_deck_delete_begin", {
        p_owner: user.id,
        p_request: body.request_id,
        p_hash: hash,
      });
    }
    try {
      return { ...await advance(body.request_id), owner_id: authorizedOwner };
    } catch (e) {
      throw new Problem(
        503,
        "DELETE_PENDING",
        e instanceof Problem
          ? e.message
          : "Deletion is pending. The worker will retry unfinished steps.",
        { request_id: body.request_id, owner_id: authorizedOwner },
      );
    }
  }
  async function worker() {
    const ids: string[] = await d.rpc("daily_deck_delete_queue");
    const outcomes = [];
    for (const id of ids) {
      try {
        {
          const r = await advance(id);
          outcomes.push({
            request_id: r.request_id,
            complete: r.complete,
            state: r.state ?? "complete",
          });
        }
      } catch {
        outcomes.push({
          request_id: id,
          complete: false,
          state: "retry_required",
        });
      }
    }
    return outcomes;
  }
  return { exportData, deletion, worker, advance };
}
