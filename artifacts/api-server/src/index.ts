import app from "./app";
import { logger } from "./lib/logger";
import { resolveRealtimeModel } from "./lib/realtime-model";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  try {
    const model = await resolveRealtimeModel();
    logger.info({ model }, "Realtime model resolved");
  } catch (err) {
    logger.error(
      { err },
      "Realtime model resolution failed. /realtime/session will return 503 until corrected.",
    );
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main();
