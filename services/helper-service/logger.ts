import winston from "winston";
import newrelicFormatter from "@newrelic/winston-enricher";

// ✅ Pass winston to the enricher
const newRelicFormat = newrelicFormatter(winston);

export const logger = winston.createLogger({
  level: "info",

  format: winston.format.combine(
    newRelicFormat(),          // 👈 call it here
    winston.format.json()
  ),

  transports: [
    new winston.transports.Console()
  ]
});
