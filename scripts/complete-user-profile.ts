// Fill placeholder profile data for users who are stuck on the FE
// "complete your profile" popup, so they land straight on the home screen.
//
// `isProfileComplete` is a computed getter on UserModel — it is true only when
// firstName, lastName, mobile, countryCode and profileRole are ALL set. This
// script fills whichever of those are missing (never overwrites real data),
// flips INVITED -> ACTIVE the way the normal complete-profile flow does, and
// optionally attaches the user to a brand (the FE needs one for licensing).
//
// Dry-run by default — pass --commit to actually write.
//
// Usage:
//   npx ts-node scripts/complete-user-profile.ts --emails=a@x.com,b@x.com
//   npx ts-node scripts/complete-user-profile.ts --emails=a@x.com --commit
//   npx ts-node scripts/complete-user-profile.ts --emails=a@x.com --brand=19 --commit
//   npx ts-node scripts/complete-user-profile.ts --emails=a@x.com --brand-name="bharat24live" --commit
import "dotenv/config";
import { Op } from "sequelize";
import { connectDatabase } from "../services/persistence-service/database";
import {
  UserModel,
  UserProfileModel,
} from "../services/persistence-service/user/modules.export";
import { BrandModel } from "../services/persistence-service/brand/modules.export";
import { OrganizationModel } from "../services/persistence-service/organization/modules.export";
import {
  ProfileRole,
  UserStatus,
  BrandStatus,
  OrganizationStatus,
} from "../services/dto-service/modules.export";

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : undefined;
};

const emails = (arg("emails") || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const brandIdArg = arg("brand") ? Number(arg("brand")) : undefined;
const brandNameArg = arg("brand-name");
const defaultRole = (arg("role") || ProfileRole.MARKETING_BRAND) as ProfileRole;
const defaultCountryCode = arg("country-code") || "+91";
// The complete-profile form also demands an Instagram link, so a user with no
// user_profiles row can still read as "incomplete" on the FE — fill one too.
const instagramArg = arg("instagram");
// Overwrite firstName/lastName that are already set (e.g. an inviter's name
// copy-pasted onto every invited user) with names derived from the email.
const fixNames = process.argv.includes("--fix-names");
const commit = process.argv.includes("--commit");

if (!emails.length) {
  console.error(
    "Usage: npx ts-node scripts/complete-user-profile.ts --emails=<a@x.com,b@x.com> [--brand=<id>] [--brand-name=<name>] [--role=<ProfileRole>] [--country-code=+91] [--commit]",
  );
  process.exit(1);
}

if (!Object.values(ProfileRole).includes(defaultRole)) {
  console.error(`Invalid --role. Allowed: ${Object.values(ProfileRole).join(", ")}`);
  process.exit(1);
}

// Split the email local part into a first/last name pair so the placeholder at
// least resembles the person ("manojkumar@..." -> "Manoj Kumar"). Falls back to
// "User" as a surname when the local part is a single token.
const KNOWN_SPLITS: Record<string, [string, string]> = {
  manojkumar: ["Manoj", "Kumar"],
  satishchandra: ["Satish", "Chandra"],
  vivekbhandari: ["Vivek", "Bhandari"],
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const deriveName = (email: string): [string, string] => {
  const local = email.split("@")[0].replace(/[^a-zA-Z]+/g, " ").trim();
  const key = local.replace(/\s+/g, "").toLowerCase();
  if (KNOWN_SPLITS[key]) return KNOWN_SPLITS[key];

  const parts = local.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return [titleCase(parts[0]), titleCase(parts.slice(1).join(""))];
  return [titleCase(parts[0] || "User"), "User"];
};

// users has a unique (mobile, countryCode, platform) index, so the placeholder
// number has to be free. Walk forward from a deterministic 90000xxxxx seed
// until an unused one is found.
const allocateMobile = async (
  userId: number,
  countryCode: string,
  platform: string,
): Promise<string> => {
  let candidate = `90000${String(userId).padStart(5, "0")}`.slice(0, 10);
  for (let i = 0; i < 100; i++) {
    const clash = await UserModel.findOne({
      where: { mobile: candidate, countryCode, platform },
      attributes: ["id"],
    });
    if (!clash) return candidate;
    candidate = String(Number(candidate) + 1);
  }
  throw new Error(`Could not allocate a free placeholder mobile for user ${userId}`);
};

(async () => {
  await connectDatabase();

  const users = await UserModel.findAll({
    where: { email: { [Op.in]: emails } },
    order: [["id", "ASC"]],
  });

  const missing = emails.filter(
    (e) => !users.some((u) => (u.email || "").toLowerCase() === e),
  );
  if (missing.length) console.warn(`⚠️  No user row found for: ${missing.join(", ")}`);
  if (!users.length) process.exit(1);

  // Resolve the brand to attach to users that have none. --brand wins, then
  // --brand-name (reused if a brand by that name already exists), else the
  // shared email domain, so team-mates land on one brand instead of three.
  let fallbackBrandId: number | undefined = brandIdArg;
  let fallbackBrandLabel = "";

  if (fallbackBrandId) {
    const brand = await BrandModel.findByPk(fallbackBrandId, { attributes: ["id", "name"] });
    if (!brand) throw new Error(`Brand ${fallbackBrandId} not found`);
    fallbackBrandLabel = `${brand.name} (existing, id=${brand.id})`;
  }

  const needsBrand = users.filter((u) => !u.brandId);
  const brandName = (
    brandNameArg || emails[0].split("@")[1]?.split(".")[0] || ""
  )
    .toLowerCase()
    .trim();

  if (!fallbackBrandId && needsBrand.length) {
    const existing = await BrandModel.findOne({
      where: { name: brandName },
      attributes: ["id", "name"],
      order: [["id", "ASC"]],
    });
    if (existing) {
      fallbackBrandId = existing.id;
      fallbackBrandLabel = `${existing.name} (existing, id=${existing.id})`;
    } else {
      fallbackBrandLabel = `${brandName} (will be created with a new organization)`;
    }
  }

  const instagramLink =
    instagramArg || `https://www.instagram.com/${brandName || "brand"}`;

  const existingProfiles = await UserProfileModel.findAll({
    where: { userId: { [Op.in]: users.map((u) => u.id) } },
  });
  const profileByUser = new Map(
    existingProfiles.map((p) => [String(p.userId), p]),
  );

  // Field fills are decided once here so the dry-run print and the write pass
  // can never drift apart.
  const buildUpdates = (user: UserModel): Record<string, unknown> => {
    const [firstName, lastName] = deriveName(user.email);
    const updates: Record<string, unknown> = {};
    if (!user.firstName || fixNames) updates.firstName = firstName;
    if (!user.lastName || fixNames) updates.lastName = lastName;
    if (!user.countryCode) updates.countryCode = defaultCountryCode;
    if (!user.profileRole) updates.profileRole = defaultRole;
    if (user.status !== UserStatus.ACTIVE) updates.status = UserStatus.ACTIVE;
    if (updates.firstName === user.firstName) delete updates.firstName;
    if (updates.lastName === user.lastName) delete updates.lastName;
    return updates;
  };

  const plan = [] as Array<Record<string, unknown>>;

  for (const user of users) {
    const countryCode = user.countryCode || defaultCountryCode;
    const updates = buildUpdates(user);
    if (!user.mobile) {
      updates.mobile = `90000${String(user.id).padStart(5, "0")}`.slice(0, 10);
    }

    const profile = profileByUser.get(String(user.id));
    plan.push({
      userId: user.id,
      email: user.email,
      platform: user.platform,
      currentStatus: user.status,
      currentBrandId: user.brandId ?? null,
      currentName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      currentMobile: user.mobile ? `${countryCode} ${user.mobile}` : null,
      isProfileCompleteNow: user.isProfileComplete,
      updates: Object.keys(updates).length ? updates : "nothing to change",
      brandToAttach: user.brandId ? null : fallbackBrandLabel,
      socialProfileRow: profile?.instagramLink
        ? "already present"
        : `will set instagramLink=${instagramLink}`,
    });
  }

  console.log(
    JSON.stringify({ mode: commit ? "COMMIT" : "DRY RUN", plan }, null, 2),
  );

  if (!commit) {
    console.log("\nDry run only — re-run with --commit to apply.");
    process.exit(0);
  }

  // Create the shared brand/organization once, only if someone actually needs it.
  if (!brandIdArg && needsBrand.length && !(await BrandModel.findOne({ where: { name: brandName } }))) {
    const now = new Date();
    const org = await OrganizationModel.create({
      name: brandName,
      status: OrganizationStatus.ACTIVE,
      createdBy: needsBrand[0].id,
      createdAt: now,
    } as any);
    const brand = await BrandModel.create({
      name: brandName,
      organizationId: (org as any).id,
      status: BrandStatus.ACTIVE,
      createdBy: needsBrand[0].id,
      createdAt: now,
    } as any);
    fallbackBrandId = (brand as any).id;
    console.log(`✅ Created organization ${(org as any).id} + brand ${fallbackBrandId} "${brandName}"`);
  } else if (!fallbackBrandId && needsBrand.length) {
    const existing = await BrandModel.findOne({ where: { name: brandName }, order: [["id", "ASC"]] });
    fallbackBrandId = (existing as any)?.id;
  }

  for (const user of users) {
    const countryCode = user.countryCode || defaultCountryCode;

    const updates = buildUpdates(user);
    if (!user.mobile) updates.mobile = await allocateMobile(user.id, countryCode, user.platform);
    if (!user.brandId && fallbackBrandId) updates.brandId = fallbackBrandId;

    if (Object.keys(updates).length) {
      await UserModel.update(updates, { where: { id: user.id } });
      console.log(`✅ ${user.email} — updated ${JSON.stringify(updates)}`);
    } else {
      console.log(`• ${user.email} — user row already complete, skipped`);
    }

    if (!profileByUser.get(String(user.id))?.instagramLink) {
      await UserProfileModel.upsert(
        { userId: user.id, instagramLink },
        { conflictFields: ["userId"] as any },
      );
      console.log(`✅ ${user.email} — social profile row set (instagram)`);
    }
  }

  const after = await UserModel.findAll({
    where: { email: { [Op.in]: emails } },
    order: [["id", "ASC"]],
  });
  console.log(
    "\nAfter:",
    JSON.stringify(
      after.map((u) => ({
        id: u.id,
        email: u.email,
        brandId: u.brandId ?? null,
        status: u.status,
        isProfileComplete: u.isProfileComplete,
      })),
      null,
      2,
    ),
  );

  process.exit(0);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
