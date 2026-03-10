import { Worker, Job } from "bullmq";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  bullmqConnection,
  WORKER_CONCURRENCY,
  WORKER_INSTANCES,
} from "./queue.config";
import type { DownloadJobData, DownloadJobResult } from "./download.queue";

const QUEUE_NAME = "media-download";

// Paths for cookies, proxies, and yt-dlp binary
const COOKIES_DIR = path.join(process.cwd(), "config", "cookies");
const PROXIES_FILE = path.join(process.cwd(), "config", "proxies.json");
const YT_DLP_PATH = process.env.YT_DLP_PATH || path.join(process.cwd(), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

// Load cookies from directory
const loadCookies = (): string[] => {
  try {
    if (!fs.existsSync(COOKIES_DIR)) {
      console.warn(`⚠️ Cookies directory not found: ${COOKIES_DIR}`);
      return [];
    }

    const files = fs.readdirSync(COOKIES_DIR);
    const cookieFiles = files
      .filter((f) => f.endsWith(".txt"))
      .map((f) => path.join(COOKIES_DIR, f));

    if (cookieFiles.length === 0) {
      console.warn("⚠️ No cookie files found in cookies directory");
    }

    return cookieFiles;
  } catch (error) {
    console.error("❌ Error loading cookies:", error);
    return [];
  }
};

// Load proxies from config file
const loadProxies = (): string[] => {
  try {
    if (!fs.existsSync(PROXIES_FILE)) {
      console.warn(`⚠️ Proxies file not found: ${PROXIES_FILE}`);
      return [];
    }

    const content = fs.readFileSync(PROXIES_FILE, "utf-8");
    const config = JSON.parse(content);
    return config.proxies || [];
  } catch (error) {
    console.error("❌ Error loading proxies:", error);
    return [];
  }
};

// Random item selector
const randomItem = <T>(arr: T[]): T | undefined => {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
};

// Process a download job
const processDownload = async (
  job: Job<DownloadJobData, DownloadJobResult>
): Promise<DownloadJobResult> => {
  const { url, platform } = job.data;

  const cookies = loadCookies();
  const proxies = loadProxies();

  const selectedCookie = randomItem(cookies);
  const selectedProxy = randomItem(proxies);

  // Build yt-dlp arguments
  const args: string[] = [];

  // Add cookies if available
  if (selectedCookie) {
    args.push("--cookies", selectedCookie);
  }

  // Add proxy if available
  if (selectedProxy) {
    args.push("--proxy", selectedProxy);
  }

  // Output as JSON
  args.push("-j");

  // Platform-specific options
  if (platform === "instagram") {
    args.push("--no-check-certificate");
  }

  // Add the URL
  args.push(url);

  return new Promise((resolve, reject) => {
    const ytDlp = spawn(YT_DLP_PATH, args, {
      timeout: 60000, // 1 minute timeout
    });

    let stdout = "";
    let stderr = "";

    ytDlp.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    ytDlp.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ytDlp.on("error", (error) => {
      console.error(`❌ yt-dlp spawn error for job ${job.id}:`, error);
      reject(new Error(`yt-dlp process error: ${error.message}`));
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        console.error(`❌ yt-dlp failed for job ${job.id}:`, stderr);
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }

      try {
        // yt-dlp may output multiple JSON objects for playlists
        // We take the first valid one
        const lines = stdout.trim().split("\n");
        const jsonLine = lines.find((line) => line.startsWith("{"));

        if (!jsonLine) {
          reject(new Error("No valid JSON output from yt-dlp"));
          return;
        }

        const data = JSON.parse(jsonLine);

        const result: DownloadJobResult = {
          title: data.title || data.fulltitle || "Untitled",
          video_url: data.url || data.webpage_url,
          thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || "",
          duration: data.duration,
          formats: data.formats?.slice(0, 5)?.map((f: any) => ({
            format_id: f.format_id,
            ext: f.ext,
            url: f.url,
            quality: f.quality || f.format_note,
          })),
        };

        console.log(`✅ Job ${job.id} completed: ${result.title}`);
        resolve(result);
      } catch (parseError) {
        console.error(`❌ JSON parse error for job ${job.id}:`, parseError);
        reject(new Error("Failed to parse yt-dlp output"));
      }
    });
  });
};

// Store active workers for cleanup
const activeWorkers: Worker[] = [];

// Initialize workers
export const initializeDownloadWorkers = (): void => {
  // Verify yt-dlp exists
  if (!fs.existsSync(YT_DLP_PATH)) {
    console.error(`❌ yt-dlp not found at: ${YT_DLP_PATH}`);
    console.error("   Download from: https://github.com/yt-dlp/yt-dlp/releases");
    console.error("   Or set YT_DLP_PATH environment variable");
    return;
  }
  console.log(`✅ yt-dlp found at: ${YT_DLP_PATH}`);

  console.log(
    `🚀 Starting ${WORKER_INSTANCES} download worker(s) with concurrency ${WORKER_CONCURRENCY}...`
  );

  for (let i = 0; i < WORKER_INSTANCES; i++) {
    const worker = new Worker<DownloadJobData, DownloadJobResult>(
      QUEUE_NAME,
      processDownload,
      {
        connection: bullmqConnection,
        concurrency: WORKER_CONCURRENCY,
        limiter: {
          max: 10,
          duration: 1000, // Max 10 jobs per second per worker
        },
      }
    );

    worker.on("completed", (job) => {
      console.log(`✅ Worker ${i + 1}: Job ${job.id} completed`);
    });

    worker.on("failed", (job, error) => {
      console.error(
        `❌ Worker ${i + 1}: Job ${job?.id} failed:`,
        error.message
      );
    });

    worker.on("error", (error) => {
      console.error(`❌ Worker ${i + 1} error:`, error.message);
    });

    activeWorkers.push(worker);
    console.log(`✅ Download worker ${i + 1} started`);
  }
};

// Graceful shutdown
export const shutdownDownloadWorkers = async (): Promise<void> => {
  console.log("🛑 Shutting down download workers...");

  await Promise.all(
    activeWorkers.map(async (worker, index) => {
      try {
        await worker.close();
        console.log(`✅ Worker ${index + 1} shut down`);
      } catch (error) {
        console.error(`❌ Error shutting down worker ${index + 1}:`, error);
      }
    })
  );

  activeWorkers.length = 0;
  console.log("✅ All download workers shut down");
};
