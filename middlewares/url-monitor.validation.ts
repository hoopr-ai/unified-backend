import Joi from "joi";

const nameField = Joi.string().trim().min(1).max(255);
const urlField = Joi.string()
  .trim()
  .uri({ scheme: ["http", "https"] })
  .max(1024);
const notifyEmailsField = Joi.array()
  .items(Joi.string().trim().email())
  .max(20);
const sslAlertDaysField = Joi.number().integer().min(1).max(365);

// POST /admin/url-monitor
export const createMonitoredUrlSchema = Joi.object({
  name: nameField.required(),
  url: urlField.required(),
  notifyEmails: notifyEmailsField.default([]),
  sslAlertDays: sslAlertDaysField.default(30),
});

// PUT /admin/url-monitor/:id — partial; at least one field.
export const updateMonitoredUrlSchema = Joi.object({
  name: nameField.optional(),
  url: urlField.optional(),
  notifyEmails: notifyEmailsField.optional(),
  sslAlertDays: sslAlertDaysField.optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

// GET /admin/url-monitor/:id/history
export const historyQuerySchema = Joi.object({
  hours: Joi.number().integer().min(1).max(720).default(24),
});
