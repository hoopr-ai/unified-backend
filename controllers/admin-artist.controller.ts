import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  executeNativeArtistRecompute,
  getNativeArtistStatusService,
} from "../services/business-service/admin-artist/modules.export";

// GET /admin/artists/native-status — how many artists carry the flag.
export const getNativeArtistStatus = catchAsync(
  async (_req: Request, res: Response) => {
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: await getNativeArtistStatusService(),
      message: "Native artist status fetched.",
    });
  },
);

// POST /admin/artists/recompute-native — manual refresh, for right after a
// catalogue import rather than waiting for the nightly job.
//
// Defaults to "full" (both directions), which is the opposite of the cron: a
// human pressing the button wants the flag correct, and the demotion pass is
// what a delisted catalogue needs. ?mode=promote does the cheap half only.
export const recomputeNativeArtists = catchAsync(
  async (req: Request, res: Response) => {
    const mode = req.query.mode === "promote" ? "promote" : "full";
    const result = await executeNativeArtistRecompute(mode);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: `Native artist flags recomputed (+${result.promoted} / -${result.demoted}).`,
    });
  },
);
