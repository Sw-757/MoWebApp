import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  agent: text("agent").notNull(), // supervisor, phone, venmo
  message: text("message").notNull(),
  messageType: text("message_type").notNull(), // analysis, planning, delegation, acknowledgment, processing, success, action, progress, completion
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  prompt: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  taskId: true,
  agent: true,
  message: true,
  messageType: true,
  metadata: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export const agentStatusSchema = z.object({
  supervisor: z.enum(["idle", "active", "complete"]),
  phone: z.enum(["idle", "active", "complete"]),
  venmo: z.enum(["idle", "active", "complete"]),
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const taskProgressSchema = z.object({
  taskId: z.number(),
  progress: z.number().min(0).max(100),
  status: z.string(),
  agentStatus: agentStatusSchema,
  currentMessage: z.object({
    agent: z.string(),
    message: z.string(),
    messageType: z.string(),
    timestamp: z.string(),
  }).optional(),
});

export type TaskProgress = z.infer<typeof taskProgressSchema>;
