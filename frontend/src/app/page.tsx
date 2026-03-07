'use client';

import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, Environment, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
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

interface StabilityPoint {
  timestamp: number;
  score: number;
  warnings: number;
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

const SENSOR_LABELS: Record<string, string> = {
  BATTERY_TEMPERATURE: 'Battery Temp',
  MOTOR_TEMPERATURE: 'Motor Temp',
  TYRE_PRESSURE_FL: 'Tire Pressure FL',
  TYRE_PRESSURE_FR: 'Tire Pressure FR',
  TYRE_PRESSURE_RL: 'Tire Pressure RL',
  TYRE_PRESSURE_RR: 'Tire Pressure RR',
  PACK_CURRENT: 'Pack Current',
  PACK_VOLTAGE: 'Pack Voltage',
  PACK_SOC: 'Pack SOC',
  VEHICLE_SPEED: 'Vehicle Speed',
  STEERING_ANGLE: 'Steering Angle',
  BRAKE_PRESSURE_FRONT: 'Brake Pressure Front'
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

function displaySensorName(sensorName: string): string {
  return SENSOR_LABELS[sensorName] ?? sensorName.replaceAll('_', ' ');
}

const F1_GLTF_PATH = '/models/red_bull_racing_rb6_gltf/scene.gltf';
const TYRE_MESH_NODE = 'Object_4';
const TYRE_MESH_MATCH = TYRE_MESH_NODE.toLowerCase();
const STEERING_MESH_NODE = 'Object_2';
const STEERING_MESH_MATCH = STEERING_MESH_NODE.toLowerCase();

function makeDebugMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: '#ff1f1f',
    emissive: '#7a0000',
    emissiveIntensity: 1.1,
    metalness: 0.1,
    roughness: 0.6
  });
}

function F1CarModel({
  highlightTyres,
  highlightSteering
}: {
  highlightTyres: boolean;
  highlightSteering: boolean;
}) {
  const { scene } = useGLTF(F1_GLTF_PATH);
  const model = useMemo(() => {
    const cloned = scene.clone(true);

    if (!highlightTyres && !highlightSteering) {
      return cloned;
    }

    cloned.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const meshName = (mesh.name ?? '').toLowerCase();
      if (!mesh.isMesh) {
        return;
      }

      const isTyreMesh = meshName === TYRE_MESH_MATCH || meshName.includes(TYRE_MESH_MATCH);
      const isSteeringMesh =
        meshName === STEERING_MESH_MATCH || meshName.includes(STEERING_MESH_MATCH);

      if (highlightTyres && isTyreMesh) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(() => makeDebugMaterial());
        } else if (mesh.material) {
          mesh.material = makeDebugMaterial();
        }
      } else if (highlightSteering && isSteeringMesh) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(() => makeDebugMaterial());
        } else if (mesh.material) {
          mesh.material = makeDebugMaterial();
        }
      }
    });

    return cloned;
  }, [highlightSteering, highlightTyres, scene]);

  return (
    <group rotation={[0, Math.PI, 0]} scale={1.2}>
      <Center>
        <primitive object={model} />
      </Center>
    </group>
  );
}

function CarModelPanel({
  highlightTyres,
  highlightSteering
}: {
  highlightTyres: boolean;
  highlightSteering: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="relative mx-auto h-[360px] w-full overflow-hidden rounded-xl border border-border bg-slate-900/10">
        <Canvas camera={{ position: [0, 18.8, 2.3], fov: 54 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[6, 8, 5]} intensity={1.2} />
          <Suspense fallback={null}>
            <F1CarModel
              highlightTyres={highlightTyres}
              highlightSteering={highlightSteering}
            />
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
      </div>
    </div>
  );
}

useGLTF.preload(F1_GLTF_PATH);

export default function Page() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [sensors, setSensors] = useState<SensorMetadata[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryReading[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [stabilityHistory, setStabilityHistory] = useState<StabilityPoint[]>([]);

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
        sensorName: displaySensorName(sensor.sensorName),
        valueLabel: `${formatValue(sensor.reading.value)} ${sensor.unit}`,
        timeLabel: new Date(sensor.reading.timestamp * 1000).toLocaleTimeString()
      }));
  }, [sensorsWithData]);

  const hasTyreRisk = useMemo(() => {
    return sensorsWithData.some(
      (sensor) =>
        sensor.sensorName.startsWith('TYRE_PRESSURE_') && sensor.status === 'out_of_range'
    );
  }, [sensorsWithData]);

  const hasSteeringRisk = useMemo(() => {
    return sensorsWithData.some(
      (sensor) => sensor.sensorName === 'STEERING_ANGLE' && sensor.status === 'out_of_range'
    );
  }, [sensorsWithData]);

  useEffect(() => {
    const warningCount = sensorsWithData.filter(
      (sensor) => sensor.status === 'out_of_range'
    ).length;

    setStabilityHistory((previous) => {
      const previousScore = previous.length > 0 ? previous[previous.length - 1].score : 82;
      const nextScore =
        warningCount === 0
          ? Math.min(100, previousScore + 2.8)
          : Math.max(0, previousScore - Math.min(34, 7 + warningCount * 4));

      const nextPoint: StabilityPoint = {
        timestamp: Date.now(),
        score: Number(nextScore.toFixed(2)),
        warnings: warningCount
      };

      const trimmed = previous.slice(-59);
      return [...trimmed, nextPoint];
    });
  }, [sensorsWithData]);

  const stabilityGraph = useMemo(() => {
    if (stabilityHistory.length === 0) {
      return '';
    }

    const width = 640;
    const height = 130;
    const padding = 10;
    const length = stabilityHistory.length;

    return stabilityHistory
      .map((point, index) => {
        const x =
          length === 1
            ? width - padding
            : padding + (index / (length - 1)) * (width - padding * 2);
        const y = padding + (1 - point.score / 100) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(' ');
  }, [stabilityHistory]);

  const currentStability = stabilityHistory.length
    ? stabilityHistory[stabilityHistory.length - 1]
    : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-darkmode.svg" alt="Spyder" width={32} height={32} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Spyder Telemetry</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
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

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5">
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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <CarModelPanel
                  highlightTyres={hasTyreRisk}
                  highlightSteering={hasSteeringRisk}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Vehicle Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {riskNotifications.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No active vehicle alerts.
                  </div>
                ) : (
                  <div className="max-h-[150px] space-y-2 overflow-y-auto">
                    {riskNotifications.map((risk) => (
                      <div
                        key={risk.sensorId}
                        className="rounded-md border border-red-700/70 bg-red-500/90 p-2 text-xs text-white shadow-sm"
                      >
                        <div className="font-semibold">Risk: {risk.sensorName}</div>
                        <div className="mt-0.5 opacity-95">Value: {risk.valueLabel}</div>
                        <div className="opacity-90">At: {risk.timeLabel}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Sensor Live Feed
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sensorsWithData.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Waiting for metadata and telemetry...
                  </div>
                ) : (
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-zinc-700 bg-black/80 font-mono">
                    <table className="w-full text-left text-xs text-zinc-100">
                      <thead className="sticky top-0 bg-zinc-950">
                        <tr className="border-b border-zinc-700">
                          <th className="px-3 py-2 font-semibold tracking-wide text-zinc-300">
                            Signal
                          </th>
                          <th className="px-3 py-2 font-semibold tracking-wide text-zinc-300">
                            Value
                          </th>
                          <th className="px-3 py-2 font-semibold tracking-wide text-zinc-300">
                            State
                          </th>
                          <th className="px-3 py-2 font-semibold tracking-wide text-zinc-300">
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sensorsWithData.map((sensor) => (
                          <tr
                            key={sensor.sensorId}
                            className="border-b border-zinc-800/80 last:border-b-0 hover:bg-zinc-900/60"
                            title={`sensorId: ${sensor.sensorId} | raw: ${sensor.sensorName}`}
                          >
                            <td className="px-3 py-2 font-medium text-zinc-100">
                              {displaySensorName(sensor.sensorName)}
                            </td>
                            <td className="px-3 py-2 text-zinc-200">
                              {sensor.reading
                                ? `${formatValue(sensor.reading.value)} ${sensor.unit}`
                                : 'N/A'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${
                                  sensor.status === 'out_of_range'
                                    ? 'border-red-700/80 bg-red-950/70 text-red-300'
                                    : sensor.status === 'normal'
                                      ? 'border-emerald-700/80 bg-emerald-950/70 text-emerald-300'
                                      : 'border-zinc-700 bg-zinc-900/70 text-zinc-400'
                                }`}
                              >
                                {sensor.status === 'out_of_range'
                                  ? 'WARN'
                                  : sensor.status === 'normal'
                                    ? 'STABLE'
                                    : '--'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-zinc-400">
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

            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Stability Graph
                </CardTitle>
                <CardDescription className="text-xs">
                  {currentStability
                    ? `Score ${currentStability.score.toFixed(1)} | Warnings ${currentStability.warnings}`
                    : 'Awaiting signal history...'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border bg-card/60 p-3">
                  <svg
                    viewBox="0 0 640 130"
                    className="h-[130px] w-full"
                    preserveAspectRatio="none"
                  >
                    <rect x="0" y="0" width="640" height="130" fill="transparent" />
                    <line x1="0" y1="120" x2="640" y2="120" stroke="hsl(var(--border))" strokeWidth="1" />
                    <line x1="0" y1="10" x2="640" y2="10" stroke="hsl(var(--border))" strokeWidth="1" />
                    {stabilityGraph && (
                      <polyline
                        points={stabilityGraph}
                        fill="none"
                        stroke="hsl(145 75% 45%)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
