import type { Request, Response } from "express";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  saveOrganization,
  findOrganizationByName,
  findOrganizationById,
  saveBrand,
  findBrandByNameAndOrganization,
} from "../services/persistence-service/exports";
import {
  OrganizationStatus,
  BrandStatus,
  type CreateOrganizationRequestData,
  type CreateBrandRequestData,
} from "../services/dto-service/modules.export";
import { AppError } from "../services/helper-service/AppError";

export const createOrganization = catchAsync(async (req: Request, res: Response) => {
  const { name, description, status } = req.body as CreateOrganizationRequestData;

  const existingOrganization = await findOrganizationByName(name);
  if (existingOrganization) {
    throw new AppError(ResponseMessages.OrganizationAlreadyExists, 400);
  }

  const organization = await saveOrganization({
    name,
    description,
    status: status || OrganizationStatus.ACTIVE,
    createdAt: new Date(),
  });

  res.status(201).json({
    data: {
      id: organization.id,
      name: organization.name,
      description: organization.description,
      status: organization.status,
      createdAt: organization.createdAt,
    },
    error: { code: 0, message: ResponseMessages.OrganizationCreatedSuccess },
  });
});

export const createBrand = catchAsync(async (req: Request, res: Response) => {
  const { organizationId, name, description, status } = req.body as CreateBrandRequestData;

  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(ResponseMessages.OrganizationNotFound, 404);
  }

  const existingBrand = await findBrandByNameAndOrganization(name, organizationId);
  if (existingBrand) {
    throw new AppError(ResponseMessages.BrandAlreadyExists, 400);
  }

  const brand = await saveBrand({
    organizationId,
    name,
    description,
    status: status || BrandStatus.ACTIVE,
    createdAt: new Date(),
  });

  res.status(201).json({
    data: {
      id: brand.id,
      organizationId: brand.organizationId,
      name: brand.name,
      description: brand.description,
      status: brand.status,
      createdAt: brand.createdAt,
    },
    error: { code: 0, message: ResponseMessages.BrandCreatedSuccess },
  });
});
