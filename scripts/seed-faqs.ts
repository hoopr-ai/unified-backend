import { Sequelize } from "sequelize-typescript";
import { config } from "dotenv";
import {
  FaqModel,
  FaqSectionModel,
} from "../services/persistence-service/faq/modules.export";
import { Platform } from "../services/dto-service/constants/common.enums";
import { normalizePlatform } from "../services/dto-service/constants/platform";

config();

const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false },
  },
  define: { freezeTableName: true, timestamps: true },
});

sequelize.addModels([FaqSectionModel, FaqModel]);

// Section definitions
const SECTIONS = [
  { slug: "CREDITS_AND_USAGE_LINKS", name: "Credits & Usage Links", order: 1 },
  { slug: "PLATFORM_USAGE", name: "Platform Usage", order: 2 },
  { slug: "MUSIC_USAGE", name: "Music Usage", order: 3 },
  { slug: "LICENSING_TERMS", name: "Licensing Terms", order: 4 },
];

// FAQs grouped by section slug
const FAQS_BY_SECTION: Record<string, Array<{ order: number; question: string; answer: string }>> = {
  CREDITS_AND_USAGE_LINKS: [
    {
      order: 1,
      question: "I have licensed and downloaded a track. Can I use the same track to create multiple videos?",
      answer: "No. Each credit is valid for a single video usage only. If you wish to use the same track across multiple videos, each video will require a separate credit.",
    },
    {
      order: 2,
      question: "I only post content on one platform, but the platform requires me to submit three links. Can I use those three links for three different videos that all feature the same track?",
      answer: "No. The three links must correspond to the same video posted across three different platforms (e.g., Instagram, YouTube Shorts, and Facebook). Using the same credit for three separate videos is not permitted.",
    },
    {
      order: 3,
      question: "I downloaded a track and a credit was deducted, but the download did not complete successfully. What should I do?",
      answer: "There is no need to worry. You can revisit the Downloads section on the platform and re-download the track at no additional credit cost. Your original credit deduction will not be charged again.",
    },
    {
      order: 4,
      question: "Do I need to upload video usage links for Hoopr Originals tracks as well?",
      answer: "Yes. Uploading your video usage links is mandatory for all tracks downloaded from the platform, including Hoopr Originals. This applies regardless of the track type or source.",
    },
    {
      order: 5,
      question: "Is there a limit on the number of Hoopr Originals tracks I can download?",
      answer: "No, there is no download limit for Hoopr Originals tracks. You are free to download and use as many Hoopr Originals tracks as you need for your content.",
    },
    {
      order: 6,
      question: "Why am I required to upload links to the content I have posted?",
      answer: "Uploading your content links is essential for whitelisting and legal clearance purposes. Only the specific links you submit will be officially cleared and covered under your license. Content posted without a corresponding link submission is not covered.",
    },
    {
      order: 7,
      question: "What happens if I use multiple tracks in the same video?",
      answer: "Each track used in a single video will be counted as a separate license. You will need to add the relevant video links against each corresponding track individually to ensure all usages are properly cleared.",
    },
    {
      order: 8,
      question: "Can I collaborate with another brand using a licensed track?",
      answer: "No. Brand collaborations require both brands to independently hold a valid credit for the same track. A single credit cannot be shared between two brands for collaborative content.",
    },
  ],
  PLATFORM_USAGE: [
    {
      order: 1,
      question: "Can I add team members to my Hoopr Smash account?",
      answer: "Yes. You can easily add team members by navigating to the Team page on the platform and entering their email address to send an invitation. They will receive an email with their login credentials to access the account.",
    },
  ],
  MUSIC_USAGE: [
    {
      order: 1,
      question: "Am I allowed to remix a licensed track for use in my video?",
      answer: "No. Remixing of licensed tracks is strictly not permitted. The track must be used in its original form as available on the platform.",
    },
    {
      order: 2,
      question: "Can I layer or overlay the licensed track with other tracks or sound effects in my video?",
      answer: "Overlaying two different licensed tracks within the same video is not allowed. However, you are permitted to pair your licensed track with sound effects (SFX) as part of your content.",
    },
    {
      order: 3,
      question: "Can I use different segments of the licensed track at multiple points throughout my video?",
      answer: "Yes. You are free to cut and place various portions of the licensed track at different timestamps within your video. Creative editing of the track's placement is permitted.",
    },
    {
      order: 4,
      question: "Can I use the licensed track in performance-based or paid advertising campaigns?",
      answer: "Yes. The licensed track may be used in performance ads, including paid promotional content on supported platforms.",
    },
    {
      order: 5,
      question: "Can I boost or promote content that features a track downloaded from Hoopr Smash?",
      answer: "Yes. You are permitted to boost or promote content that includes a track licensed through Hoopr Smash.",
    },
    {
      order: 6,
      question: "Can I collaborate with an influencer to feature the licensed track in their content?",
      answer: "Yes, influencer collaborations are permitted. However, this applies to influencers only, not celebrities. The following categories are excluded from eligibility: film and web show personalities, micro-drama creators, sports personalities, music and arts personalities, public figures, and mega-influencers with an audience of 1 million or more followers.",
    },
    {
      order: 7,
      question: "What is the maximum video duration allowed for using a licensed track?",
      answer: "Licensed tracks may be used in videos with a maximum duration of 60 seconds. For longer video formats, please refer to the Hoopr Originals track category.",
    },
    {
      order: 8,
      question: "Can I use a licensed track in long-form YouTube videos?",
      answer: "Long-form YouTube videos are only supported when using Hoopr Originals tracks. Standard licensed tracks are limited to short-form content only.",
    },
    {
      order: 9,
      question: "Can I use the licensed track in short-form content recorded in landscape mode?",
      answer: "Yes. There are no restrictions on the video orientation. You may use the licensed track in short-form content regardless of whether it is filmed in landscape or portrait mode.",
    },
    {
      order: 10,
      question: "On which platforms can I post content that features a licensed track?",
      answer: "Licensed tracks may be used for content published on the following platforms: Facebook, YouTube Shorts, and Instagram. Please ensure your usage links for these platforms are uploaded accordingly.",
    },
    {
      order: 11,
      question: "What is the difference between an influencer and a celebrity for the purpose of collaborations?",
      answer: "For the purposes of Hoopr Smash's licensing guidelines, a celebrity includes individuals associated with films, web shows, micro-drama, sports, TV serials, music and arts, public figures, and mega-influencers with an audience of 1 million or more followers. Any creator who does not fall into these categories is considered an influencer.",
    },
    {
      order: 12,
      question: "What are the usage restrictions specific to Hoopr Originals tracks?",
      answer: "Hoopr Originals tracks are licensed for use in long-form digital video content only. They may not be used in theatrical films, web series, or television commercials (TVCs).",
    },
  ],
  LICENSING_TERMS: [
    {
      order: 1,
      question: "I received a legal notice from a music label despite using a track licensed through Hoopr Smash. What should I do?",
      answer: "Please contact our Customer Success team immediately by writing to us at the designated support channel. We will provide full support and assistance, provided that the track was used strictly in accordance with our platform's licensing terms.",
    },
    {
      order: 2,
      question: "Are there any restricted categories of content that cannot use certain licensed tracks?",
      answer: "Yes, certain tracks may have content category restrictions depending on the music partner. You can find details about any applicable restrictions on the respective track's detail page on the platform.",
    },
    {
      order: 3,
      question: "Can an influencer share or repost my organic content featuring a licensed track on their profile?",
      answer: "Yes. Non-sponsored sharing or reposting of your organic content by an influencer is permitted under the licensing terms.",
    },
    {
      order: 4,
      question: "Are there any restrictions on the production value or quality of videos that use a licensed track?",
      answer: "No. There are no restrictions related to the production value of your content. You are free to use the licensed track in videos of any production standard.",
    },
    {
      order: 5,
      question: "How long is my license valid after I publish the content?",
      answer: "Your license remains valid for 12 months from the date of publication of the content. Ensure that your video is archived or taken down after this period unless the license is renewed.",
    },
    {
      order: 6,
      question: "What should I do once my license duration expires?",
      answer: "Once the 12-month license period ends, you have two options: you may archive or remove the video from your platform, or you can reach out to our Customer Success team to discuss renewal at an additional cost.",
    },
    {
      order: 7,
      question: "Can I purchase a multi-year license for a track?",
      answer: "Multi-year licensing options are available. Please reach out to our Customer Success team directly to explore this option and get a customised quote.",
    },
  ],
};

async function seedFaqs() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database");

    // Ensure tables exist
    await sequelize.sync({ force: false, alter: false });

    // normalizePlatform, not the bare enum member: these sections belong to the
    // CREATOR app, and the rows have to carry the value it is stored under.
    const platform = normalizePlatform(Platform.CREATOR);
    const sectionMap: Record<string, number> = {};

    // Create sections first
    console.log("\n--- Seeding Sections ---");
    for (const section of SECTIONS) {
      const [sectionRecord, created] = await FaqSectionModel.findOrCreate({
        where: { platform, slug: section.slug },
        defaults: {
          platform,
          slug: section.slug,
          name: section.name,
          order: section.order,
          isActive: true,
          createdAt: new Date(),
        },
      });

      sectionMap[section.slug] = sectionRecord.id;

      if (created) {
        console.log(`Created section: ${section.name}`);
      } else {
        console.log(`Section exists: ${section.name}`);
      }
    }

    // Create FAQs
    console.log("\n--- Seeding FAQs ---");
    let inserted = 0;
    let skipped = 0;

    for (const [sectionSlug, faqs] of Object.entries(FAQS_BY_SECTION)) {
      const sectionId = sectionMap[sectionSlug];
      if (!sectionId) {
        console.log(`Section not found: ${sectionSlug}`);
        continue;
      }

      for (const faq of faqs) {
        const [, created] = await FaqModel.findOrCreate({
          where: {
            sectionId,
            question: faq.question,
          },
          defaults: {
            sectionId,
            question: faq.question,
            answer: faq.answer,
            order: faq.order,
            isActive: true,
            createdAt: new Date(),
          },
        });

        if (created) {
          inserted++;
          console.log(`Inserted: ${faq.question.slice(0, 50)}...`);
        } else {
          skipped++;
          console.log(`Skipped: ${faq.question.slice(0, 50)}...`);
        }
      }
    }

    console.log(`\nDone - ${inserted} inserted, ${skipped} skipped`);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedFaqs();
