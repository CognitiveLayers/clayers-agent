import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  CLAYERS_RUNNER: DurableObjectNamespace<ClayersRunnerContainer>;
  API_TOKEN?: string;
}

/**
 * Container-enabled Durable Object that owns a Clayers runner process.
 *
 * The Worker handles public HTTP concerns. This class boots and proxies to the
 * container image defined in wrangler.json, where Git and the Clayers CLI can
 * run with a normal filesystem.
 */
export class ClayersRunnerContainer extends Container {
  defaultPort = 8787;
  sleepAfter = "10m";
  enableInternet = true;
  pingEndpoint = "localhost/health";
  envVars = {
    HOST: "0.0.0.0",
    PORT: "8787",
    CLAYERS_ORCHESTRATOR_ALLOW_LOCAL_PATHS: "0"
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "clayers-orchestrator-worker" });
    }

    if (!isApiRoute(url.pathname)) {
      return json({ error: "not found" }, 404);
    }

    const auth = authorize(request, env);
    if (auth) return auth;

    const runnerName = selectRunnerName(request);
    const runner = getContainer(env.CLAYERS_RUNNER, runnerName);
    const response = await runner.fetch(request);
    return withCors(response);
  }
};

function isApiRoute(pathname: string): boolean {
  return pathname === "/v1/jobs" || /^\/v1\/jobs\/[^/]+(?:\/events)?$/.test(pathname);
}

function selectRunnerName(_request: Request): string {
  // One warm runner is enough for the first hosted slice. This can later shard
  // by account or repository to isolate job workspaces.
  return "default";
}

function authorize(request: Request, env: Env): Response | null {
  if (!env.API_TOKEN) return null;
  const expected = `Bearer ${env.API_TOKEN}`;
  if (request.headers.get("authorization") === expected) return null;
  return json({ error: "unauthorized" }, 401);
}

function json(body: unknown, status = 200): Response {
  return withCors(new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  }));
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
