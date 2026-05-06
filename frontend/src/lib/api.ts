import type { CreatedSweepstake, PortalSweepstake, Sweepstake } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const PARTICIPANT_CODE_CACHE_MS = 2_000;
const participantCodeRequests = new Map<string, { startedAt: number; promise: Promise<Sweepstake> }>();

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
  const normalizedCode = code.trim().toUpperCase();
  const existing = participantCodeRequests.get(normalizedCode);
  const now = Date.now();
  if (existing && now - existing.startedAt < PARTICIPANT_CODE_CACHE_MS) {
    return existing.promise;
  }

  const promise = request<Sweepstake>(`/api/sweepstakes/code/${normalizedCode}`).finally(() => {
    window.setTimeout(() => {
      if (participantCodeRequests.get(normalizedCode)?.promise === promise) {
        participantCodeRequests.delete(normalizedCode);
      }
    }, PARTICIPANT_CODE_CACHE_MS);
  });
  participantCodeRequests.set(normalizedCode, { startedAt: now, promise });
  return promise;
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

export function getPortalSweepstakes(token: string) {
  return request<PortalSweepstake[]>("/api/portal/sweepstakes", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function generatePortalAdminLink(token: string, sweepstakeId: number) {
  return request<{ admin_url: string }>(`/api/portal/sweepstakes/${sweepstakeId}/admin-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function deletePortalSweepstake(token: string, sweepstakeId: number) {
  return request<{ message: string }>(`/api/portal/sweepstakes/${sweepstakeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}
