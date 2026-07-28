// Manual smoke test for the URL-monitor probes (no DB/Redis needed):
//   npx ts-node scripts/test-url-monitor-probes.ts
import {
  checkHealth,
  checkSsl,
} from "../services/business-service/url-monitor/url-monitor.service";

const targets = [
  "https://hoopr.ai",
  "https://api-smash.hoopr.ai/health-check",
  "http://example.com", // http — SSL check should be skipped
  "https://definitely-not-a-real-host.hoopr.invalid", // DNS failure → DOWN
];

for (const url of targets) {
  const [health, ssl] = await Promise.all([checkHealth(url), checkSsl(url)]);
  console.log(`\n── ${url}`);
  console.log("   health:", health);
  console.log("   ssl:   ", ssl);
}
process.exit(0);
