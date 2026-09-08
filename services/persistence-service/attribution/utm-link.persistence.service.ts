import { UtmLinkModel, UtmLinkAttributes } from "./schemas/modules.export";

/**
 * Write one visit into `utm_links`.
 *
 * A plain insert: one tagged request is one row, with no dedupe and no
 * matching against the link a marketer registered. Two things follow from
 * that, and both are intended rather than overlooked:
 *
 *  - The Builder's listing (GET /smash/utm/links) mixes visits in with the
 *    links people built. `label` starting "visit:" is what tells them apart in
 *    a query; nothing filters them apart in that UI today.
 *  - enterprise-fe spreads the landing URL's tags onto every call it makes, so
 *    one page view writes several rows.
 */
export const recordUtmLinkVisit = async (
  visit: Omit<UtmLinkAttributes, "id" | "createdAt" | "updatedAt">,
): Promise<void> => {
  await UtmLinkModel.create(visit);
};
