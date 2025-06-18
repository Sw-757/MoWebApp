import { storage } from "../storage";
import { type InsertMessage, type AgentStatus, type TaskProgress } from "@shared/schema";

export class AgentService {
  private activeProcessing = new Map<number, boolean>();

  async processTask(taskId: number, prompt: string): Promise<void> {
    if (this.activeProcessing.get(taskId)) {
      throw new Error("Task is already being processed");
    }

    this.activeProcessing.set(taskId, true);

    try {
      await storage.updateTaskStatus(taskId, "processing");
      
      // Generate realistic agent conversation flow
      const conversationFlow = this.generateConversationFlow(prompt);
      
      for (let i = 0; i < conversationFlow.length; i++) {
        const step = conversationFlow[i];
        
        // Add realistic delays between messages
        await this.delay(1500 + Math.random() * 1000);
        
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
      await storage.updateTaskStatus(taskId, "failed");
      throw error;
    } finally {
      this.activeProcessing.set(taskId, false);
    }
  }

  private generateConversationFlow(prompt: string) {
    // Analyze the prompt to determine which agents are needed
    const needsPayment = this.containsPaymentKeywords(prompt);
    const needsCall = this.containsCallKeywords(prompt);
    
    const flow = [];
    
    // Supervisor analysis
    flow.push({
      agent: "supervisor",
      message: `Analyzing task: "${prompt}"`,
      messageType: "analysis"
    });

    // Task breakdown
    const subtasks = this.extractSubtasks(prompt, needsPayment, needsCall);
    flow.push({
      agent: "supervisor",
      message: `Breaking down into subtasks:\n${subtasks.map((task, i) => `${i + 1}. ${task}`).join('\n')}`,
      messageType: "planning"
    });

    // Process Venmo tasks if needed
    if (needsPayment) {
      flow.push(...this.generateVenmoFlow(prompt));
    }

    // Supervisor coordination
    if (needsPayment && needsCall) {
      flow.push({
        agent: "supervisor",
        message: "Payment completed successfully. Now delegating call task to Phone Agent...",
        messageType: "coordination"
      });
    }

    // Process Phone tasks if needed
    if (needsCall) {
      flow.push(...this.generatePhoneFlow(prompt));
    }

    // Final summary
    flow.push({
      agent: "supervisor",
      message: this.generateFinalSummary(prompt, needsPayment, needsCall),
      messageType: "completion"
    });

    return flow;
  }

  private containsPaymentKeywords(prompt: string): boolean {
    const paymentKeywords = ['send', 'pay', 'transfer', 'venmo', '$', 'money', 'payment'];
    return paymentKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
  }

  private containsCallKeywords(prompt: string): boolean {
    const callKeywords = ['call', 'phone', 'contact', 'speak', 'talk', 'confirm', 'ask'];
    return callKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
  }

  private extractSubtasks(prompt: string, needsPayment: boolean, needsCall: boolean): string[] {
    const subtasks = [];
    
    if (needsPayment) {
      const amount = this.extractAmount(prompt);
      const recipient = this.extractRecipient(prompt);
      subtasks.push(`Venmo payment ${amount ? `of ${amount}` : ''} ${recipient ? `to ${recipient}` : ''}`);
    }
    
    if (needsCall) {
      const recipient = this.extractRecipient(prompt);
      subtasks.push(`Phone call ${recipient ? `to ${recipient}` : ''} for confirmation`);
    }
    
    if (prompt.toLowerCase().includes('dinner') || prompt.toLowerCase().includes('plans')) {
      subtasks.push('Discuss future plans');
    }
    
    return subtasks;
  }

  private extractAmount(prompt: string): string | null {
    const amountMatch = prompt.match(/\$(\d+)/);
    return amountMatch ? amountMatch[0] : null;
  }

  private extractRecipient(prompt: string): string | null {
    // Simple name extraction - look for common patterns
    const patterns = [
      /(?:to|send|pay|call)\s+([A-Z][a-z]+)/,
      /([A-Z][a-z]+)(?:\s+via|\s+and)/,
    ];
    
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  private generateVenmoFlow(prompt: string) {
    const amount = this.extractAmount(prompt) || "$50";
    const recipient = this.extractRecipient(prompt) || "John";
    
    return [
      {
        agent: "supervisor",
        message: "Delegating payment task to Venmo Agent...",
        messageType: "delegation"
      },
      {
        agent: "venmo",
        message: `Received payment request: ${amount} to ${recipient}`,
        messageType: "acknowledgment"
      },
      {
        agent: "venmo",
        message: `Searching for contact "${recipient}" in Venmo contacts...`,
        messageType: "processing"
      },
      {
        agent: "venmo",
        message: `Contact found: ${recipient} Smith (@${recipient.toLowerCase()}smith_venmo)`,
        messageType: "success"
      },
      {
        agent: "venmo",
        message: `Initiating payment of ${amount} with note: "Payment as requested"`,
        messageType: "action"
      },
      {
        agent: "venmo",
        message: `✅ Payment successful! Transaction ID: VM_${Math.random().toString().substr(2, 9)}`,
        messageType: "success"
      }
    ];
  }

  private generatePhoneFlow(prompt: string) {
    const recipient = this.extractRecipient(prompt) || "John";
    const phoneNumber = `(555) ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    
    return [
      {
        agent: "phone",
        message: `Received call request for ${recipient} to confirm payment and discuss plans`,
        messageType: "acknowledgment"
      },
      {
        agent: "phone",
        message: `Looking up contact information for ${recipient}...`,
        messageType: "processing"
      },
      {
        agent: "phone",
        message: `Found contact: ${recipient} Smith - ${phoneNumber}`,
        messageType: "success"
      },
      {
        agent: "phone",
        message: `Initiating call to ${recipient}...`,
        messageType: "action"
      },
      {
        agent: "phone",
        message: `📞 Call connected. Confirming Venmo payment...`,
        messageType: "progress"
      },
      {
        agent: "phone",
        message: `${recipient} confirmed payment received. ${prompt.toLowerCase().includes('dinner') ? 'Discussing Friday dinner plans...' : 'Discussing plans...'}`,
        messageType: "progress"
      },
      {
        agent: "phone",
        message: `✅ Call completed. ${this.generateCallOutcome(prompt)}`,
        messageType: "success"
      }
    ];
  }

  private generateCallOutcome(prompt: string): string {
    if (prompt.toLowerCase().includes('dinner')) {
      return "Plans confirmed for dinner this Friday at 7 PM.";
    } else if (prompt.toLowerCase().includes('lunch')) {
      return "Lunch plans confirmed for tomorrow at noon.";
    } else if (prompt.toLowerCase().includes('meeting')) {
      return "Meeting scheduled for next week.";
    } else {
      return "Plans discussed and confirmed.";
    }
  }

  private generateFinalSummary(prompt: string, needsPayment: boolean, needsCall: boolean): string {
    const amount = this.extractAmount(prompt) || "$50";
    const recipient = this.extractRecipient(prompt) || "John";
    
    let summary = "All tasks completed successfully!\n\n📋 Summary:\n";
    
    if (needsPayment) {
      summary += `• ${amount} sent to ${recipient} via Venmo ✅\n`;
    }
    
    if (needsCall) {
      summary += `• Confirmation call completed ✅\n`;
    }
    
    if (prompt.toLowerCase().includes('dinner')) {
      summary += "• Dinner plans confirmed for Friday 7 PM ✅";
    } else if (prompt.toLowerCase().includes('lunch')) {
      summary += "• Lunch plans confirmed ✅";
    } else if (needsCall) {
      summary += "• Plans discussed and confirmed ✅";
    }
    
    return summary;
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
      // Estimate progress based on message count (typical flow has ~17 messages)
      progress = Math.min((messages.length / 17) * 100, 95);
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

export const agentService = new AgentService();
