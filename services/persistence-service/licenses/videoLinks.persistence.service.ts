import { VideoLinkModel, type VideoLinkDetails } from "./schemas/modules.export";

export const createVideoLink = async (
    videoLinkDetails: VideoLinkDetails
): Promise<VideoLinkModel> => {
    const videoLink = await VideoLinkModel.create(videoLinkDetails);
    return videoLink;
};

export const getVideoLinksByLicenseId = async (
    licenseId: number
): Promise<VideoLinkModel[]> => {
    const videoLinks = await VideoLinkModel.findAll({
        where: { licenseId },
        order: [["createdAt", "DESC"]],
    });
    return videoLinks;
};

export const countVideoLinksByLicenseId = async (
    licenseId: number
): Promise<number> => {
    const count = await VideoLinkModel.count({
        where: { licenseId },
    });
    return count;
};
