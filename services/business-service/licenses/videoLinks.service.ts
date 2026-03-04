import {
    createVideoLink,
    getVideoLinksByLicenseId,
    countVideoLinksByLicenseId,
    LicenseModel,
    VideoLinkModel,
    type VideoLinkDetails,
} from "../../persistence-service/licenses/modules.export";
import { UserModel } from "../../persistence-service/user/modules.export";
import { AppError } from "../../helper-service/modules.export";
import type {
    AddVideoLinksRequest,
    AddVideoLinksResponse,
    VideoLinkResponse,
    VideoLinksListResponse,
} from "../../dto-service/licenses/modules.export";

export const addVideoLinkService = async (
    userId: number,
    data: AddVideoLinksRequest
): Promise<AddVideoLinksResponse> => {
    const { licenseId, videoLinks, trackCode } = data;

    // Get license details
    const license = await LicenseModel.findByPk(licenseId);

    if (!license) {
        throw new AppError("License not found", 404);
    }

    // Verify ownership
    // Check if the user owns the license directly
    if (license.userId !== userId) {
        // Or check if the user belongs to the brand that owns the license
        const user = await UserModel.findByPk(userId);
        if (!user || !user.brandId || user.brandId !== license.brandId) {
            throw new AppError("Unauthorized access to license", 403);
        }
    }

    // Security check: trackCode in payload must match the license's trackCode
    if (trackCode && license.trackCode !== trackCode) {
        throw new AppError("The provided track does not match this license.", 403);
    }

    // Check video link limit: Maximum 3 links per license
    const existingLinksCount = await countVideoLinksByLicenseId(licenseId);
    const totalAfterAdd = existingLinksCount + videoLinks.length;
    if (totalAfterAdd > 3) {
        throw new AppError(
            `Maximum limit exceeded. You can only add up to 3 video links per downloaded track. Current count: ${existingLinksCount}, attempting to add: ${videoLinks.length}`,
            400
        );
    }

    // Create all video links
    const createdLinks: VideoLinkResponse[] = [];
    for (const videoLink of videoLinks) {
        const videoLinkDetails: VideoLinkDetails = {
            licenseId,
            url: videoLink.url,
            trackCode,
            status: "ACTIVE",
        };

        const created = await createVideoLink(videoLinkDetails);
        createdLinks.push({
            id: created.id,
            url: created.url,
            status: created.status,
            trackCode: created.trackCode,
            licenseId: created.licenseId,
            isEditable: false, // will be recalculated below
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
        });
    }

    const totalLinks = existingLinksCount + createdLinks.length;
    const isEditable = totalLinks < 3;
    return {
        videoLinks: createdLinks.map((link) => ({ ...link, isEditable })),
    };
};

export const getVideoLinksService = async (
    userId: number,
    licenseId: number
): Promise<VideoLinksListResponse> => {
    // Get license details
    const license = await LicenseModel.findByPk(licenseId);

    if (!license) {
        throw new AppError("License not found", 404);
    }

    // Verify ownership
    // Check if the user owns the license directly
    if (license.userId !== userId) {
        // Or check if the user belongs to the brand that owns the license
        const user = await UserModel.findByPk(userId);
        if (!user || !user.brandId || user.brandId !== license.brandId) {
            throw new AppError("Unauthorized access to license", 403);
        }
    }

    // Get video links
    const videoLinks = await getVideoLinksByLicenseId(licenseId);

    const isEditable = videoLinks.length < 3;
    const videoLinksResponse: VideoLinkResponse[] = videoLinks.map((vl) => ({
        id: vl.id,
        url: vl.url,
        status: vl.status,
        trackCode: vl.trackCode,
        licenseId: vl.licenseId,
        isEditable,
        createdAt: vl.createdAt,
        updatedAt: vl.updatedAt,
    }));

    return {
        licenseId,
        videoLinks: videoLinksResponse,
    };
};
