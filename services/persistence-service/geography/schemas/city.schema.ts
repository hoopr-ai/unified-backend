import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement } from "sequelize-typescript";

export interface CityAttributes {
  id: number;
  name: string;
  state_id: number;
  country_id: number;
  state_code?: string | null;
  country_code?: string | null;
}

@Table({ tableName: "cities", timestamps: false })
export class CityModel extends Model<CityModel, CityAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({ type: DataType.STRING(100), allowNull: false })
  name!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, field: "state_id" })
  state_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, field: "country_id" })
  country_id!: number;

  @Column({ type: DataType.STRING(10), allowNull: true, field: "state_code" })
  state_code?: string | null;

  @Column({ type: DataType.STRING(10), allowNull: true, field: "country_code" })
  country_code?: string | null;
}
