import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform } from "../services/dto-service/modules.export";
import {
  createInternalUserSchema,
  updateInternalUserFunctionalitiesSchema,
  createAccessRequestSchema,
  rejectAccessRequestSchema,
} from "../middlewares/admin-internal-users.validation";
import {
  createInternalUser,
  listInternalUsers,
  deactivateInternalUser,
  reactivateInternalUser,
  updateInternalUserFunctionalities,
  getInternalUserMe,
} from "../controllers/admin-internal-users.controller";
import {
  listApprovableAdmins,
  createAccessRequest,
  listMyAccessRequests,
  listAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from "../controllers/access-request.controller";

const router = Router();

// Any logged-in INTERNAL user (not just admins). Used by /me, the access-request
// creation flow, and the admins picker.
const requireInternalUser = authenticateWithSession({
  platforms: [Platform.INTERNAL],
});

// The Internal Users CONSOLE is now functionality-gated, not role-gated:
// authenticated INTERNAL user + the `internal-users` grant. Admins pass the
// grant check by role (requireFunctionality bypasses ADMIN). This is the
// deliberate "no admin-only functionality" model — see docs/ACCESS-MODEL.md.
// Do NOT revert this to a `roles: [ADMIN]` guard.
const requireInternalUsersConsole = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("internal-users"),
];

// ── Internal user management (console) ──────────────────────────────────────
router.post(
  "/",
  ...requireInternalUsersConsole,
  validateRequest(createInternalUserSchema),
  createInternalUser
);

router.get("/", ...requireInternalUsersConsole, listInternalUsers);

// Caller's own live role + functionalities. Any internal user, not just console.
router.get("/me", requireInternalUser, getInternalUserMe);

// ── Access requests ─────────────────────────────────────────────────────────
// Picker data + self-service create + "my requests": any authenticated internal
// user. Listing/approving/rejecting: console (admins + internal-users holders).
router.get("/admins", requireInternalUser, listApprovableAdmins);

router.post(
  "/access-requests",
  requireInternalUser,
  validateRequest(createAccessRequestSchema),
  createAccessRequest
);

router.get("/access-requests/mine", requireInternalUser, listMyAccessRequests);

router.get(
  "/access-requests",
  ...requireInternalUsersConsole,
  listAccessRequests
);

router.post(
  "/access-requests/:id/approve",
  ...requireInternalUsersConsole,
  approveAccessRequest
);

router.post(
  "/access-requests/:id/reject",
  ...requireInternalUsersConsole,
  validateRequest(rejectAccessRequestSchema),
  rejectAccessRequest
);

// ── Deactivate / reactivate / grant edits (console) ─────────────────────────
router.post(
  "/:id/deactivate",
  ...requireInternalUsersConsole,
  deactivateInternalUser
);

router.post(
  "/:id/reactivate",
  ...requireInternalUsersConsole,
  reactivateInternalUser
);

// Replace a non-admin user's functionality grant list.
router.patch(
  "/:id/functionalities",
  ...requireInternalUsersConsole,
  validateRequest(updateInternalUserFunctionalitiesSchema),
  updateInternalUserFunctionalities
);

export default router;
