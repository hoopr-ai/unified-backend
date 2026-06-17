import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement } from "sequelize-typescript";

export interface StateAttributes {
  id: number;
  name: string;
  country_id: number;
  country_code?: string | null;
}

@Table({ tableName: "states", timestamps: false })
export class StateModel extends Model<StateModel, StateAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({ type: DataType.STRING(100), allowNull: false })
  name!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, field: "country_id" })
  country_id!: number;

  @Column({ type: DataType.STRING(10), allowNull: true, field: "country_code" })
  country_code?: string | null;
}
