import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Default,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { RailItemType } from "../../../dto-service/modules.export";
import { RailModel } from "./rail.schema";

export interface RailItemDetails {
  id?: number;
  railId: number;
  itemType: RailItemType;
  itemCode: string;
  order: number;
  isLocked?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "rail_items",
  timestamps: true,
  indexes: [
    { name: "rail_items_rail_order_idx", fields: ["railId", "order"] },
  ],
})
export class RailItemModel extends Model<RailItemModel, RailItemDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => RailModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  railId!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  itemType!: RailItemType;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  itemCode!: string;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order!: number;

  @Default(false)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  isLocked!: boolean;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;

  @BelongsTo(() => RailModel, { foreignKey: "railId", constraints: false })
  rail?: RailModel;
}
