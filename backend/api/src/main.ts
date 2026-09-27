import { loadConfig } from './config.js';
import { createApiApp } from './server.js';

const config = loadConfig();
const app = createApiApp(config);
app.server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ event: 'api_started', host: config.host, port: config.port }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0), error => {
      console.error(error);
      process.exit(1);
    });
  });
}
