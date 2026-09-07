/**
 * Fetch this app's /api/* routes in-process when the target URL is the same host.
 *
 * Azure App Service often fails when the Node process HTTP-fetches its own public
 * hostname (HTML login page) or loopback (ECONNREFUSED). Compare and write-test
 * proxies use this instead.
 */
import type { IncomingHttpHeaders } from "http";
import type { NextApiRequest, NextApiResponse } from "next";
import { isSameHostUrl } from "~/server/utils/same-host-loopback";

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

type RouteResolution = {
  loadHandler: () => Promise<{ default: ApiHandler }>;
  pathParams: Record<string, string | string[]>;
};

export type ApiFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type ApiFetchResult = {
  ok: boolean;
  status: number;
  text: string;
};

const OCCUPATION_HANDLERS: Record<string, () => Promise<{ default: ApiHandler }>> = {
  authorities: () => import("~/pages/api/reporting/occupation/authorities"),
  contractors: () => import("~/pages/api/reporting/occupation/contractors"),
  dynamic: () => import("~/pages/api/reporting/occupation/dynamic"),
  dynamicdata: () => import("~/pages/api/reporting/occupation/dynamicdata"),
  organisations: () => import("~/pages/api/reporting/occupation/organisations"),
  static: () => import("~/pages/api/reporting/occupation/static"),
  staticdata: () => import("~/pages/api/reporting/occupation/staticdata"),
  surveys: () => import("~/pages/api/reporting/occupation/surveys"),
};

function resolveInternalApiRoute(pathname: string): RouteResolution | null {
  if (pathname === "/api/fms/v4/servertime") {
    return { loadHandler: () => import("~/pages/api/fms/v4/servertime"), pathParams: {} };
  }
  if (pathname === "/api/fms/v4/biketypes") {
    return { loadHandler: () => import("~/pages/api/fms/v4/biketypes"), pathParams: {} };
  }
  if (pathname === "/api/fms/v4/paymenttypes") {
    return { loadHandler: () => import("~/pages/api/fms/v4/paymenttypes"), pathParams: {} };
  }
  if (pathname === "/api/fms/v4/clienttypes") {
    return { loadHandler: () => import("~/pages/api/fms/v4/clienttypes"), pathParams: {} };
  }

  const fmsCitycodesMatch = pathname.match(/^\/api\/fms\/v4\/citycodes(?:\/(.*))?$/);
  if (fmsCitycodesMatch) {
    const rest = fmsCitycodesMatch[1];
    const path = rest ? rest.split("/").filter(Boolean) : [];
    return {
      loadHandler: () => import("~/pages/api/fms/v4/citycodes/[[...path]]"),
      pathParams: { path },
    };
  }

  const reportingTxMatch = pathname.match(
    /^\/api\/reporting\/citycodes\/([^/]+)\/locations\/([^/]+)\/transactions$/
  );
  if (reportingTxMatch) {
    return {
      loadHandler: () =>
        import("~/pages/api/reporting/citycodes/[citycode]/locations/[location]/transactions"),
      pathParams: { citycode: reportingTxMatch[1]!, location: reportingTxMatch[2]! },
    };
  }

  const occupationMatch = pathname.match(/^\/api\/reporting\/occupation\/([^/]+)$/);
  if (occupationMatch) {
    const endpoint = occupationMatch[1]!;
    const loader = OCCUPATION_HANDLERS[endpoint];
    if (loader) {
      return { loadHandler: loader, pathParams: {} };
    }
  }

  return null;
}

function buildQuery(
  url: URL,
  pathParams: Record<string, string | string[]>
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = { ...pathParams };
  url.searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
      return;
    }
    query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  });
  return query;
}

function parseRequestBody(body: string | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function createMockResponse(): {
  res: NextApiResponse;
  getResult: () => ApiFetchResult;
} {
  let statusCode = 200;
  let responseBody = "";
  let ended = false;
  const responseHeaders: Record<string, string | string[]> = {};

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | string[]) {
      responseHeaders[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      const value = responseHeaders[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    get headersSent() {
      return ended;
    },
    json(body: unknown) {
      if (!responseHeaders["content-type"]) {
        responseHeaders["content-type"] = "application/json; charset=utf-8";
      }
      responseBody = JSON.stringify(body);
      ended = true;
      return res;
    },
    send(body: unknown) {
      responseBody = typeof body === "string" ? body : JSON.stringify(body);
      ended = true;
      return res;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined && chunk !== null) {
        responseBody = typeof chunk === "string" ? chunk : String(chunk);
      }
      ended = true;
      return res;
    },
  } as unknown as NextApiResponse;

  return {
    res,
    getResult: () => ({
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      text: responseBody,
    }),
  };
}

async function invokeInternalApi(url: string, init: ApiFetchInit): Promise<ApiFetchResult> {
  const parsed = new URL(url);
  const route = resolveInternalApiRoute(parsed.pathname);
  if (!route) {
    throw new Error(`Same-host API route not registered: ${parsed.pathname}`);
  }

  const headers: Record<string, string | string[] | undefined> = {};
  if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      headers[key.toLowerCase()] = value;
    }
  }

  const req = {
    method: init.method ?? "GET",
    headers,
    query: buildQuery(parsed, route.pathParams),
    body: parseRequestBody(init.body),
    url: parsed.pathname + parsed.search,
  } as NextApiRequest;

  const { res, getResult } = createMockResponse();
  const mod = await route.loadHandler();
  try {
    await mod.default(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error(`Internal API invoke failed (${parsed.pathname}):`, err);
    return { ok: false, status: 500, text: JSON.stringify({ status: 0, message }) };
  }

  return getResult();
}

export function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "Fetch failed";
  const parts = [err.message];
  const cause = err.cause;
  if (cause instanceof Error && cause.message && cause.message !== err.message) {
    parts.push(`(${cause.message})`);
  } else if (cause && typeof cause === "object" && "code" in cause) {
    parts.push(`(${String((cause as NodeJS.ErrnoException).code)})`);
  }
  return parts.join(" ");
}

/**
 * Fetch an API URL. Same-host /api/* routes are invoked in-process; other hosts use fetch().
 */
export async function fetchApiUrl(
  url: string,
  init: ApiFetchInit = {},
  incomingHeaders: IncomingHttpHeaders = {}
): Promise<ApiFetchResult> {
  if (isSameHostUrl(url, incomingHeaders)) {
    return invokeInternalApi(url, init);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
