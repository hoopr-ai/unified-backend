import { connectDatabase } from "../persistence-service/database";
import { initializeScheduler } from "../scheduler-service";
import { checkTrialLaunchConfig } from "./trial/trial.service";

export const initializeBusinessService = async () => {
  await connectDatabase();
  await checkTrialLaunchConfig();
  await initializeScheduler();
};