import type { Request, Response } from "express";
import { catchAsync } from "../services/helper-service/modules.export";
import {
  findCountries,
  findStates,
  findCities,
} from "../services/persistence-service/geography/modules.export";

const geoResponse = (res: Response, data: object, message: string) => {
  res.status(200).json({ data, error: { code: 0, message } });
};

export const getCountries = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

  const { totalItems, rows } = await findCountries(page, limit);
  geoResponse(res, { totalItems, countries: rows }, "Successfully fetched countries.");
});

export const getStates = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const countryId = req.query.countryId ? parseInt(req.query.countryId as string) : undefined;

  const { totalItems, rows } = await findStates(page, limit, countryId);
  geoResponse(res, { totalItems, states: rows }, "Successfully fetched states.");
});

export const getCities = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const stateId = req.query.stateId ? parseInt(req.query.stateId as string) : undefined;
  const countryId = req.query.countryId ? parseInt(req.query.countryId as string) : undefined;

  const { totalItems, rows } = await findCities(page, limit, stateId, countryId);
  geoResponse(res, { totalItems, cities: rows }, "Successfully fetched cities.");
});
