import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";
import type { AlbumType } from "../../../dto-service/modules.export";

export interface AlbumDetails {
  id: string;
  title?: string;
  type?: AlbumType;
  trackId?: string[];
  deleted?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "albums",
  timestamps: true,
})
export class AlbumModel extends Model<AlbumModel, AlbumDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  title?: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  type?: AlbumType;

  @Column({
    type: DataType.ARRAY(DataType.UUID),
    allowNull: true,
  })
  trackId?: string[];

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  deleted?: Date | null;

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
}
