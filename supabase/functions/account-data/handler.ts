import { Problem, service } from "./service.ts";
export function createHandler(
  api: ReturnType<typeof service>,
  allowed: Set<string>,
  workerSecret: string,
) {
  return async (request: Request): Promise<Response> => {
    const supplied = request.headers.get("x-daily-deck-worker-secret") ?? "";
    let difference = supplied.length ^ workerSecret.length;
    for (let n = 0; n < Math.max(supplied.length, workerSecret.length); n++) {
      difference |= (supplied.charCodeAt(n) || 0) ^
        (workerSecret.charCodeAt(n) || 0);
    }
    const origin = request.headers.get("origin"), worker = difference === 0;
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Expose-Headers": "X-Archive-SHA256,Content-Disposition",
      "X-Content-Type-Options": "nosniff",
    };
    if (origin && allowed.has(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    if (!worker && (!origin || !allowed.has(origin))) {
      return new Response("Origin not permitted", { status: 403, headers });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }
    try {
      if (
        !request.headers.get("content-type")?.startsWith("application/json")
      ) throw new Problem(400, "INPUT", "JSON is required.");
      let raw = "", size = 0;
      const reader = request.body?.getReader(), decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 16000) {
            await reader.cancel();
            throw new Problem(413, "INPUT", "Request too large.");
          }
          raw += decoder.decode(part.value, { stream: true });
        }
      }
      raw += decoder.decode();

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new Problem(400, "INPUT", "Invalid JSON.");
      }
      const token = (request.headers.get("authorization") ?? "").replace(
        /^Bearer /i,
        "",
      );
      if (
        !body || typeof body !== "object" || Object.keys(body).some((k) =>
          ![
            "action",
            "expected_owner",
            "request_id",
            "resume_token",
            "reauth_token",
            "confirm",
          ].includes(k)
        )
      ) throw new Problem(400, "INPUT", "Unsupported account request.");
      let result;
      if (body.action === "worker") {
        if (!worker) throw new Problem(403, "AUTH", "Not authorized.");
        const outcomes = await api.worker();
        result = {
          processed: outcomes.length,
          complete: outcomes.filter((r) => r.complete).length,
          pending: outcomes.filter((r) => !r.complete).length,
        };
      } else if (body.action === "export") {
        const archive = await api.exportData(token, body.expected_owner);
        return new Response(archive.body as BodyInit, {
          headers: {
            ...headers,
            "Content-Type": "application/x-tar",
            "Content-Length": String(archive.body.length),
            "Content-Disposition":
              'attachment; filename="daily-deck-account-v1.tar"',
            "X-Archive-SHA256": archive.digest,
          },
        });
      } else if (body.action === "delete") {
        result = await api.deletion(body, token);
      } else throw new Problem(400, "INPUT", "Unknown account operation.");
      return Response.json(result, {
        status:
          body.action === "delete" && !Array.isArray(result) && !result.complete
            ? 202
            : 200,
        headers,
      });
    } catch (error) {
      const p = error instanceof Problem ? error : new Problem(
        503,
        "RETRY",
        "Account operation could not be confirmed. Keep the recovery request and retry.",
      );
      return Response.json({
        code: p.code,
        message: p.message,
        ...(p.pending ? { deletion_pending: p.pending } : {}),
      }, { status: p.status, headers });
    }
  };
}
