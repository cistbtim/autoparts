import Dexie from "dexie";

const db = new Dexie("autoparts_cache");
db.version(1).stores({ parts: "id" });
export default db;
