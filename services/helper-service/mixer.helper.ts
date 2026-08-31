import { execFile } from "node:child_process";
import { createRequire } from "node:module";

/**
 * FFmpeg glue for the multitrack mixer.
 *
 * Ported from NATIVE-BE's src/modules/mixer/mixer.processor.ts, which in turn
 * replaced hoopr-backend's utils/mixerProcessor.js. The two departures from the
 * hoopr original are kept, because both were bugs rather than choices:
 *
 *  1. ONE ffmpeg invocation, not N+1. Legacy ran ffmpeg once per stem to write
 *     an intermediate wav, then once more to blend them — so a 4-stem mix wrote
 *     five ~30 MB files and decoded the audio twice. Everything below happens
 *     inside a single filter_complex: N decodes, one encode, one file.
 *
 *  2. No fluent-ffmpeg. The command is built once, declaratively; the wrapper
 *     would only add a dependency and an error surface that swallows ffmpeg's
 *     stderr, which is the only thing that ever says WHY a render failed.
 *
 * BINARY RESOLUTION: an explicitly configured FFMPEG_PATH, then the npm-bundled
 * ffmpeg-static if it happens to be installed, then whatever is on PATH. The
 * last is what a box with `apt install ffmpeg` has. ffmpeg-static is NOT a
 * dependency of this service — it is an ~80 MB download that should not be able
 * to fail a deploy — so in practice deployments set FFMPEG_PATH or install
 * ffmpeg system-wide.
 */
let cachedBinary: string | null = null;

export const ffmpegBinary = (): string => {
  if (cachedBinary) return cachedBinary;

  const configured = (process.env.FFMPEG_PATH ?? "").trim();
  if (configured) return (cachedBinary = configured);

  try {
    // createRequire, not a static import: ffmpeg-static is optional and a
    // top-level import would make the whole module fail to load without it.
    const req = createRequire(import.meta.url);
    const bundled = req("ffmpeg-static") as string | null;
    if (bundled) return (cachedBinary = bundled);
  } catch {
    // Not installed — fall through to PATH.
  }

  return (cachedBinary = "ffmpeg");
};

export interface StemRender {
  /** Local path of the downloaded source stem. */
  path: string;
  /** Percent. 100 = unity. Callers drop 0 before getting here. */
  volume: number;
  /** Playback-rate multiplier, 0.5–2.0. undefined = unchanged. */
  tempo?: number;
  /** Pitch multiplier, 0.5–2.0. undefined = unchanged. */
  pitch?: number;
}

const SAMPLE_RATE = 44100;

/**
 * `atempo` only accepts 0.5–2.0 per instance, so an out-of-range factor has to
 * be split across a chain whose product is the factor asked for. Combining a
 * tempo change with a pitch change can land at 4.0 or 0.25 (pitch 0.5 + tempo
 * 2.0), which one filter cannot express.
 */
const atempoChain = (factor: number): string[] => {
  const out: string[] = [];
  let remaining = factor;
  // Guard against a non-finite factor turning this into an infinite loop.
  if (!Number.isFinite(remaining) || remaining <= 0) return out;

  while (remaining > 2.0) {
    out.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    out.push("atempo=0.5");
    remaining /= 0.5;
  }
  // Anything within a rounding error of unity adds a filter that does nothing.
  if (Math.abs(remaining - 1) > 1e-4) out.push(`atempo=${remaining.toFixed(6)}`);
  return out;
};

/**
 * The per-stem filter chain.
 *
 * PITCH, without librubberband: `asetrate` resamples the stream as though it
 * were recorded at a different rate, which shifts pitch AND duration by the
 * same factor; `atempo=1/pitch` then puts the duration back. This is the classic
 * varispeed shift — audibly a tape-speed change rather than a formant-preserving
 * one, but it works on every stock ffmpeg build. Legacy emitted
 * `rubberband=pitch=`, which needs --enable-librubberband and which neither
 * ffmpeg-static nor Debian's ffmpeg carries, so any request that set pitch
 * aborted the whole render with "No such filter".
 */
const stemFilters = (stem: StemRender): string[] => {
  const filters: string[] = [];

  // Both changes fold into ONE atempo chain: the pitch shift's compensation
  // (1/pitch) and the requested tempo multiply together.
  const pitch = stem.pitch && stem.pitch !== 1 ? stem.pitch : undefined;
  const tempo = stem.tempo && stem.tempo !== 1 ? stem.tempo : undefined;

  if (pitch) {
    filters.push(`asetrate=${Math.round(SAMPLE_RATE * pitch)}`);
    filters.push(`aresample=${SAMPLE_RATE}`);
  }

  const tempoFactor = (tempo ?? 1) / (pitch ?? 1);
  filters.push(...atempoChain(tempoFactor));

  // Always last, so it acts on the final level rather than on something a later
  // resample has already changed.
  filters.push(`volume=${(stem.volume / 100).toFixed(4)}`);

  // Stems in the catalogue are uniformly 44.1k stereo, but a mismatched one
  // would make amix resample on our behalf with no say in the rate.
  filters.push(`aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=stereo`);

  return filters;
};

export interface RenderOptions {
  stems: StemRender[];
  outputPath: string;
  format: "wav" | "mp3";
  /** Hard ceiling on one render. Kills the process rather than hanging a request. */
  timeoutMs?: number;
}

export const buildFfmpegArgs = (options: RenderOptions): string[] => {
  const { stems, outputPath, format } = options;

  const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y"];
  stems.forEach((s) => args.push("-i", s.path));

  const chains = stems.map((s, i) => `[${i}:a]${stemFilters(s).join(",")}[a${i}]`);
  const labels = stems.map((_, i) => `[a${i}]`).join("");

  // normalize=0 matters. amix defaults to normalize=1, which divides every
  // input by the input COUNT — so legacy's 4-stem mix came out 12 dB quieter
  // than the stems the user balanced, and the more stems you enabled the
  // quieter it got. Summing at unity is what the faders mean; alimiter then
  // catches the peaks that summing can push past full scale, which is the
  // reason normalize=1 exists in the first place.
  const mix =
    stems.length === 1
      ? `${labels}anull[mixed]`
      : `${labels}amix=inputs=${stems.length}:duration=longest:normalize=0[mixed]`;

  args.push(
    "-filter_complex",
    [...chains, mix, "[mixed]alimiter=limit=0.98[out]"].join(";"),
    "-map",
    "[out]",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "2",
  );

  if (format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", "320k");
  } else {
    // 16-bit PCM, matching what legacy produced.
    args.push("-c:a", "pcm_s16le");
  }

  args.push(outputPath);
  return args;
};

/** Runs the render. Rejects with ffmpeg's own stderr, the only useful diagnostic. */
export const renderMix = (options: RenderOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const args = buildFfmpegArgs(options);
    execFile(
      ffmpegBinary(),
      args,
      {
        timeout: options.timeoutMs ?? 5 * 60 * 1000,
        killSignal: "SIGKILL",
        // ffmpeg writes progress to stderr; errors are short, but a filter
        // graph complaint can run long.
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        const detail = (stderr || "").trim().split("\n").slice(-5).join(" | ");
        reject(
          new Error(`ffmpeg failed (${error.message})${detail ? `: ${detail}` : ""}`),
        );
      },
    );
  });

/**
 * Caps concurrent renders.
 *
 * One mix is several minutes of audio decoded, filtered and re-encoded. This
 * service also serves every catalogue read, so an unbounded burst of renders
 * would starve them — the DB pool comment in database.ts describes exactly that
 * failure mode from a different cause. Queued callers wait rather than being
 * rejected: a render already takes tens of seconds, so a few more is not a new
 * experience.
 */
export class RenderQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await job();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  get depth(): number {
    return this.active + this.waiting.length;
  }
}
