// Checkout-funnel events that only happen in the UI and never hit a business
// API on their own — the FE reports these explicitly via POST /journey/event.
// Steps that DO hit an API (add to cart, billing address saved, payment
// init/commit) are already captured automatically in user_activities by the
// activity-logger middleware, so they must NOT be sent as journey events.
export enum JourneyEventName {
  // User landed on the checkout / billing-details step
  CHECKOUT_STARTED = "CHECKOUT_STARTED",
  // Checkout opened and a saved billing address was shown prefilled
  BILLING_ADDRESS_PREFILLED = "BILLING_ADDRESS_PREFILLED",
  // User clicked "Add billing details" (form opened, nothing saved yet)
  BILLING_ADDRESS_FORM_OPENED = "BILLING_ADDRESS_FORM_OPENED",
  // User proceeded past the billing step using their existing address
  BILLING_ADDRESS_CONTINUED = "BILLING_ADDRESS_CONTINUED",
}

export interface TrackJourneyEventRequest {
  eventName: JourneyEventName;
  // Optional FE context (e.g. { trackCode, cartValue, screen }) — stored as-is
  metadata?: Record<string, unknown>;
}
