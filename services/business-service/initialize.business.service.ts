import { connectDatabase } from "../persistence-service/database";
import { initializeScheduler } from "../scheduler-service";
import { ensureTrialLaunchRecorded } from "./trial/trial.service";

export const initializeBusinessService = async () => {
  await connectDatabase();
  await ensureTrialLaunchRecorded();
  await initializeScheduler();
};