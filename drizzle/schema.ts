import { pgTable, index, text, date, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const appointments = pgTable("appointments", {
	id: text().primaryKey().notNull(),
	userPhone: text("user_phone").notNull(),
	serviceId: text("service_id").notNull(),
	serviceTitle: text("service_title").notNull(),
	date: date().notNull(),
	time: text().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_appointments_user_phone").using("btree", table.userPhone.asc().nullsLast().op("text_ops")),
]);
