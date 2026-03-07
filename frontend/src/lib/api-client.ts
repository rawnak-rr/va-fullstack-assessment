/**
 * API client for the Vehicle Analytics backend.
 * The backend API surface is designed by you in the fullstack assessment (va-fullstack-assessment).
 * The only guaranteed endpoint is GET /health. You must add functions that call your
 * metadata and data routes (paths and response shapes are up to your API design).
 */

export interface SensorMetadata {
  sensorId: number;
  sensorName: string;
  unit: string;
}

export interface TelemetryReading {
  sensorId: number;
  value: number;
  timestamp: number;
}

export interface HealthResponse {
  status: string;
  emulator?: boolean;
  reason?: string;
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchHealth(timeoutMs = 3000): Promise<HealthResponse> {
  const url = `${API_BASE_URL}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.reason ?? `Health: ${res.status} ${res.statusText}`);
    }
    return data as HealthResponse;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Health check timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(path: string, timeoutMs = 3000): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason =
        data && typeof data === 'object' && 'reason' in data
          ? String((data as { reason: unknown }).reason)
          : `${res.status} ${res.statusText}`;
      throw new Error(`${path}: ${reason}`);
    }
    return data as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`${path} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchSensors(timeoutMs = 3000): Promise<SensorMetadata[]> {
  return fetchJson<SensorMetadata[]>('/sensors', timeoutMs);
}

export function fetchLatestTelemetry(timeoutMs = 3000): Promise<TelemetryReading[]> {
  return fetchJson<TelemetryReading[]>('/telemetry/latest', timeoutMs);
}
