import { tasks, messages, type Task, type InsertTask, type Message, type InsertMessage } from "@shared/schema";

export interface IStorage {
  // Task operations
  createTask(task: InsertTask): Promise<Task>;
  getTask(id: number): Promise<Task | undefined>;
  updateTaskStatus(id: number, status: string, completedAt?: Date): Promise<Task | undefined>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getTaskMessages(taskId: number): Promise<Message[]>;
  getLatestMessage(taskId: number): Promise<Message | undefined>;
}

export class MemStorage implements IStorage {
  private tasks: Map<number, Task>;
  private messages: Map<number, Message>;
  private currentTaskId: number;
  private currentMessageId: number;

  constructor() {
    this.tasks = new Map();
    this.messages = new Map();
    this.currentTaskId = 1;
    this.currentMessageId = 1;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const task: Task = {
      ...insertTask,
      id,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
    };
    this.tasks.set(id, task);
    return task;
  }

  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async updateTaskStatus(id: number, status: string, completedAt?: Date): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (task) {
      const updatedTask = { ...task, status, completedAt: completedAt || null };
      this.tasks.set(id, updatedTask);
      return updatedTask;
    }
    return undefined;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getTaskMessages(taskId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.taskId === taskId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getLatestMessage(taskId: number): Promise<Message | undefined> {
    const messages = await this.getTaskMessages(taskId);
    return messages[messages.length - 1];
  }
}

export const storage = new MemStorage();
