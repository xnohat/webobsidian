export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: 'Method not allowed' },
    { status: 405, headers: { allow: allowed.join(', ') } },
  );
}
