import Joi from "joi";
import { CATALOGUE_RIGHT_KEYS } from "../services/dto-service/catalogue-rights/catalogue-rights.dto";

// The rights vocabulary is defined ONCE, in the DTO. Both schemas below are
// generated from it, so adding a seventh right cannot leave the validator
// silently stripping it.
const rightsShape = Object.fromEntries(
  CATALOGUE_RIGHT_KEYS.map((k) => [k, Joi.boolean()]),
);

/**
 * PUT /admin/catalogue-rights/:catalogue
 *
 * Every key REQUIRED. A catalogue default is the floor the merge falls back to,
 * so a missing key would resolve to `false` and read as a decision nobody made.
 * The editor renders all six checkboxes and posts all six.
 */
export const updateCatalogueRightsSchema = Joi.object({
  rights: Joi.object(
    Object.fromEntries(CATALOGUE_RIGHT_KEYS.map((k) => [k, Joi.boolean().required()])),
  )
    .required()
    .unknown(false),
}).unknown(false);

/**
 * PUT /admin/catalogue-rights/:catalogue/brands/:brandId
 *
 * Every key OPTIONAL, and that is the whole point: the row stores only what
 * this brand negotiated. Sending all six would freeze them against future
 * changes to the catalogue default. `{}` is accepted — it means "no deviation"
 * while keeping the note and the audit trail.
 */
export const updateBrandOverrideSchema = Joi.object({
  rights: Joi.object(rightsShape).required().unknown(false),
  note: Joi.string().trim().allow("", null).max(2000).optional(),
}).unknown(false);

/** `:brandId` is a path param, so it arrives as a string. */
export const brandIdParamSchema = Joi.number().integer().min(1).required();
