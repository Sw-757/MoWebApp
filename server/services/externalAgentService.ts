import { storage } from "../storage";
import { type InsertMessage, type AgentStatus, type TaskProgress } from "@shared/schema";

export class ExternalAgentService {
  private activeProcessing = new Map<number, boolean>();

  async processTask(taskId: number, prompt: string): Promise<void> {
    if (this.activeProcessing.get(taskId)) {
      throw new Error("Task is already being processed");
    }

    this.activeProcessing.set(taskId, true);

    try {
      await storage.updateTaskStatus(taskId, "processing");
      
      // Make API call to external service
      const response = await this.callExternalAPI(prompt);
      const conversationFlow = this.parseAPIResponse(response);
      
      // Process the conversation flow with realistic delays
      for (let i = 0; i < conversationFlow.length; i++) {
        const step = conversationFlow[i];
        
        // Add realistic delays between messages
        await this.delay(2000 + Math.random() * 1000);
        
        await storage.createMessage({
          taskId,
          agent: step.agent,
          message: step.message,
          messageType: step.messageType,
          metadata: step.metadata || null,
        });
      }

      await storage.updateTaskStatus(taskId, "completed", new Date());
    } catch (error) {
      console.error('Error processing task:', error);
      await storage.updateTaskStatus(taskId, "failed");
      throw error;
    } finally {
      this.activeProcessing.set(taskId, false);
    }
  }

  private async callExternalAPI(prompt: string): Promise<any> {
    const response = await fetch('https://closing-vocal-fowl.ngrok-free.app/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: "60d0b5b_2",
        user_q: prompt
      }),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    return JSON.parse(responseText);
  }

  private parseAPIResponse(apiResponse: any[]): any[] {
    const flow = [];
    
    for (const item of apiResponse) {
      const [agentKey, message] = Object.entries(item)[0];
      
      // Map agent names to our internal format
      let agent = agentKey.toLowerCase();
      let messageType = "processing";
      
      switch (agentKey) {
        case 'User':
          agent = "user";
          messageType = "input";
          break;
        case 'Supervisor':
          agent = "supervisor";
          messageType = this.getMessageType(message as string);
          break;
        case 'phone_agent':
          agent = "phone";
          messageType = this.getMessageType(message as string);
          break;
        case 'venmo_agent':
          agent = "venmo";
          messageType = this.getMessageType(message as string);
          break;
      }
      
      flow.push({
        agent,
        message: message as string,
        messageType,
        metadata: null
      });
    }
    
    return flow;
  }

  private getMessageType(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('let\'s go to') || lowerMessage.includes('delegating')) {
      return 'delegation';
    } else if (lowerMessage.includes('transaction id') || lowerMessage.includes('sent successfully')) {
      return 'success';
    } else if (lowerMessage.includes('send') || lowerMessage.includes('retrieve') || lowerMessage.includes('identify')) {
      return 'action';
    } else if (lowerMessage.includes('contact') || lowerMessage.includes('email') || lowerMessage.includes('amount')) {
      return 'processing';
    } else if (lowerMessage.includes('your') && lowerMessage.includes('has been')) {
      return 'completion';
    } else {
      return 'processing';
    }
  }

  async getTaskProgress(taskId: number): Promise<TaskProgress | null> {
    const task = await storage.getTask(taskId);
    if (!task) return null;

    const messages = await storage.getTaskMessages(taskId);
    const latestMessage = messages[messages.length - 1];
    
    // Calculate progress based on message count and task status
    let progress = 0;
    if (task.status === "completed") {
      progress = 100;
    } else if (task.status === "processing") {
      // Estimate progress based on message count
      progress = Math.min((messages.length / 8) * 100, 95);
    }

    // Determine agent statuses
    const agentStatus: AgentStatus = {
      supervisor: "idle",
      phone: "idle",
      venmo: "idle"
    };

    if (task.status === "completed") {
      agentStatus.supervisor = "complete";
      agentStatus.phone = "complete";
      agentStatus.venmo = "complete";
    } else if (latestMessage) {
      // Set active agent based on latest message
      if (latestMessage.agent === "supervisor") {
        agentStatus.supervisor = "active";
      } else if (latestMessage.agent === "phone") {
        agentStatus.phone = "active";
      } else if (latestMessage.agent === "venmo") {
        agentStatus.venmo = "active";
      }
    }

    return {
      taskId,
      progress,
      status: task.status,
      agentStatus,
      currentMessage: latestMessage ? {
        agent: latestMessage.agent,
        message: latestMessage.message,
        messageType: latestMessage.messageType,
        timestamp: latestMessage.timestamp.toISOString(),
      } : undefined,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const externalAgentService = new ExternalAgentService();