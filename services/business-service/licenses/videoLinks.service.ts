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
    AddVideoLinkRequest,
    VideoLinkResponse,
    VideoLinksListResponse,
} from "../../dto-service/licenses/modules.export";

export const addVideoLinkService = async (
    userId: number,
    data: AddVideoLinkRequest
): Promise<VideoLinkResponse> => {
    const { licenseId, url, type, trackCode } = data;

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

    // Security check: Ensure the track has been downloaded at least once
    // Users should only be able to add video links to tracks they have actually downloaded
    if (license.numberOfDownloads === 0) {
        throw new AppError(
            "You must download the track at least once before adding video links. Please use the track download API first.",
            403
        );
    }

    // Check video link limit: Maximum 3 links per license
    const existingLinksCount = await countVideoLinksByLicenseId(licenseId);
    if (existingLinksCount >= 3) {
        throw new AppError(
            `Maximum limit reached. You can only add up to 3 video links per downloaded track. Current count: ${existingLinksCount}`,
            400
        );
    }

    // Create video link
    const videoLinkDetails: VideoLinkDetails = {
        licenseId,
        url,
        type,
        trackCode,
        status: "ACTIVE",
    };

    const videoLink = await createVideoLink(videoLinkDetails);

    return {
        id: videoLink.id,
        url: videoLink.url,
        type: videoLink.type,
        status: videoLink.status,
        trackCode: videoLink.trackCode,
        licenseId: videoLink.licenseId,
        createdAt: videoLink.createdAt,
        updatedAt: videoLink.updatedAt,
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

    const videoLinksResponse: VideoLinkResponse[] = videoLinks.map((vl) => ({
        id: vl.id,
        url: vl.url,
        type: vl.type,
        status: vl.status,
        trackCode: vl.trackCode,
        licenseId: vl.licenseId,
        createdAt: vl.createdAt,
        updatedAt: vl.updatedAt,
    }));

    return {
        licenseId,
        videoLinks: videoLinksResponse,
    };
};
