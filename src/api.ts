/** An error response from the blok API, with the server's message and error code. */
export class ApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Calls the blok API. Throws ApiError with the server's message when the response isn't ok. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the blok server. Is npm run dev still running?");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `${res.status} ${res.statusText}`, body.code);
  return body as T;
}
