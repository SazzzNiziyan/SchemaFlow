/**
 * JSON POST helper for the SchemaFlow API.
 *
 * Never calls `response.json()` blindly: if something other than our API
 * answers (a hosting proxy's HTML timeout page, the SPA fallback, an empty
 * reply), the user gets an explanation instead of
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 */

function hintForStatus(status: number): string {
  if (status === 502 || status === 503 || status === 504 || status === 524) {
    return 'The request was cut off before the API answered (usually a proxy timeout while the AI model was slow). Please try again.';
  }
  if (status === 404 || status === 405) {
    return 'The API route was not found. Start the app with `npm run dev` (Express + Vite), not `vite` or `vite preview`.';
  }
  if (status === 413) return 'The request was too large for the server.';
  return 'Check the server logs for details.';
}

export async function postJson<T extends Record<string, unknown>>(
  url: string,
  body: unknown,
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new Error('Could not reach the SchemaFlow server. Is it running (`npm run dev`)?');
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!data || typeof data !== 'object') {
    const kind = /<!doctype html|<html/i.test(text) ? 'an HTML page' : text ? 'a non-JSON reply' : 'an empty reply';
    throw new Error(`The server returned ${kind} (HTTP ${res.status}) instead of JSON. ${hintForStatus(res.status)}`);
  }

  const json = data as T & { success?: boolean; error?: string };
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed (HTTP ${res.status}). ${hintForStatus(res.status)}`);
  }
  return json;
}
