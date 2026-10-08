import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { Config } from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
let cachedConfig: Config | undefined;
let guestPromise: Promise<string> | undefined;

export async function getConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;
  const response = await fetch(`${API}/api/config`, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Backend unavailable. Start Docker Compose or the native launcher.",
    );
  cachedConfig = await response.json();
  return cachedConfig!;
}

function firebase(config: Config) {
  const app = getApps().length ? getApp() : initializeApp(config.firebase);
  return getAuth(app);
}

export async function login(google = false) {
  const config = await getConfig();
  if (config.mode === "demo") return token();
  const auth = firebase(config);
  await auth.authStateReady();
  const result = google
    ? auth.currentUser?.isAnonymous
      ? await linkWithPopup(auth.currentUser, new GoogleAuthProvider())
      : await signInWithPopup(auth, new GoogleAuthProvider())
    : auth.currentUser
      ? { user: auth.currentUser }
      : await signInAnonymously(auth);
  return result.user.getIdToken();
}

async function token(): Promise<string> {
  const config = await getConfig();
  if (config.mode === "live") {
    const auth = firebase(config);
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    return auth.currentUser!.getIdToken();
  }
  const current = localStorage.getItem("pitchgrill-guest");
  if (current) return current;
  if (!guestPromise)
    guestPromise = fetch(`${API}/api/auth/guest`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Guest sign-in failed. Retry in a moment.");
        const session = await response.json();
        localStorage.setItem("pitchgrill-guest", session.token);
        return session.token as string;
      })
      .finally(() => {
        guestPromise = undefined;
      });
  return guestPromise;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const authorization = `Bearer ${await token()}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  headers.set("Authorization", authorization);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (response.status === 401 && retry) {
    const config = await getConfig();
    if (config.mode === "demo") localStorage.removeItem("pitchgrill-guest");
    else {
      const auth = firebase(config);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);
    }
    return api(path, init, false);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail
              .map(
                (item: { msg: string; loc: string[] }) =>
                  `${item.loc?.slice(1).join(".")}: ${item.msg}`,
              )
              .join("; ")
          : response.statusText;
    throw new Error(detail || "Request failed; retry in a moment.");
  }
  return response.json();
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!response.ok)
    throw new Error("Export failed. Wait for the report and retry.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function logout() {
  const config = await getConfig();
  if (config.mode === "live") await signOut(firebase(config));
  localStorage.removeItem("pitchgrill-guest");
}

export function post<T>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function audioRequest(
  path: string,
  body: Blob | { text: string; investor: string },
) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": body instanceof Blob ? "audio/webm" : "application/json",
    },
    body: body instanceof Blob ? body : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      "Google voice is unavailable. Choose browser voice or continue typing.",
    );
  return response;
}

export async function progressStream(
  path: string,
  onProgress: (value: unknown) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error("Progress stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events)
      if (event.startsWith("data: ")) onProgress(JSON.parse(event.slice(6)));
  }
}
