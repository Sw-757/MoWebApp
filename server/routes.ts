import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { agentService } from "./services/agentService";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  // WebSocket connections for real-time updates
  const clients = new Map<string, any>();

  wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substring(7);
    clients.set(clientId, ws);

    ws.on('error', (error) => {
      console.log('WebSocket client error:', error);
      clients.delete(clientId);
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });

    try {
      ws.send(JSON.stringify({ type: 'connected', clientId }));
    } catch (error) {
      console.log('Error sending connection message:', error);
    }
  });

  // Broadcast to all connected clients
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach((ws, clientId) => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        } else {
          clients.delete(clientId);
        }
      } catch (error) {
        console.log('Error broadcasting to client:', error);
        clients.delete(clientId);
      }
    });
  };

  // Create new task
  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      
      res.json(task);

      // Start processing the task asynchronously
      processTaskWithUpdates(task.id, validatedData.prompt, broadcast);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Get task details
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Get task messages
  app.get("/api/tasks/:id/messages", async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const messages = await storage.getTaskMessages(taskId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get task progress
  app.get("/api/tasks/:id/progress", async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const progress = await agentService.getTaskProgress(taskId);
      
      if (!progress) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch progress" });
    }
  });

  // Helper function to process task and send real-time updates
  async function processTaskWithUpdates(taskId: number, prompt: string, broadcast: Function) {
    try {
      // Start processing in background
      const processingPromise = agentService.processTask(taskId, prompt);
      
      // Send periodic updates while processing
      const progressInterval = setInterval(async () => {
        try {
          const progress = await agentService.getTaskProgress(taskId);
          if (progress) {
            broadcast({
              type: 'taskProgress',
              data: progress
            });

            if (progress.status === 'completed' || progress.status === 'failed') {
              clearInterval(progressInterval);
            }
          }
        } catch (error) {
          console.error('Error getting task progress:', error);
        }
      }, 1000);

      await processingPromise;
      clearInterval(progressInterval);

      // Send final update
      const finalProgress = await agentService.getTaskProgress(taskId);
      if (finalProgress) {
        broadcast({
          type: 'taskCompleted',
          data: finalProgress
        });
      }
    } catch (error) {
      console.error('Error processing task:', error);
      broadcast({
        type: 'taskError',
        data: { taskId, error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  return httpServer;
}
