import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

const client = new SQL({
  url: process.env.DATABASE_URL,
});

const db = drizzle(client);

export default db;
