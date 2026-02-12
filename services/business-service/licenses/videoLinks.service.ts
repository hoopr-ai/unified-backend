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
    VideoLinkResponse,
    VideoLinksListResponse,
} from "../../dto-service/licenses/modules.export";

export const addVideoLinkService = async (
    userId: number,
    data: AddVideoLinksRequest
): Promise<VideoLinkResponse[]> => {
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

    // Security check: Ensure the track has been downloaded at least once
    // Users should only be able to add video links to tracks they have actually downloaded
    if (license.numberOfDownloads === 0) {
        throw new AppError(
            "You must download the track at least once before adding video links. Please use the track download API first.",
            403
        );
    }

    // Check for duplicate types in the request
    const typesInRequest = videoLinks.map((vl) => vl.type);
    const uniqueTypes = new Set(typesInRequest);
    if (uniqueTypes.size !== typesInRequest.length) {
        throw new AppError(
            "Duplicate video link types are not allowed. Each type (INSTAGRAM, FACEBOOK, YOUTUBE) can only be added once.",
            400
        );
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

    // Check if any of the requested types already exist for this license
    const existingLinks = await getVideoLinksByLicenseId(licenseId);
    const existingTypes = new Set(existingLinks.map((link) => link.type));
    const conflictingTypes = typesInRequest.filter((type) => existingTypes.has(type));
    if (conflictingTypes.length > 0) {
        throw new AppError(
            `Video links of type(s) ${conflictingTypes.join(", ")} already exist for this license. Only one link per type is allowed.`,
            400
        );
    }

    // Create all video links
    const createdLinks: VideoLinkResponse[] = [];
    for (const videoLink of videoLinks) {
        const videoLinkDetails: VideoLinkDetails = {
            licenseId,
            url: videoLink.url,
            type: videoLink.type,
            trackCode,
            status: "ACTIVE",
        };

        const created = await createVideoLink(videoLinkDetails);
        createdLinks.push({
            id: created.id,
            url: created.url,
            type: created.type,
            status: created.status,
            trackCode: created.trackCode,
            licenseId: created.licenseId,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
        });
    }

    return createdLinks;
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
