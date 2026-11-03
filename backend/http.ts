export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Cookie',
      ...extra,
    },
  });
}
export function redirect(location: string, cookie?: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}
export function sameOrigin(request: Request, origin: string): void {
  if (
    request.headers.get('Origin') !== origin ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  )
    throw new HttpError(403, 'request_origin_denied');
}
