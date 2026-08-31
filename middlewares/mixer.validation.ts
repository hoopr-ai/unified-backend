import Joi from "joi";

/**
 * Ranges are enforced here rather than clamped in the service, so a client that
 * sends something unusable is told so.
 *
 * `volume` accepts 0–200 where hoopr-backend clamped to [50, 200]: pulling a
 * fader to 20% silently became 50% there — wrong, and unreachable from a UI
 * that sends 0–100. 0 is accepted and drops the stem from the mix rather than
 * mixing silence into it.
 *
 * `tempo` and `pitch` are 0.5–2.0, ffmpeg's single-pass atempo range. `bpm` is
 * the legacy alias for `tempo` — it was never a BPM value there either.
 */
const mixStemSchema = Joi.object({
  stemId: Joi.string().uuid().required(),
  volume: Joi.number().integer().min(0).max(200).default(100),
  tempo: Joi.number().min(0.5).max(2.0),
  bpm: Joi.number().min(0.5).max(2.0),
  pitch: Joi.number().min(0.5).max(2.0),
});

export const createMixRequestSchema = Joi.object({
  trackCode: Joi.string().trim().max(100).required(),
  // 24 is above the widest multitrack in the catalogue and well below the point
  // where one render would monopolise the box.
  stems: Joi.array().items(mixStemSchema).min(1).max(24).required(),
  format: Joi.string().valid("wav", "mp3"),
});

export const downloadMixRequestSchema = Joi.object({
  mixId: Joi.number().integer().min(1).required(),
});
