export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResult(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

export function fromJsonResult(result: { status: number; body: unknown }): Response {
  return jsonResult(result.status, result.body);
}

export function optionsResult(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  const alt = request.headers.get("x-device-token") ?? request.headers.get("X-Device-Token");
  return alt?.trim() || null;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { status: 400 });
  }
}
