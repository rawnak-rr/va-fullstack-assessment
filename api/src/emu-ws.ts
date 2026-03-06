import WebSocket from 'ws';

export type RawTelemetryHandler = (payload: unknown) => void;

interface EmulatorWsClientOptions {
  emulatorHttpUrl: string;
  onTelemetry: RawTelemetryHandler;
  reconnectDelayMs?: number;
}

function toWsUrl(emulatorHttpUrl: string): string {
  const trimmed = emulatorHttpUrl.replace(/\/$/, '');
  return trimmed.replace(/^http/i, 'ws') + '/ws/telemetry';
}

export function startEmulatorWsClient({
  emulatorHttpUrl,
  onTelemetry,
  reconnectDelayMs = 1000
}: EmulatorWsClientOptions): void {
  const wsUrl = toWsUrl(emulatorHttpUrl);

  const connect = (): void => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log(`[ws] connected: ${wsUrl}`);
    });

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        onTelemetry(payload);
      } catch {
        console.warn('[ws] dropped non-JSON telemetry payload');
      }
    });

    ws.on('close', () => {
      console.warn(`[ws] disconnected; reconnecting in ${reconnectDelayMs}ms`);
      setTimeout(connect, reconnectDelayMs);
    });

    ws.on('error', (error) => {
      console.error(`[ws] error: ${error.message}`);
    });
  };

  connect();
}
