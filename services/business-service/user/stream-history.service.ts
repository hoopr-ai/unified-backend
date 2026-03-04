import { Op } from "sequelize";
import {
  RecordStreamRequestData,
  StreamHistoryItem,
  StreamHistoryResponse,
  StreamTrackInfo,
  StreamType,
} from "../../dto-service/modules.export";
import { recordStream, getUserStreamHistory } from "../../persistence-service/exports";
import { findTrackByTrackCode } from "../../persistence-service/exports";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { AppError } from "../../helper-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";
import { RawTrackWithMappings } from "../../dto-service/modules.export";

// Resolve ownerType and ownerSubType from a list of tracks
const buildOwnerMaps = async (
  tracks: (RawTrackWithMappings | undefined)[],
): Promise<{ ownerTypeMap: Map<string, string>; ownerSubTypeMap: Map<string, string> }> => {
  const allOwnerIds: string[] = [];
  tracks.forEach((track) => {
    if (track?.ownerId && Array.isArray(track.ownerId)) {
      allOwnerIds.push(...track.ownerId);
    }
  });

  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();

  const uniqueOwnerIds = [...new Set(allOwnerIds)];
  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: ["id", "type", "subType"],
    });
    owners.forEach((owner) => {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
      if (owner.subType) ownerSubTypeMap.set(owner.id, owner.subType);
    });
  }

  return { ownerTypeMap, ownerSubTypeMap };
};

const getStandardToken = (skus?: { skuType?: string; token?: number }[]): number => {
  if (skus && skus.length > 0) {
    const standard = skus.find((s) => s.skuType === "N") || skus[0];
    return standard.token ?? 1;
  }
  return 1;
};

const resolveOwnerInfo = (
  ownerId: string[] | undefined,
  ownerTypeMap: Map<string, string>,
  ownerSubTypeMap: Map<string, string>,
): { ownerType?: string; ownerSubType?: string } => {
  if (!ownerId || !Array.isArray(ownerId)) return {};
  let ownerType: string | undefined;
  let ownerSubType: string | undefined;
  for (const oid of ownerId) {
    if (!ownerType && ownerTypeMap.get(oid)) ownerType = ownerTypeMap.get(oid);
    if (!ownerSubType && ownerSubTypeMap.get(oid)) ownerSubType = ownerSubTypeMap.get(oid);
    if (ownerType && ownerSubType) break;
  }
  return { ownerType, ownerSubType };
};

export const recordStreamService = async (
  data: RecordStreamRequestData,
  userId?: number,
  platform?: string,
): Promise<{ recorded: boolean }> => {
  const normalizedStreamType = data.streamType?.toString().toUpperCase() as StreamType;
  if (!Object.values(StreamType).includes(normalizedStreamType)) {
    throw new AppError(`Invalid streamType. Allowed values: ${Object.values(StreamType).join(", ")}`, 400);
  }

  const track = await findTrackByTrackCode(data.trackCode);
  if (!track) {
    throw new AppError(ErrorMessages.TrackNotFound, 404);
  }

  await recordStream(userId, data.trackCode, normalizedStreamType, platform);
  return { recorded: true };
};

export const getStreamHistoryService = async (
  userId: number,
  page: number = 1,
  limit: number = 10,
): Promise<StreamHistoryResponse> => {
  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10;

  const { rows, count } = await getUserStreamHistory(userId, validPage, validLimit);

  // Collect all raw track data for owner resolution
  const rawTracks = rows.map((r) => (r as any).track as RawTrackWithMappings | undefined);
  const { ownerTypeMap, ownerSubTypeMap } = await buildOwnerMaps(rawTracks);

  const streams: StreamHistoryItem[] = rows.map((record) => {
    const raw = record.toJSON() as any;
    const track: RawTrackWithMappings | undefined = raw.track;

    let trackInfo: StreamTrackInfo | undefined;
    if (track) {
      const { ownerType, ownerSubType } = resolveOwnerInfo(track.ownerId, ownerTypeMap, ownerSubTypeMap);

      const primaryArtists = (track.trackArtistMappings ?? [])
        .filter((m: any) => m.isPrimary && m.artist)
        .map((m: any) => ({
          id: m.artist.id,
          name: m.artist.name,
          type: m.artist.type || [],
        }));

      trackInfo = {
        id: track.id,
        name: track.name || "",
        name_slug: track.name_slug || "",
        mp3Link: track.mp3Link ?? null,
        waveformLink: track.waveformLink ?? null,
        duration: (track as any).duration,
        trending: track.trending ?? null,
        hasVocals: track.hasVocals ?? null,
        primaryArtists,
        token: getStandardToken(track.skus),
        ...(ownerType && { ownerType }),
        ...(ownerSubType && { ownerSubType }),
      };
    }

    return {
      id: raw.id,
      trackCode: raw.trackCode,
      streamType: raw.streamType as StreamType,
      platform: raw.platform,
      count: raw.count,
      firstStreamedAt: raw.createdAt,
      lastStreamedAt: raw.lastStreamedAt,
      track: trackInfo,
    };
  });

  const totalPages = Math.ceil(count / validLimit);

  return {
    streams,
    pagination: {
      page: validPage,
      limit: validLimit,
      totalItems: count,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPrevPage: validPage > 1,
    },
  };
};
