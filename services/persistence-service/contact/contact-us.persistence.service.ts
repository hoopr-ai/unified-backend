import { ContactUsModel, type ContactUsAttributes } from "./schemas/modules.export";

/**
 * Writes one enquiry to the SHARED `contact_us` table.
 *
 * Shared with STUDIO (this app) and CREATOR (native-be), segregated by
 * `platform` — so the caller must always pass it. Nothing here filters on it;
 * that is the reader's job.
 */
export const saveContactUs = async (
  details: ContactUsAttributes
): Promise<ContactUsModel> => {
  const contact = await ContactUsModel.create(details);
  return contact;
};
