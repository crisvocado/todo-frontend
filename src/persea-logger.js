// src/persea-logger.js
import { Logger, GatewayTransport } from "@ablock/logger";

const logger = new Logger({
  service: "todo-frontend",
  env: "dev",
  sourceProject: "todo-frontend",
  transport: new GatewayTransport({
    endpoint: import.meta.env.VITE_LOGCORE_URL,
    apiKey: import.meta.env.VITE_LOGCORE_KEY,
  }),
});

export default logger;