import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface UtmLinkAttributes {
  id?: number;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  campaignObjective?: string | null;
  campaignRegion?: string | null;
  campaignChannel?: string | null;
  campaignMonthYear?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fullUrl: string;
  label?: string | null;
  createdByEmail?: string | null;
  createdByUserId?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * The UTM Builder registry, `utm_links` — a table that already exists and is
 * owned by the Python service (content-recommendation/utm_db.py, served at
 * /smash/utm/links and listed in internal-fe's UTM Builder). This model only
 * maps it; the columns, indexes and defaults are whatever that table already
 * has, and nothing here should try to change them.
 *
 * Columns are snake_case in the database and camelCase here, unlike the rest
 * of this codebase's tables. Every one carries an explicit `field`: the
 * model-level `underscored` option does NOT do this job, because @Column
 * already pins `field` to the property name and underscored only fills in
 * attributes that have none. Without these the INSERT names columns that do
 * not exist.
 *
 * Rows are of two kinds and the schema does not separate them: links a
 * marketer built in the Builder, and campaign visits recorded by
 * recordUtmArrival. The marker is `label`, which starts "visit:" on the
 * second kind and never on the first — not `createdByEmail`, which a visit
 * also fills when the visitor happened to be signed in.
 */
@Table({ tableName: "utm_links", timestamps: true })
export class UtmLinkModel extends Model<UtmLinkModel, UtmLinkAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({ type: DataType.TEXT, allowNull: false, field: "destination_url" })
  destinationUrl!: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: "utm_source" })
  utmSource!: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: "utm_medium" })
  utmMedium!: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: "utm_campaign" })
  utmCampaign!: string;

  // The four campaign-taxonomy columns are the Builder's own form fields. A
  // visit has no way to know them, so they stay null on a visit row.
  @Column({ type: DataType.TEXT, allowNull: true, field: "campaign_objective" })
  campaignObjective?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: "campaign_region" })
  campaignRegion?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: "campaign_channel" })
  campaignChannel?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: "campaign_month_year" })
  campaignMonthYear?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: "utm_content" })
  utmContent?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: "utm_term" })
  utmTerm?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, field: "full_url" })
  fullUrl!: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: "label" })
  label?: string | null;

  // On a Builder row: who created the link. On a visit row: the signed-in
  // visitor, or null when the visit was anonymous — which is most of them,
  // since a campaign's job is bringing people who have no account yet.
  @Column({ type: DataType.TEXT, allowNull: true, field: "created_by_email" })
  createdByEmail?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true, field: "created_by_user_id" })
  createdByUserId?: number | null;

  @CreatedAt
  @Column({ type: DataType.DATE, field: "created_at" })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, field: "updated_at" })
  updatedAt!: Date;
}
