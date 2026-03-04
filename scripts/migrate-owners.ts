import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";

// ============ SOURCE DATABASE (select_staging) ============
const SOURCE_DB_CONFIG = {
    host: "34.100.172.44",
    port: 5432,
    user: "s-prod",
    password: "ROUG2gact4whif_oorn",
    database: "S-PROD",
};

// ============ TARGET DATABASE (unified_staging) ============
const TARGET_DB_CONFIG = {
    host: "34.47.200.207",
    port: 5432,
    username: "select-server-dev",
    password: "hO82GcLotttB5bLyoeG1",
    database: "sage_staging",
};

// Fields that exist in OwnerModel
const OWNER_MODEL_FIELDS = [
    "id",
    "ownerCode",
    "username",
    "revenueGenerated",
    "licenseStart",
    "licenseEnd",
    "isActive",
    "revenueShare",
    "remarks",
    "metadata",
    "deleted",
    "createdAt",
    "updatedAt",
    "IPRS",
    "category",
] as const;

function mapSourceOwnerToModel(sourceOwner: any): Partial<OwnerModel> {
    const mappedOwner: Record<string, any> = {};

    for (const field of OWNER_MODEL_FIELDS) {
        const sourceValue = sourceOwner[field];

        // Skip if field doesn't exist in source
        if (sourceValue === undefined) {
            continue;
        }

        // Pass through fields
        mappedOwner[field] = sourceValue;
    }

    return mappedOwner as Partial<OwnerModel>;
}

async function migrateOwners() {
    const sourceClient = new Client(SOURCE_DB_CONFIG);

    // Create Sequelize instance for target database
    const targetSequelize = new Sequelize({
        dialect: "postgres",
        host: TARGET_DB_CONFIG.host,
        port: TARGET_DB_CONFIG.port,
        username: TARGET_DB_CONFIG.username,
        password: TARGET_DB_CONFIG.password,
        database: TARGET_DB_CONFIG.database,
        logging: false,
        define: {
            freezeTableName: true,
            timestamps: true,
        },
    });

    // Register OwnerModel with this Sequelize instance
    targetSequelize.addModels([OwnerModel]);

    try {
        await sourceClient.connect();
        console.log("✅ Connected to source database (select_staging)");

        await targetSequelize.authenticate();
        console.log("✅ Connected to target database (unified_staging)");

        // Fetch all owners from source
        const { rows: owners } = await sourceClient.query(`SELECT * FROM owners`);
        console.log(`📦 Found ${owners.length} owners to migrate`);

        if (owners.length === 0) {
            console.log("No owners to migrate");
            return;
        }

        // Log fields that will be skipped
        if (owners.length > 0) {
            const sourceFields = Object.keys(owners[0]);
            const skippedFields = sourceFields.filter(
                (f) => !OWNER_MODEL_FIELDS.includes(f as any)
            );
            if (skippedFields.length > 0) {
                console.log(`⚠️  Skipping fields not in OwnerModel: ${skippedFields.join(", ")}`);
            }
        }

        let successCount = 0;
        let errorCount = 0;

        for (const owner of owners) {
            try {
                const mappedOwner = mapSourceOwnerToModel(owner);

                // Ensure id is present for upsert
                if (!mappedOwner.id) {
                    console.warn(`⚠️  Skipping owner with missing id`);
                    continue;
                }

                // Use upsert to handle conflicts on id
                await OwnerModel.upsert(mappedOwner as any, {
                    conflictFields: ["id"],
                });

                successCount++;

                if (successCount % 100 === 0) {
                    console.log(`⏳ Migrated ${successCount} owners...`);
                }
            } catch (err: any) {
                errorCount++;
                console.error(`❌ Error migrating owner ${owner.id}:`, err.message);
            }
        }

        console.log(
            `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`
        );
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await sourceClient.end();
        await targetSequelize.close();
    }
}

migrateOwners();
