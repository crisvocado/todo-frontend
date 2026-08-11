import { Logger, GatewayTransport } from "@avocadoblock/logger";

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
