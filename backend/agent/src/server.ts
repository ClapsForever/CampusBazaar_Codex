import { buildApp } from "./app.js";
import { loadConfig } from "./config/index.js";

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: "127.0.0.1", port: config.port });
  app.log.info({ port: config.port, modelMode: config.modelMode, mockBackend: config.mockBackend }, "Pi campus market agent started");
} catch (error) {
  app.log.error(error, "failed to start server");
  process.exitCode = 1;
}
