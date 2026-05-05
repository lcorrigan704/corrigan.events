import type { CreatedSweepstake, Sweepstake } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    const detail = body.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => `${item.loc?.join(".") ?? "field"}: ${item.msg}`).join("; ")
      : typeof detail === "string"
        ? detail
        : "Request failed";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function createSweepstake(payload: unknown) {
  return request<CreatedSweepstake>("/api/sweepstakes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getByCode(code: string) {
  return request<Sweepstake>(`/api/sweepstakes/code/${code.trim().toUpperCase()}`);
}

export function getAdmin(token: string) {
  return request<Sweepstake>("/api/admin/sweepstake", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function updateAdminParticipants(token: string, participants: unknown) {
  return request<Sweepstake>("/api/admin/participants", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ participants })
  });
}

export function updateAdminSettings(token: string, payload: unknown) {
  return request<Sweepstake>("/api/admin/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export function publishSweepstake(token: string) {
  return request<Sweepstake>("/api/admin/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export type AdminLinkRecovery = {
  message: string;
  sent_count: number;
  dev_links: { title: string; admin_url: string; view_code: string }[];
};

export function requestAdminLinks(email: string) {
  return request<AdminLinkRecovery>("/api/admin/forgot-link", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}
