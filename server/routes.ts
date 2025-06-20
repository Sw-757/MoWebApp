import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { externalAgentService } from "./services/externalAgentService";
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
      const progress = await externalAgentService.getTaskProgress(taskId);
      
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
      await storage.updateTaskStatus(taskId, "processing");
      
      // Broadcast initial processing state
      broadcast({
        type: 'taskProgress',
        data: {
          taskId,
          progress: 10,
          status: 'processing',
          agentStatus: {
            supervisor: 'active',
            phone: 'idle',
            venmo: 'idle'
          },
          currentMessage: {
            agent: 'supervisor',
            message: 'Making API call to external service...',
            messageType: 'processing',
            timestamp: new Date().toISOString()
          }
        }
      });

      // Make external API call
      const response = await fetch('https://closing-vocal-fowl.ngrok-free.app/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: "60d0b5b_2",
          user_q: prompt
        })
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      let conversationFlow;
      
      try {
        conversationFlow = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Failed to parse API response');
      }

      // Process the conversation flow step by step
      for (let i = 0; i < conversationFlow.length; i++) {
        const step = conversationFlow[i];
        const stepKey = Object.keys(step)[0];
        const stepMessage = step[stepKey];
        
        // Map agent names
        let agentName = stepKey.toLowerCase();
        if (agentName === 'phone_agent') agentName = 'phone';
        if (agentName === 'venmo_agent') agentName = 'venmo';
        if (agentName === 'supervisor') agentName = 'supervisor';
        if (agentName === 'user') agentName = 'user';
        
        // Determine message type
        let messageType = 'processing';
        if (stepMessage.includes('Transaction ID') || stepMessage.includes('sent successfully')) {
          messageType = 'success';
        } else if (stepMessage.includes('Let\'s go to')) {
          messageType = 'delegation';
        } else if (agentName === 'user') {
          messageType = 'user_input';
        }

        // Store message in database
        await storage.createMessage({
          taskId,
          agent: agentName,
          message: stepMessage,
          messageType,
          metadata: null
        });

        // Calculate progress
        const progress = Math.min(20 + (i / conversationFlow.length) * 75, 95);
        
        // Determine active agent statuses
        const agentStatus = {
          supervisor: agentName === 'supervisor' ? 'active' : (i === conversationFlow.length - 1 ? 'complete' : 'idle'),
          phone: agentName === 'phone' ? 'active' : (i === conversationFlow.length - 1 ? 'complete' : 'idle'),
          venmo: agentName === 'venmo' ? 'active' : (i === conversationFlow.length - 1 ? 'complete' : 'idle')
        };

        // Broadcast progress update
        broadcast({
          type: 'taskProgress',
          data: {
            taskId,
            progress,
            status: 'processing',
            agentStatus,
            currentMessage: {
              agent: agentName,
              message: stepMessage,
              messageType,
              timestamp: new Date().toISOString()
            }
          }
        });

        // Add delay between messages for realistic flow
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }

      // Task completed
      await storage.updateTaskStatus(taskId, "completed", new Date());
      
      broadcast({
        type: 'taskCompleted',
        data: {
          taskId,
          progress: 100,
          status: 'completed',
          agentStatus: {
            supervisor: 'complete',
            phone: 'complete',
            venmo: 'complete'
          }
        }
      });

    } catch (error) {
      console.error('Error processing task with external API:', error);
      await storage.updateTaskStatus(taskId, "failed");
      
      broadcast({
        type: 'taskError',
        data: { 
          taskId, 
          error: error instanceof Error ? error.message : 'Unknown error occurred during API call'
        }
      });
    }
  }

  return httpServer;
}
