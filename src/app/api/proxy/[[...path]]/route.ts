import { NextRequest, NextResponse } from "next/server";
import { LIMITS, VALID_USERNAME_REGEX } from "@/lib/validation";

export const runtime = "edge";

const WORKER_URL = (
  process.env.API_URL || "https://nexvid-proxy.piotrunius.workers.dev"
).replace(/\/+$/, "");

function sanitizeIpCandidate(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "unknown") return null;

  const first = raw.split(",")[0]?.trim() || "";
  if (!first) return null;

  // Handle IPv6 wrapped IPv4, e.g. ::ffff:203.0.113.10
  const normalized = first.startsWith("::ffff:") ? first.slice(7) : first;

  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;

  if (ipv4.test(normalized)) return normalized;
  if (ipv6.test(normalized)) return normalized;
  return null;
}

function getClientIpFromRequest(req: NextRequest): string | null {
  const requestWithIp = req as NextRequest & { ip?: string };
  const candidates = [
    requestWithIp.ip,
    req.headers.get("CF-Connecting-IP"),
    req.headers.get("True-Client-IP"),
    req.headers.get("X-Real-IP"),
    req.headers.get("X-Forwarded-For"),
  ];

  for (const candidate of candidates) {
    const ip = sanitizeIpCandidate(candidate);
    if (ip) return ip;
  }

  return null;
}

function validatePayload(path: string, body: any): string | null {
  if (!body || typeof body !== "object") return null;

  if (path === "auth/register") {
    const { username, password } = body;
    if (typeof username !== "string" || username.trim().length < LIMITS.USERNAME_MIN || username.trim().length > LIMITS.USERNAME_MAX) {
      return `Username must be between ${LIMITS.USERNAME_MIN} and ${LIMITS.USERNAME_MAX} characters`;
    }
    if (!VALID_USERNAME_REGEX.test(username.trim())) {
      return "Username contains invalid characters";
    }
    if (typeof password !== "string" || password.length < LIMITS.PASSWORD_MIN || password.length > LIMITS.PASSWORD_MAX) {
      return `Password must be between ${LIMITS.PASSWORD_MIN} and ${LIMITS.PASSWORD_MAX} characters`;
    }
  }

  if (path === "auth/change-password") {
    const { newPassword } = body;
    if (newPassword && (typeof newPassword !== "string" || newPassword.length < LIMITS.PASSWORD_MIN || newPassword.length > LIMITS.PASSWORD_MAX)) {
      return `New password must be between ${LIMITS.PASSWORD_MIN} and ${LIMITS.PASSWORD_MAX} characters`;
    }
  }

  if (path === "user/feedback" && body.subject && body.message) {
    if (typeof body.subject !== "string" || body.subject.trim().length < LIMITS.FEEDBACK_SUBJECT_MIN || body.subject.trim().length > LIMITS.FEEDBACK_SUBJECT_MAX) {
      return `Subject must be between ${LIMITS.FEEDBACK_SUBJECT_MIN} and ${LIMITS.FEEDBACK_SUBJECT_MAX} characters`;
    }
    if (typeof body.message !== "string" || body.message.trim().length < LIMITS.FEEDBACK_MESSAGE_MIN || body.message.trim().length > LIMITS.FEEDBACK_MESSAGE_MAX) {
      return `Message must be between ${LIMITS.FEEDBACK_MESSAGE_MIN} and ${LIMITS.FEEDBACK_MESSAGE_MAX} characters`;
    }
  }

  if (path === "user/feedback/messages" && body.message) {
    if (typeof body.message !== "string" || body.message.trim().length < LIMITS.FEEDBACK_REPLY_MIN || body.message.trim().length > LIMITS.FEEDBACK_REPLY_MAX) {
      return `Reply must be between ${LIMITS.FEEDBACK_REPLY_MIN} and ${LIMITS.FEEDBACK_REPLY_MAX} characters`;
    }
  }

  if (path === "user/profile" && body.username) {
    if (typeof body.username !== "string" || body.username.trim().length < LIMITS.USERNAME_MIN || body.username.trim().length > LIMITS.USERNAME_MAX) {
      return `Nickname must be between ${LIMITS.USERNAME_MIN} and ${LIMITS.USERNAME_MAX} characters`;
    }
    if (!VALID_USERNAME_REGEX.test(body.username.trim())) {
      return "Nickname contains invalid characters";
    }
  }

  if (path === "admin/surveys" && body.title) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120) {
      return "Survey title must be between 1 and 120 characters";
    }
  }

  if (path === "admin/febbox-tokens" && body.label) {
    if (typeof body.label !== "string" || body.label.length > 50) {
      return "Token label cannot exceed 50 characters";
    }
  }

  return null;
}

export async function ANY(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const { path: pathSegments } = await params;
    const path =
      pathSegments && pathSegments.length > 0 ? pathSegments.join("/") : "proxy";
    const searchParams = req.nextUrl.search;
    const targetUrl = `${WORKER_URL}/${path}${searchParams}`;

    // Read token from the protected cookie
    const cookieToken = req.cookies.get("nexvid_session")?.value;
    const authHeader = req.headers.get("Authorization");

    // Check if the user has a legacy token stored in localstorage
    const isLegacyToken =
      !cookieToken &&
      authHeader &&
      authHeader.startsWith("Bearer ") &&
      authHeader !== "Bearer server-proxy-token";
    const legacyTokenStr = isLegacyToken ? authHeader.substring(7) : null;

    const headers = new Headers(req.headers);
    // Security: Host and Origin must be reset
    headers.set("Host", new URL(WORKER_URL).host);
    headers.delete("Cookie"); // Remove frontend cookies for purity

    // Ensure the original client IP is passed to the worker, even when req.ip is unavailable.
    const clientIp = getClientIpFromRequest(req);
    headers.delete("X-Forwarded-For");
    headers.delete("X-Real-IP");
    if (clientIp) {
      headers.set("X-Forwarded-For", clientIp);
      headers.set("X-Real-IP", clientIp);
      headers.set("CF-Connecting-IP", clientIp);
    }

    if (cookieToken) {
      // Replace the dummy token with the real one from the cookie (new system)
      headers.set("Authorization", `Bearer ${cookieToken}`);
    } else if (!isLegacyToken) {
      // If it's a dummy token or an error, and the cookie is missing - strip the Bearer.
      headers.delete("Authorization");
    } // If isLegacyToken == true, KEEP the old Bearer to help with seamless migration!

    // Proxy request to the Worker
    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: "manual",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const bodyText = await req.text();
      init.body = bodyText;

      // Validate payload before proxying
      const contentType = req.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        try {
          const bodyJson = JSON.parse(bodyText);
          const validationError = validatePayload(path, bodyJson);
          if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
          }
        } catch {
          // Ignore parse errors, let the worker handle malformed JSON if we can't parse it
        }
      }
    }

    const workerResponse = await fetch(targetUrl, init);

    // Clone Worker response
    const responseHeaders = new Headers(workerResponse.headers);

    // [MOD] Seamless Session Migration
    if (isLegacyToken && workerResponse.ok) {
      // If a request with a legacy token was sent and the Worker approved it,
      // reward the user by migrating their session from insecure localStorage to a live Cookie.
      responseHeaders.set("X-Token-Migrated", "server-proxy-token");
      // Control is intercepted here to edit cookies!
    }

    if (
      (path === "auth/login" ||
        path === "auth/register" ||
        path === "auth/change-password") &&
      workerResponse.ok
    ) {
      const data = await workerResponse.json();

      if (data.token) {
        const tokenVal = data.token;
        data.token = "server-proxy-token"; // Dummy - the client gets a safe truncated token "knowing" it is logged in

        const newResponse = NextResponse.json(data, {
          status: workerResponse.status,
          headers: responseHeaders,
        });

        // Set HttpOnly cookie for the entire frontend
        newResponse.cookies.set("nexvid_session", tokenVal, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });

        return newResponse;
      }

      return NextResponse.json(data, {
        status: workerResponse.status,
        headers: responseHeaders,
      });
    }

    // Handle logout
    if (path === "auth/logout") {
      const resp = new NextResponse(workerResponse.body, {
        status: workerResponse.status,
        headers: responseHeaders,
      });
      resp.cookies.delete("nexvid_session");
      return resp;
    }

    // Forward the default response
    const finalResp = new NextResponse(workerResponse.body, {
      status: workerResponse.status,
      statusText: workerResponse.statusText,
      headers: responseHeaders,
    });

    if (isLegacyToken && workerResponse.ok && legacyTokenStr) {
      finalResp.cookies.set("nexvid_session", legacyTokenStr, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return finalResp;
  } catch (err: any) {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}

export const GET = ANY;
export const POST = ANY;
export const PUT = ANY;
export const DELETE = ANY;
export const PATCH = ANY;
