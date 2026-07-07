import Dexie from "dexie";

const db = new Dexie("autoparts_cache");
db.version(1).stores({ parts: "id" });
db.version(2).stores({ parts: "id", workshopJobs: "id", workshopJobItems: "id" });
export default db;
