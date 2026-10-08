import { createApp } from './app';
import { createAdapter } from './ai/adapter';
import { calibrationState, runCalibration } from './domain/baseline';
import { store } from './store/store';

const port = Number(process.env.PORT ?? '4600');
const hostname = process.env.HOST ?? '127.0.0.1';

const adapter = createAdapter();
const app = createApp(adapter);

const db = store.read();
if (db.tests.length === 0 && !calibrationState().running) {
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await runCalibration(adapter);
      console.log('[silex] baseline calibration complete');
    } catch (error) {
      console.error('[silex] baseline calibration failed', error);
    }
  })();
}

Bun.serve({
  port,
  hostname,
  fetch: app.fetch,
});

console.log(`[silex] listening on http://${hostname}:${port}`);

const shutdown = () => {
  store.flushNow();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
