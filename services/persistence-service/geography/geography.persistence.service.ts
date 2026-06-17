import { Op } from "sequelize";
import { CountryModel, type CountryAttributes } from "./schemas/country.schema";
import { StateModel, type StateAttributes } from "./schemas/state.schema";
import { CityModel, type CityAttributes } from "./schemas/city.schema";

export interface PaginatedResult<T> {
  totalItems: number;
  rows: T[];
}

export const findCountries = async (
  page?: number,
  limit?: number,
): Promise<PaginatedResult<CountryAttributes>> => {
  const options: any = { order: [["name", "ASC"]] };
  if (page && limit) {
    options.limit = limit;
    options.offset = (page - 1) * limit;
  }
  const { rows, count } = await CountryModel.findAndCountAll(options);
  return { totalItems: count, rows };
};

export const findStates = async (
  page?: number,
  limit?: number,
  countryId?: number,
): Promise<PaginatedResult<StateAttributes>> => {
  const where: any = {};
  if (countryId) where.country_id = countryId;

  const options: any = { where, order: [["name", "ASC"]] };
  if (page && limit) {
    options.limit = limit;
    options.offset = (page - 1) * limit;
  }
  const { rows, count } = await StateModel.findAndCountAll(options);
  return { totalItems: count, rows };
};

export const findCities = async (
  page?: number,
  limit?: number,
  stateId?: number,
  countryId?: number,
): Promise<PaginatedResult<CityAttributes>> => {
  const where: any = {};
  if (stateId) where.state_id = stateId;
  if (countryId) where.country_id = countryId;

  const options: any = { where, order: [["name", "ASC"]] };
  if (page && limit) {
    options.limit = limit;
    options.offset = (page - 1) * limit;
  }
  const { rows, count } = await CityModel.findAndCountAll(options);
  return { totalItems: count, rows };
};
