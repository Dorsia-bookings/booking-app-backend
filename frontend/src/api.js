// Talks to the Dorsia server. All addresses are relative, so the app works on
// whatever web address it's hosted at.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// The Dorsia master login is saved under this name.
export const PLATFORM = "__platform";

export function makeApi(slug, getToken, onUnauthorized) {
  return makeApiAt(`/api/${encodeURIComponent(slug)}`, getToken, onUnauthorized);
}

export function makeApiAt(base, getToken, onUnauthorized) {
  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken && getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError("Can't reach the server. Check your internet connection.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && onUnauthorized) onUnauthorized();
      throw new ApiError(data.error || `Something went wrong (${res.status})`, res.status);
    }
    return data;
  }
  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    del: (path) => request("DELETE", path),
  };
}

// Saved login, kept in this browser only.
const tokenKey = (slug) => `dorsia-login-${slug}`;
export function loadToken(slug) {
  try {
    return localStorage.getItem(tokenKey(slug));
  } catch {
    return null;
  }
}
export function saveToken(slug, token) {
  try {
    if (token) localStorage.setItem(tokenKey(slug), token);
    else localStorage.removeItem(tokenKey(slug));
  } catch {
    /* storage unavailable: login lasts until the page is closed */
  }
}
