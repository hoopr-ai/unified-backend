import { connectDatabase } from "../persistence-service/database";
import { initializeScheduler } from "../scheduler-service";

export const initializeBusinessService = async () => {
  await connectDatabase();
  await initializeScheduler();
};