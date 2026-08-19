import { Logger, GatewayTransport } from "@ablock/logger";

const logger = new Logger({
  service: "todo-frontend",
  transport: new GatewayTransport({
    endpoint: process.env.NEXT_PUBLIC_LOGCORE_URL,
    apiKey: process.env.NEXT_PUBLIC_LOGCORE_KEY,
  }),
});

export default logger;
