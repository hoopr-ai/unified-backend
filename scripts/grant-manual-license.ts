// Manually grant a track license to a brand WITHOUT deducting any credits.
//
// Mirrors the non-token path of licenseTrackService: creates the `licenses` row
// (which is what powers both the brand's Downloads and Licenses screens),
// generates the license PDF and stores it on GCS. It never touches
// token_assigned, so the brand's credit balance is unchanged.
//
// Dry-run by default — pass --commit to actually write.
//
// Usage:
//   npx ts-node scripts/grant-manual-license.ts --brand=19 --track=20832
//   npx ts-node scripts/grant-manual-license.ts --brand=19 --track=20832 --user=123 --commit
import "dotenv/config";
import { Op } from "sequelize";
import { connectDatabase } from "../services/persistence-service/database";
import { LicenseModel } from "../services/persistence-service/licenses/modules.export";
import { BrandModel } from "../services/persistence-service/brand/modules.export";
import { UserModel } from "../services/persistence-service/user/modules.export";
import { TrackModel } from "../services/persistence-service/track/modules.export";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";
import {
  generateLicensePdf,
  buildLicensePdfGcsPath,
  uploadBufferToGCS,
} from "../services/helper-service/modules.export";

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : undefined;
};

const brandId = Number(arg("brand"));
const trackCode = arg("track");
const userIdArg = arg("user") ? Number(arg("user")) : undefined;
const commit = process.argv.includes("--commit");

if (!Number.isInteger(brandId) || brandId <= 0 || !trackCode) {
  console.error(
    "Usage: npx ts-node scripts/grant-manual-license.ts --brand=<brandId> --track=<trackCode> [--user=<userId>] [--commit]",
  );
  process.exit(1);
}

(async () => {
  await connectDatabase();

  const brand = await BrandModel.findByPk(brandId, { attributes: ["id", "name"] });
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const track = await TrackModel.findOne({
    where: { trackCode },
    attributes: ["id", "trackCode", "name", "ownerId", "mp3Link", "type"],
  });
  if (!track) throw new Error(`Track ${trackCode} not found`);

  // Attribute the license to an explicit user, else the oldest active user on
  // the brand — the licenses table requires a userId and the UI shows it as
  // "downloaded by".
  const user = userIdArg
    ? await UserModel.findByPk(userIdArg, {
        attributes: ["id", "brandId", "email", "firstName", "lastName", "mobile"],
      })
    : await UserModel.findOne({
        where: { brandId, status: "ACTIVE" },
        attributes: ["id", "brandId", "email", "firstName", "lastName", "mobile"],
        order: [["id", "ASC"]],
      });

  if (!user) throw new Error(`No user found to attribute the license to (brand ${brandId})`);
  // pg returns BIGINT columns as strings, so compare numerically — a strict
  // !== would reject the "19" vs 19 case that this guard is meant to allow.
  if (Number(user.brandId) !== brandId) {
    throw new Error(`User ${user.id} belongs to brand ${user.brandId}, not ${brandId}`);
  }

  const duplicate = await LicenseModel.findOne({
    where: { brandId, trackCode },
    attributes: ["id", "licensedAt"],
  });

  const now = new Date();
  const validThrough = new Date(now);
  validThrough.setFullYear(validThrough.getFullYear() + 1);

  console.log(
    JSON.stringify(
      {
        mode: commit ? "COMMIT" : "DRY RUN",
        brand: { id: brand.id, name: brand.name },
        track: { id: track.id, trackCode: track.trackCode, name: track.name },
        attributedTo: { userId: user.id, email: user.email },
        existingLicenseForThisTrack: duplicate
          ? { id: duplicate.id, licensedAt: duplicate.licensedAt }
          : null,
        willInsert: { tokenCost: 0, licensedAt: now, validThrough },
        creditsDeducted: 0,
      },
      null,
      2,
    ),
  );

  if (!commit) {
    console.log("\nDry run only — re-run with --commit to write this license.");
    process.exit(0);
  }

  const created = await LicenseModel.create({
    brandId,
    userId: user.id,
    trackCode: track.trackCode,
    tokenCost: 0, // manual grant — no credits consumed
    licensedAt: now,
    validThrough,
    createdAt: now,
    campaignId: null,
  });

  console.log(`✅ License created: id=${created.id} (tokenCost=0, no credits deducted)`);

  // License PDF — same template/path convention as the normal licensing flow.
  try {
    const ownerIds = track.ownerId || [];
    let ownerName = "";
    if (ownerIds.length > 0) {
      const owner = await OwnerModel.findByPk(ownerIds[0], { attributes: ["id", "username"] });
      ownerName = owner?.username || "";
    }

    const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const pdfBuffer = await generateLicensePdf({
      name: [user.firstName, user.lastName].filter(Boolean).join(" "),
      email: user.email || "",
      mobile: user.mobile || "",
      date: formattedDate,
      trackName: track.name || "",
      ownerName,
      licenseId: created.id,
      brandId,
      brandName: brand.name || "",
    });

    const gcsPath = buildLicensePdfGcsPath(created.id, brandId);
    await uploadBufferToGCS({ buffer: pdfBuffer, gcsPath, contentType: "application/pdf" });
    await LicenseModel.update({ licensePdfPath: gcsPath }, { where: { id: created.id } });

    console.log(`✅ License PDF stored at ${gcsPath}`);
  } catch (err: any) {
    console.error(
      `⚠️  License row created (id=${created.id}) but PDF generation failed: ${err.message}`,
    );
    process.exit(2);
  }

  process.exit(0);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
