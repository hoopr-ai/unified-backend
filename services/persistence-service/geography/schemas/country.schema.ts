import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement } from "sequelize-typescript";

export interface CountryAttributes {
  id: number;
  name: string;
}

@Table({ tableName: "countries", timestamps: false })
export class CountryModel extends Model<CountryModel, CountryAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({ type: DataType.STRING(100), allowNull: false })
  name!: string;
}
