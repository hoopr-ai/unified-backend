import { Sequelize } from "sequelize-typescript";
import { OccasionModel } from "../services/persistence-service/occasion/modules.export";
import { config } from "dotenv";

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

sequelize.addModels([OccasionModel]);

const OCCASIONS = [
  { title: "Lohri", month: "jan", date: "13", className: "calendar-event-month jan", end: "2026-01-13" },
  { title: "Makar Sankranti", month: "jan", date: "14", className: "calendar-event-month jan", end: "2026-01-14" },
  { title: "Pongal", month: "jan", date: "15", className: "calendar-event-month jan", end: "2026-01-15" },
  { title: "Republic Day", month: "jan", date: "26", className: "calendar-event-month jan", end: "2026-01-26" },
  { title: "Valentine's Day", month: "feb", date: "14", className: "calendar-event-month feb", end: "2026-02-14" },
  { title: "Maha Shivratri", month: "feb", date: "26", className: "calendar-event-month feb", end: "2026-02-26" },
  { title: "Women's Day", month: "mar", date: "08", className: "calendar-event-month mar", end: "2026-03-08" },
  { title: "Holi", month: "mar", date: "14", className: "calendar-event-month mar", end: "2026-03-14" },
  { title: "Gudi Padwa", month: "mar", date: "22", className: "calendar-event-month mar", end: "2026-03-22" },
  { title: "Ramadan", month: "mar", date: "23", className: "calendar-event-month mar", end: "2026-03-23" },
  { title: "Ram Navami", month: "apr", date: "02", className: "calendar-event-month apr", end: "2026-04-02" },
  { title: "Mahavir Jayanti", month: "apr", date: "06", className: "calendar-event-month apr", end: "2026-04-06" },
  { title: "Vaisakhi", month: "apr", date: "14", className: "calendar-event-month apr", end: "2026-04-14" },
  { title: "Buddha Purnima", month: "may", date: "07", className: "calendar-event-month may", end: "2026-05-07" },
  { title: "Mother's Day", month: "may", date: "10", className: "calendar-event-month may", end: "2026-05-10" },
  { title: "Bakri Eid", month: "jun", date: "17", className: "calendar-event-month jun", end: "2026-06-17" },
  { title: "Father's Day", month: "jun", date: "21", className: "calendar-event-month jun", end: "2026-06-21" },
  { title: "International Yoga Day", month: "jun", date: "21", className: "calendar-event-month jun", end: "2026-06-21" },
  { title: "Ratha Yatra", month: "jun", date: "23", className: "calendar-event-month jun", end: "2026-06-23" },
  { title: "Guru Purnima", month: "jul", date: "31", className: "calendar-event-month jul", end: "2026-07-31" },
  { title: "Friendship Day", month: "aug", date: "02", className: "calendar-event-month aug", end: "2026-08-02" },
  { title: "Janmashtami", month: "aug", date: "06", className: "calendar-event-month aug", end: "2026-08-06" },
  { title: "Independence Day", month: "aug", date: "15", className: "calendar-event-month aug", end: "2026-08-15" },
  { title: "Raksha Bandhan", month: "aug", date: "28", className: "calendar-event-month aug", end: "2026-08-28" },
  { title: "Teacher's Day", month: "sept", date: "05", className: "calendar-event-month sep", end: "2026-09-05" },
  { title: "Ganesh Puja", month: "sept", date: "16", className: "calendar-event-month sep", end: "2026-09-16" },
  { title: "Gandhi Jayanti", month: "oct", date: "02", className: "calendar-event-month oct", end: "2026-10-02" },
  { title: "Mental Health Day", month: "oct", date: "10", className: "calendar-event-month oct", end: "2026-10-10" },
  { title: "Navaratri", month: "oct", date: "12", className: "calendar-event-month oct", end: "2026-10-12" },
  { title: "Durga Puja", month: "oct", date: "18", className: "calendar-event-month oct", end: "2026-10-18" },
  { title: "Karva Chauth", month: "oct", date: "19", className: "calendar-event-month oct", end: "2026-10-19" },
  { title: "Dussehra", month: "oct", date: "21", className: "calendar-event-month oct", end: "2026-10-21" },
  { title: "Diwali", month: "nov", date: "08", className: "calendar-event-month nov", end: "2026-11-08" },
  { title: "Children's Day", month: "nov", date: "14", className: "calendar-event-month nov", end: "2026-11-14" },
  { title: "Christmas", month: "dec", date: "25", className: "calendar-event-month dec", end: "2026-12-25" },
  { title: "New Year's Eve", month: "dec", date: "31", className: "calendar-event-month dec", end: "2026-12-31" },
];

async function seedOccasions() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database");

    await sequelize.sync({ force: false, alter: false });
    console.log("occasions table ensured");

    let inserted = 0;
    let skipped = 0;

    for (const occasion of OCCASIONS) {
      const [, created] = await OccasionModel.findOrCreate({
        where: { title: occasion.title, end: occasion.end },
        defaults: occasion,
      });
      if (created) inserted++;
      else skipped++;
    }

    console.log(`\nSeed complete: ${inserted} inserted, ${skipped} already existed`);
  } catch (err) {
    console.error("Seed failed:", err);
  } finally {
    await sequelize.close();
  }
}

seedOccasions();
