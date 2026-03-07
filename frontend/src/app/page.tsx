'use client';

import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, Environment, OrbitControls, useGLTF } from '@react-three/drei';
import {
  API_BASE_URL,
  fetchHealth,
  fetchLatestTelemetry,
  fetchSensors,
  SensorMetadata,
  TelemetryReading
} from '../lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

type HealthStatus = 'ok' | 'unhealthy' | 'checking';
type SensorStatus = 'normal' | 'out_of_range' | 'unknown';

interface SensorRange {
  min: number;
  max: number;
}

interface RiskNotification {
  sensorId: number;
  sensorName: string;
  valueLabel: string;
  timeLabel: string;
}

const SENSOR_RANGES_BY_NAME: Record<string, SensorRange> = {
  BATTERY_TEMPERATURE: { min: 20, max: 80 },
  MOTOR_TEMPERATURE: { min: 30, max: 120 },
  TYRE_PRESSURE_FL: { min: 150, max: 250 },
  TYRE_PRESSURE_FR: { min: 150, max: 250 },
  TYRE_PRESSURE_RL: { min: 150, max: 250 },
  TYRE_PRESSURE_RR: { min: 150, max: 250 },
  PACK_CURRENT: { min: -300, max: 300 },
  PACK_VOLTAGE: { min: 350, max: 500 },
  PACK_SOC: { min: 0, max: 100 },
  VEHICLE_SPEED: { min: 0, max: 250 },
  STEERING_ANGLE: { min: -180, max: 180 },
  BRAKE_PRESSURE_FRONT: { min: 0, max: 120 }
};

function isOutOfRange(sensorName: string, value: number): boolean {
  const range = SENSOR_RANGES_BY_NAME[sensorName];
  if (!range) {
    return false;
  }
  return value < range.min || value > range.max;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function statusTextClass(status: SensorStatus): string {
  if (status === 'out_of_range') return 'bg-red-500/20 text-red-700 dark:text-red-300';
  if (status === 'normal') return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  return 'bg-muted text-muted-foreground';
}

function F1CarModel() {
  const { scene } = useGLTF('/models/red_bull_racing_rb6.glb');
  const model = useMemo(() => scene.clone(), [scene]);

  return (
    <group rotation={[0, Math.PI, 0]} scale={1.2}>
      <Center>
        <primitive object={model} />
      </Center>
    </group>
  );
}

function CarModelPanel({ riskNotifications }: { riskNotifications: RiskNotification[] }) {
  return (
    <div className="mx-auto w-full max-w-[620px]">
      <div className="relative mx-auto h-[460px] w-full overflow-hidden rounded-xl border border-border bg-slate-900/10">
        <Canvas camera={{ position: [0, 13.2, 1.6], fov: 54 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[6, 8, 5]} intensity={1.2} />
          <Suspense fallback={null}>
            <F1CarModel />
            <Environment preset="city" />
          </Suspense>
          <OrbitControls
            enablePan
            maxPolarAngle={Math.PI * 0.6}
            minPolarAngle={0}
            maxDistance={19}
            minDistance={6.4}
          />
        </Canvas>

        <div className="absolute right-3 top-3 w-[240px] max-w-[80%]">
          <div className="space-y-2">
            {riskNotifications.length === 0 ? (
              <div className="rounded-md border border-emerald-600/60 bg-emerald-500/85 p-2 text-xs font-medium text-white shadow-sm">
                No active risks detected.
              </div>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {riskNotifications.map((risk) => (
                  <div
                    key={risk.sensorId}
                    className="rounded-md border border-red-700/70 bg-red-500/90 p-2 text-xs text-white shadow-md"
                  >
                    <div className="font-semibold">Risk: {risk.sensorName}</div>
                    <div className="mt-0.5 opacity-95">Value: {risk.valueLabel}</div>
                    <div className="opacity-90">At: {risk.timeLabel}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload('/models/red_bull_racing_rb6.glb');

export default function Page() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [sensors, setSensors] = useState<SensorMetadata[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryReading[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        await fetchHealth();
        if (cancelled) return;
        setHealthStatus('ok');
        setHealthError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setHealthStatus('unhealthy');
        setHealthError(e instanceof Error ? e.message : 'Failed to reach API');
      }
    }

    (async () => {
      while (!cancelled) {
        await checkHealth();
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshSensors() {
      try {
        const payload = await fetchSensors();
        if (cancelled) return;
        setSensors(payload);
      } catch (e: unknown) {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : 'Failed to load sensors');
      }
    }

    (async () => {
      while (!cancelled) {
        await refreshSensors();
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshTelemetry() {
      try {
        const payload = await fetchLatestTelemetry();
        if (cancelled) return;
        setLatestTelemetry(payload);
        setDataError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : 'Failed to load telemetry');
      }
    }

    (async () => {
      while (!cancelled) {
        await refreshTelemetry();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const readingBySensorId = useMemo(() => {
    return new Map(latestTelemetry.map((reading) => [reading.sensorId, reading]));
  }, [latestTelemetry]);

  const sensorsWithData = useMemo(() => {
    return sensors
      .map((sensor) => {
        const reading = readingBySensorId.get(sensor.sensorId);
        const status: SensorStatus = reading
          ? isOutOfRange(sensor.sensorName, reading.value)
            ? 'out_of_range'
            : 'normal'
          : 'unknown';
        return { ...sensor, reading, status };
      })
      .sort((a, b) => a.sensorName.localeCompare(b.sensorName));
  }, [sensors, readingBySensorId]);

  const riskNotifications = useMemo(() => {
    return sensorsWithData
      .filter(
        (
          sensor
        ): sensor is SensorMetadata & { reading: TelemetryReading; status: SensorStatus } =>
          sensor.status === 'out_of_range' && Boolean(sensor.reading)
      )
      .sort((a, b) => b.reading.timestamp - a.reading.timestamp)
      .map((sensor) => ({
        sensorId: sensor.sensorId,
        sensorName: sensor.sensorName,
        valueLabel: `${formatValue(sensor.reading.value)} ${sensor.unit}`,
        timeLabel: new Date(sensor.reading.timestamp * 1000).toLocaleTimeString()
      }));
  }, [sensorsWithData]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-darkmode.svg" alt="Spyder" width={32} height={32} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Spyder Telemetry</h1>
              <p className="text-xs text-muted-foreground">
                Vehicle Analytics Fullstack Assessment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              API base: <span className="font-mono">{API_BASE_URL}</span>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                healthStatus === 'ok'
                  ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                  : healthStatus === 'checking'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-destructive/20 text-destructive'
              }`}
            >
              {healthStatus === 'ok'
                ? 'API connected'
                : healthStatus === 'checking'
                  ? 'Checking...'
                  : 'API unreachable'}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        {healthError && healthStatus === 'unhealthy' && (
          <Card className="border-destructive/40 bg-destructive/10 text-destructive-foreground">
            <CardHeader className="py-4">
              <CardTitle className="text-sm">Cannot reach API</CardTitle>
              <CardDescription className="text-xs text-destructive-foreground/80">
                {healthError}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {dataError && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardHeader className="py-4">
              <CardTitle className="text-sm text-amber-700 dark:text-amber-300">
                Data warning
              </CardTitle>
              <CardDescription className="text-xs text-amber-700/80 dark:text-amber-300/80">
                {dataError}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                Vehicle Model
              </CardTitle>
              <CardDescription>
                3D RB6 model with stacked risk notifications. Multiple active risks stack automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CarModelPanel riskNotifications={riskNotifications} />
              <div className="mt-4 flex items-center justify-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/75" />
                  No active risks
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500/80" />
                  Active risk notification
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                Sensor Live Feed
              </CardTitle>
              <CardDescription>
                Latest sample per sensor from <code>/telemetry/latest</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sensorsWithData.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Waiting for metadata and telemetry...
                </div>
              ) : (
                <div className="max-h-[470px] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 font-medium">Sensor</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensorsWithData.map((sensor) => (
                        <tr key={sensor.sensorId} className="border-b border-border/70 last:border-b-0">
                          <td className="px-3 py-2">
                            <div className="font-medium">{sensor.sensorName}</div>
                            <div className="text-xs text-muted-foreground">id: {sensor.sensorId}</div>
                          </td>
                          <td className="px-3 py-2">
                            {sensor.reading
                              ? `${formatValue(sensor.reading.value)} ${sensor.unit}`
                              : 'N/A'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTextClass(sensor.status)}`}>
                              {sensor.status === 'out_of_range'
                                ? 'Out-of-range'
                                : sensor.status === 'normal'
                                  ? 'Normal'
                                  : 'No data'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {sensor.reading
                              ? new Date(sensor.reading.timestamp * 1000).toLocaleTimeString()
                              : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
