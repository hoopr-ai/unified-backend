import { connectDatabase } from "../persistence-service/database";


export const initializeBusinessService = async () => {
    await connectDatabase(); 
}