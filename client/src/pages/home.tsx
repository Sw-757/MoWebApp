import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingDots } from "@/components/ui/loading-dots";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatTimestamp, cn } from "@/lib/utils";
import { Bot, Phone, CreditCard, Crown, Play, MessageCircle } from "lucide-react";
import type { Task, Message, TaskProgress, AgentStatus } from "@shared/schema";

const samplePrompts = [
  "The last Venmo payment request I sent to Cory was an accident and they approved it. Send them the money back.",
  "I need to split the dinner bill with my roommate Alex. Send them $32.50 and text them about it.",
  "Check my recent Venmo transactions and call if there are any suspicious payments."
];

export default function Home() {
  const [prompt, setPrompt] = useState("The last Venmo payment request I sent to Cory was an accident and they approved it. Send them the money back.");
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [progress, setProgress] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    supervisor: "idle",
    phone: "idle",
    venmo: "idle"
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;
    
    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      
      ws.onerror = (error) => {
        console.log('WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'taskProgress') {
            const progressData: TaskProgress = data.data;
            setProgress(progressData.progress);
            setAgentStatus(progressData.agentStatus);
            
            if (progressData.currentMessage) {
              const currentMsg = progressData.currentMessage;
              // Add new message if it's different from the last one
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (!lastMessage || 
                    lastMessage.agent !== currentMsg.agent ||
                    lastMessage.message !== currentMsg.message) {
                  return [...prev, {
                    id: Date.now(),
                    taskId: progressData.taskId,
                    agent: currentMsg.agent,
                    message: currentMsg.message,
                    messageType: currentMsg.messageType,
                    timestamp: new Date(currentMsg.timestamp),
                    metadata: null
                  }];
                }
                return prev;
              });
            }
          } else if (data.type === 'taskCompleted') {
            setIsProcessing(false);
            setTaskCompleted(true);
            setProgress(100);
            const progressData: TaskProgress = data.data;
            setAgentStatus(progressData.agentStatus);
          } else if (data.type === 'taskError') {
            setIsProcessing(false);
            console.error('Task error:', data.data);
          }
        } catch (error) {
          console.log('WebSocket message parsing error:', error);
        }
      };
    };
    
    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  const createTaskMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest("POST", "/api/tasks", { prompt });
      return response.json();
    },
    onSuccess: (task: Task) => {
      setCurrentTask(task);
      setMessages([]);
      setProgress(0);
      setIsProcessing(true);
      setTaskCompleted(false);
      setAgentStatus({
        supervisor: "idle",
        phone: "idle",
        venmo: "idle"
      });
    },
  });

  const handleProcessTask = () => {
    if (!prompt.trim() || isProcessing) return;
    createTaskMutation.mutate(prompt);
  };

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case 'supervisor':
        return Crown;
      case 'phone':
      case 'phone_agent':
        return Phone;
      case 'venmo':
      case 'venmo_agent':
        return CreditCard;
      case 'user':
        return MessageCircle;
      default:
        return Bot;
    }
  };

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case 'supervisor':
        return 'bg-blue-500';
      case 'phone':
      case 'phone_agent':
        return 'bg-amber-500';
      case 'venmo':
      case 'venmo_agent':
        return 'bg-violet-500';
      case 'user':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getAgentName = (agent: string) => {
    switch (agent) {
      case 'supervisor':
        return 'Supervisor';
      case 'phone':
      case 'phone_agent':
        return 'Phone Agent';
      case 'venmo':
      case 'venmo_agent':
        return 'Venmo Agent';
      case 'user':
        return 'User';
      default:
        return 'Agent';
    }
  };

  const getMessageTypeClass = (messageType: string) => {
    switch (messageType) {
      case 'success':
        return 'border-l-4 border-green-500 bg-green-50 dark:bg-green-950';
      case 'action':
        return 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950';
      case 'completion':
        return 'border-l-4 border-green-500 bg-green-50 dark:bg-green-950';
      case 'processing':
        return 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      case 'delegation':
        return 'border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950';
      case 'user_input':
        return 'border-l-4 border-gray-500 bg-gray-50 dark:bg-gray-900';
      default:
        return 'bg-gray-50 dark:bg-gray-900';
    }
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500 animate-pulse-slow';
      case 'complete':
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getAgentRingClass = (agent: string, status: string) => {
    if (status === 'active') {
      switch (agent) {
        case 'supervisor':
          return 'agent-ring-blue';
        case 'phone':
          return 'agent-ring-amber';
        case 'venmo':
          return 'agent-ring-violet';
      }
    }
    return '';
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Bot className="text-white text-lg" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Agent Interaction Simulator</h1>
                <p className="text-sm text-gray-500">Supervisor & Multi-Agent Coordination</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>System Ready</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Input Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Input</h2>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                      Enter your task prompt
                    </label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., The last Venmo payment request I sent to Cory was an accident and they approved it. Send them the money back."
                      className="h-32 resize-none"
                      disabled={isProcessing}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleProcessTask}
                    disabled={!prompt.trim() || isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <LoadingDots />
                        <span className="ml-2">Processing...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Process Task
                      </>
                    )}
                  </Button>

                  {/* Sample Prompts */}
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Sample Prompts</h3>
                    <div className="space-y-2">
                      {samplePrompts.map((samplePrompt, index) => (
                        <button
                          key={index}
                          onClick={() => setPrompt(samplePrompt)}
                          className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors duration-200"
                          disabled={isProcessing}
                        >
                          "{samplePrompt}"
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conversation Flow */}
          <div className="lg:col-span-2">
            <Card>
              {/* Flow Header */}
              <div className="border-b border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Agent Interaction Flow</h2>
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      isProcessing ? "bg-blue-500 animate-pulse" : taskCompleted ? "bg-green-500" : "bg-gray-400"
                    )}></div>
                    <span>
                      {isProcessing ? "Calling external API..." : taskCompleted ? "Task completed" : "Ready for external API call"}
                    </span>
                  </div>
                </div>
                
                {/* Agent Status Bar */}
                <div className="flex items-center justify-center space-x-8 mt-6">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-2 transition-all duration-300",
                      getAgentRingClass('phone', agentStatus.phone)
                    )}>
                      <Phone className="text-amber-600 text-lg" />
                    </div>
                    <span className="text-xs font-medium text-gray-600">Phone Agent</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1",
                      getAgentStatusColor(agentStatus.phone)
                    )}></div>
                  </div>
                  
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-2 transition-all duration-300 transform rotate-45",
                      getAgentRingClass('supervisor', agentStatus.supervisor)
                    )}>
                      <Crown className="text-blue-600 text-lg transform -rotate-45" />
                    </div>
                    <span className="text-xs font-medium text-gray-600">Supervisor</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1",
                      getAgentStatusColor(agentStatus.supervisor)
                    )}></div>
                  </div>
                  
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-12 h-12 bg-violet-100 rounded-lg flex items-center justify-center mb-2 transition-all duration-300",
                      getAgentRingClass('venmo', agentStatus.venmo)
                    )}>
                      <CreditCard className="text-violet-600 text-lg" />
                    </div>
                    <span className="text-xs font-medium text-gray-600">Venmo Agent</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1",
                      getAgentStatusColor(agentStatus.venmo)
                    )}></div>
                  </div>
                </div>
              </div>

              {/* Conversation Area */}
              <div ref={conversationRef} className="p-6 min-h-96 max-h-96 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8">
                    <MessageCircle className="mx-auto text-3xl text-gray-300 mb-3 w-12 h-12" />
                    <p>Start a task to see agent interactions</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {messages.map((message, index) => {
                      const Icon = getAgentIcon(message.agent);
                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className={cn(
                            "flex items-start space-x-3 p-4 rounded-lg",
                            getMessageTypeClass(message.messageType)
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                            getAgentColor(message.agent)
                          )}>
                            <Icon className="text-white text-sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {getAgentName(message.agent)}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatTimestamp(message.timestamp)}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-line">
                              {message.message}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Progress Bar */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Task Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            </Card>
          </div>
        </div>

        {/* Results Panel */}
        {taskCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-6"
          >
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Results</h2>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-800 mb-2">Task Completed Successfully</h3>
                      <div className="text-sm text-green-700 space-y-1">
                        {messages.filter(m => m.messageType === 'completion').map(m => (
                          <div key={m.id} className="whitespace-pre-line">
                            {m.message}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-green-600">
                        Total execution time: {((messages.length * 1.5) / 60).toFixed(1)} minutes
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
