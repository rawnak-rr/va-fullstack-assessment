import http from 'http';
import express from 'express';
import cors from 'cors';
import { startEmulatorWsClient } from './emu-ws';

interface TelemetryReading {
  sensorId: number;
  value: number;
  timestamp: number;
}

interface SensorMetadata {
  sensorId: number;
  sensorName: string;
  unit: string;
}

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

// Default to local emulator when EMULATOR_URL is not provided.
const EMULATOR_URL = process.env.EMULATOR_URL || 'http://localhost:3001';
const EMULATOR_SENSORS_URL = `${EMULATOR_URL.replace(/\/$/, '')}/sensors`;
const latestBySensor = new Map<number, TelemetryReading>();
const SENSOR_CACHE_TTL_MS = 30_000;
let sensorMetadataCache: SensorMetadata[] = [];
let sensorMetadataCachedAt = 0;

const telemetryStats = {
  accepted: 0,
  dropped: 0,
  coerced: 0
};

function normalizeSensorMetadata(payload: unknown): SensorMetadata[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const normalized: SensorMetadata[] = [];

  for (const item of payload) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const data = item as Record<string, unknown>;
    const keys = Object.keys(data);
    const allowedKeys = new Set(['sensorId', 'sensorName', 'unit']);
    if (keys.length !== 3 || keys.some((key) => !allowedKeys.has(key))) {
      return null;
    }

    if (
      typeof data.sensorId !== 'number' ||
      !Number.isSafeInteger(data.sensorId) ||
      data.sensorId <= 0 ||
      typeof data.sensorName !== 'string' ||
      data.sensorName.length === 0 ||
      typeof data.unit !== 'string' ||
      data.unit.length === 0
    ) {
      return null;
    }

    normalized.push({
      sensorId: data.sensorId,
      sensorName: data.sensorName,
      unit: data.unit
    });
  }

  return normalized;
}

async function fetchSensorMetadataFromEmulator(timeoutMs = 3000): Promise<SensorMetadata[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(EMULATOR_SENSORS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Emulator sensors request failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const sensors = normalizeSensorMetadata(payload);
    if (!sensors) {
      throw new Error('Emulator sensors response is invalid');
    }

    return sensors;
  } finally {
    clearTimeout(timer);
  }
}

async function getSensorMetadata(): Promise<SensorMetadata[]> {
  const now = Date.now();
  if (sensorMetadataCache.length > 0 && now - sensorMetadataCachedAt < SENSOR_CACHE_TTL_MS) {
    return sensorMetadataCache;
  }

  try {
    const sensors = await fetchSensorMetadataFromEmulator();
    sensorMetadataCache = sensors;
    sensorMetadataCachedAt = now;
    return sensors;
  } catch (error) {
    if (sensorMetadataCache.length > 0) {
      console.warn('[api] serving stale /sensors cache because emulator request failed');
      return sensorMetadataCache;
    }
    throw error;
  }
}

function coerceNumber(input: unknown): { ok: true; value: number; coerced: boolean } | { ok: false } {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return { ok: true, value: input, coerced: false };
  }

  if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return { ok: true, value: parsed, coerced: true };
    }
  }

  return { ok: false };
}

function normalizeTelemetryPayload(payload: unknown): TelemetryReading | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const keys = Object.keys(data);
  const allowedKeys = new Set(['sensorId', 'value', 'timestamp']);
  if (keys.length !== 3 || keys.some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const sensorIdResult = coerceNumber(data.sensorId);
  const valueResult = coerceNumber(data.value);
  const timestampResult = coerceNumber(data.timestamp);

  if (!sensorIdResult.ok || !valueResult.ok || !timestampResult.ok) {
    return null;
  }

  const sensorId = sensorIdResult.value;
  const value = valueResult.value;
  const timestamp = timestampResult.value;

  if (!Number.isSafeInteger(sensorId) || sensorId <= 0) {
    return null;
  }

  if (timestamp <= 0) {
    return null;
  }

  if (sensorIdResult.coerced || valueResult.coerced || timestampResult.coerced) {
    telemetryStats.coerced += 1;
  }

  return { sensorId, value, timestamp };
}

startEmulatorWsClient({
  emulatorHttpUrl: EMULATOR_URL,
  onTelemetry: (payload) => {
    const reading = normalizeTelemetryPayload(payload);
    if (!reading) {
      telemetryStats.dropped += 1;
      return;
    }

    latestBySensor.set(reading.sensorId, reading);
    telemetryStats.accepted += 1;
  }
});

app.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${EMULATOR_URL.replace(/\/$/, '')}/sensors`);
    if (r.ok) {
      return res.json({ status: 'ok', emulator: true });
    }
  } catch {
    // connection failed
  }
  res.status(503).json({ status: 'unhealthy', emulator: false });
});

app.get('/sensors', async (_req, res) => {
  try {
    const sensors = await getSensorMetadata();
    res.json(sensors);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Failed to fetch sensor metadata';
    res.status(502).json({ reason });
  }
});

app.get('/telemetry/latest', (_req, res) => {
  const readings = Array.from(latestBySensor.values()).sort(
    (a, b) => a.sensorId - b.sensorId
  );
  res.json(readings);
});

app.get('/telemetry/stats', (_req, res) => {
  res.json(telemetryStats);
});

// ---------------------------------------------------------------------------
// Assessment: implement the API below.
// The emulator is a black box: it only outputs data. Its base URL is EMULATOR_URL
// (e.g. http://emulator:3001 with Docker, or http://localhost:3001 locally).
// Emulator exposes only:
//   GET {EMULATOR_URL}/sensors   → static metadata (sensorId, sensorName, unit)
//   WS  {EMULATOR_URL}/ws/telemetry → stream of readings { sensorId, value, timestamp }
// The emulator does not store or serve "latest" readings. You must:
// - Connect to the emulator WebSocket stream.
// - Store the latest value per sensor in the API as readings arrive.
// - Expose your own metadata and "latest telemetry" routes to clients.
// Do not modify the emulator service.
// ---------------------------------------------------------------------------

const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(Number(PORT), HOST, () => {
  console.log(`API server listening on http://${HOST}:${PORT}`);
});
