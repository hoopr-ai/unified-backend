import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    CreatedAt,
    UpdatedAt,
    ForeignKey,
    BelongsTo,
    Index,
} from "sequelize-typescript";
import { LicenseModel } from "./licenses.schema";
import { UserModel } from "../../user/schemas/modules.export";
import { BrandModel } from "../../brand/schemas/modules.export";

export interface VideoLinkDetails {
    id?: number;
    url: string;
    status?: string;
    trackCode?: string;
    licenseId: number;
    userId?: number;
    brandId?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

@Table({
    tableName: "video_links",
    timestamps: true,
})
export class VideoLinkModel extends Model<VideoLinkModel, VideoLinkDetails> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @Column({
        type: DataType.TEXT,
        allowNull: false,
    })
    url!: string;

    @Column({
        type: DataType.STRING(50),
        allowNull: false,
        defaultValue: "ACTIVE",
    })
    status!: string;

    @Column({
        type: DataType.STRING(100),
        allowNull: true,
    })
    trackCode?: string;

    @Index({ name: "idx_video_links_license_id" })
    @ForeignKey(() => LicenseModel)
    @Column({
        type: DataType.BIGINT,
        allowNull: false,
    })
    licenseId!: number;

    @Index({ name: "idx_video_links_user_id" })
    @ForeignKey(() => UserModel)
    @Column({
        type: DataType.BIGINT,
        allowNull: true,
    })
    userId?: number;

    @Index({ name: "idx_video_links_brand_id" })
    @ForeignKey(() => BrandModel)
    @Column({
        type: DataType.BIGINT,
        allowNull: true,
    })
    brandId?: number;

    @CreatedAt
    @Column({
        type: DataType.DATE,
    })
    createdAt!: Date;

    @UpdatedAt
    @Column({
        type: DataType.DATE,
    })
    updatedAt!: Date;

    @BelongsTo(() => LicenseModel)
    license!: LicenseModel;

    @BelongsTo(() => UserModel)
    user?: UserModel;

    @BelongsTo(() => BrandModel)
    brand?: BrandModel;
}
