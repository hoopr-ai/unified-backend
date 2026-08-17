import Joi from "joi";
import {
  Platform,
  normalizePlatform,
} from "../services/dto-service/constants/modules.export";

/**
 * `platform` as it arrives from a client, restricted to `allowed` and normalized
 * to the stored value — so a request from a client that has shipped the
 * SOUND_TRACKING_APP → CREATOR rename and one that has not both hit the same
 * rows. See services/dto-service/constants/platform.ts.
 *
 * Membership is checked inside the custom validator rather than with
 * `.valid(...)` on purpose: a value matching a `valid()` entry short-circuits
 * Joi's rule chain, so a `.custom()` normalizer chained onto `.valid(...)` never
 * runs and the alias silently reaches the query layer unmapped. `any.only` is
 * raised by hand instead, which keeps the error message byte-identical to the
 * `.valid(...)` form ("must be one of [...]") and lists the names a client
 * should send.
 *
 * `allowed` is itself normalized before matching, so a list written as
 * [Platform.CREATOR] accepts both spellings without having to name the old one.
 *
 * The normalized value only reaches the handler because validateRequest (and the
 * per-controller validateQuery helpers) use Joi's returned value rather than the
 * raw req.body / req.query.
 *
 * Callers add .required() / .optional() themselves — Joi schemas are immutable,
 * so the exported instances below are safe to derive from.
 */
export const platformFieldOf = (...allowed: string[]) => {
  const allowedStored = allowed.map((p) => normalizePlatform(p));
  return Joi.string().custom((value: string, helpers) => {
    const stored = normalizePlatform(value);
    return allowedStored.includes(stored)
      ? stored
      : helpers.error("any.only", { valids: allowed });
  });
};

/** Any platform in the enum, i.e. what the auth and FAQ endpoints accept. */
export const platformField = platformFieldOf(
  ...(Object.values(Platform) as string[]),
);
