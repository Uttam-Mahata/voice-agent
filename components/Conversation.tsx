import React, { useState, useRef, useCallback, useEffect } from 'react';
// Fix: Removed 'LiveSession' from import as it is not an exported member.
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { Sender, Message } from '../types';
import { decode, decodeAudioData, createPcmBlob } from '../utils/audio';
import { MicrophoneIcon, StopIcon, UserIcon, BotIcon, DollarSignIcon } from './icons';
import { getMockTransactionHistory, MockTransaction } from '../mock/backend';
import { TransactionHistory } from './TransactionHistory';

// Add window.aistudio type declaration
declare global {
  // Fix: Added window interface to correctly type `window.aistudio`.
  interface Window {
    aistudio?: AIStudio;
  }
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

// Fix: Infer LiveSession type from the Gemini API as it's not exported.
type LiveSession = Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['live']['connect']>>;


// Mock bank account data
interface Accounts {
  checking: number;
  savings: number;
}

// Function Declarations for the Gemini model
const getAccountBalance: FunctionDeclaration = {
  name: 'getAccountBalance',
  parameters: {
    type: Type.OBJECT,
    description: 'Get the balance of a bank account.',
    properties: {
      accountType: {
        type: Type.STRING,
        description: 'The type of account, e.g., "checking" or "savings".',
      },
    },
    required: ['accountType'],
  },
};

const transferFunds: FunctionDeclaration = {
  name: 'transferFunds',
  parameters: {
    type: Type.OBJECT,
    description: 'Transfer funds between two bank accounts.',
    properties: {
      amount: {
        type: Type.NUMBER,
        description: 'The amount of money to transfer.',
      },
      fromAccount: {
        type: Type.STRING,
        description: 'The account to transfer funds from.',
      },
      toAccount: {
        type: Type.STRING,
        description: 'The account to transfer funds to.',
      },
    },
    required: ['amount', 'fromAccount', 'toAccount'],
  },
};

const getTransactionHistory: FunctionDeclaration = {
    name: 'getTransactionHistory',
    parameters: {
        type: Type.OBJECT,
        description: 'Get the transaction history for a bank account.',
        properties: {
            accountType: {
                type: Type.STRING,
                description: 'The type of account, e.g., "checking" or "savings".',
            },
            limit: {
                type: Type.NUMBER,
                description: 'The maximum number of transactions to retrieve.',
            },
        },
        required: ['accountType'],
    },
};

export const Conversation: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [accounts, setAccounts] = useState<Accounts>({ checking: 1000, savings: 5000 });
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [transactions, setTransactions] = useState<MockTransaction[]>([]);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        setApiKeySelected(await window.aistudio.hasSelectedApiKey());
      } else {
        // If not in AI Studio context, assume key is available via process.env
        setApiKeySelected(true);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);
  
  const handleToolCall = useCallback((toolCall: any) => {
    const sessionPromise = sessionPromiseRef.current;
    if (!sessionPromise) return;

    for (const fc of toolCall.functionCalls) {
      let result;
      switch(fc.name) {
        case 'getAccountBalance':
          const accountType = fc.args.accountType.toLowerCase() as keyof Accounts;
          if (accounts.hasOwnProperty(accountType)) {
            result = { balance: accounts[accountType] };
          } else {
            result = { error: `Account type '${accountType}' not found.` };
          }
          break;
        case 'transferFunds':
          const { amount, fromAccount, toAccount } = fc.args;
          const from = fromAccount.toLowerCase() as keyof Accounts;
          const to = toAccount.toLowerCase() as keyof Accounts;

          if (!accounts.hasOwnProperty(from) || !accounts.hasOwnProperty(to)) {
            result = { error: 'Invalid account specified.' };
          } else if (accounts[from] < amount) {
            result = { error: 'Insufficient funds.', currentBalance: accounts[from] };
          } else {
            setAccounts(prev => ({
              ...prev,
              [from]: prev[from] - amount,
              [to]: prev[to] + amount
            }));
            result = { success: true, fromAccount: from, toAccount: to, amount, newFromBalance: accounts[from] - amount };
          }
          break;
        case 'getTransactionHistory':
          const { accountType: historyAccount, limit } = fc.args;
          const history = getMockTransactionHistory(historyAccount.toLowerCase() as keyof Accounts, limit);
          setTransactions(history);
          setViewingHistory(historyAccount);
          result = { success: true, transactionsRetrieved: history.length };
          break;
        default:
          result = { error: `Unknown function call: ${fc.name}`};
      }
      
      sessionPromise.then(session => {
        session.sendToolResponse({
          functionResponses: {
            id: fc.id,
            name: fc.name,
            response: { result: result },
          }
        })
      });
    }
  }, [accounts]);

  const handleMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.toolCall) {
        handleToolCall(message.toolCall);
    }
    if (message.serverContent) {
        if (message.serverContent.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            currentOutputTranscriptionRef.current += text;
            setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.sender === Sender.Agent) {
                    const newLast = { ...last, text: currentOutputTranscriptionRef.current };
                    return [...prev.slice(0, -1), newLast];
                }
                return prev;
            });
        }
        if (message.serverContent.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            currentInputTranscriptionRef.current += text;
            setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.sender === Sender.User) {
                    const newLast = { ...last, text: currentInputTranscriptionRef.current };
                    return [...prev.slice(0, -1), newLast];
                }
                return prev;
            });
        }
        if (message.serverContent.turnComplete) {
            if(currentInputTranscriptionRef.current.trim()) {
                setTranscript(prev => {
                     const last = prev[prev.length - 1];
                     if (last && last.sender === Sender.User) {
                         return [...prev.slice(0, -1), { ...last, text: currentInputTranscriptionRef.current }];
                     }
                     return prev;
                });
            }
            if(currentOutputTranscriptionRef.current.trim()) {
                 setTranscript(prev => {
                     const last = prev[prev.length - 1];
                     if (last && last.sender === Sender.Agent) {
                         return [...prev.slice(0, -1), { ...last, text: currentOutputTranscriptionRef.current }];
                     }
                     return prev;
                });
            }
            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
        }
        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
            const audioContext = outputAudioContextRef.current;
            if (audioContext) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContext.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                source.addEventListener('ended', () => {
                    audioSourcesRef.current.delete(source);
                });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }
        }
        const interrupted = message.serverContent?.interrupted;
        if (interrupted) {
            for (const source of audioSourcesRef.current.values()) {
                source.stop();
                audioSourcesRef.current.delete(source);
            }
            nextStartTimeRef.current = 0;
        }
    }
  }, [handleToolCall]);

  const startConversation = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setTranscript([]);
    setTransactions([]);
    setViewingHistory(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const systemInstruction = `You are a helpful and professional bank assistant.
      Your goal is to help the user with their account balance, transfer funds, and view transaction history.
      Use the provided tools to get account information, perform transfers, and fetch transaction history.
      Always confirm transactions with the user before executing.
      Be clear and concise in your responses.
      Inform the user of the results of their actions, such as new balances after a transfer.`;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            
            setStatus('connected');
            setIsRecording(true);

             setTranscript(prev => [...prev, {id: Date.now().toString(), sender: Sender.User, text: ''}]);
             setTranscript(prev => [...prev, {id: (Date.now() + 1).toString(), sender: Sender.Agent, text: ''}]);

          },
          onmessage: handleMessage,
          onerror: (e: ErrorEvent) => {
            console.error('API Error:', e);
            if (e.message.toLowerCase().includes('network error') || e.message.toLowerCase().includes('not found')) {
              setError("There was an issue with the API key. Please re-select your key and try again.");
              setApiKeySelected(false);
            } else {
              setError(`Connection error: ${e.message}. Please try again.`);
            }
            stopConversation();
          },
          onclose: (e: CloseEvent) => {
            console.log('Connection closed.');
            stopConversation();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: systemInstruction,
          tools: [{functionDeclarations: [getAccountBalance, transferFunds, getTransactionHistory]}],
        },
      });
      
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setError('Could not access the microphone. Please grant permission and try again.');
      setStatus('idle');
    }
  }, [handleMessage]);

  const stopConversation = useCallback(() => {
    setIsRecording(false);
    setStatus('idle');

    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }
    
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

  }, []);

  const handleSelectApiKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setApiKeySelected(true);
        setError(null);
      } catch (e) {
        console.error('Failed to open API key selection:', e);
        setError('Could not open API key selection. Please try again.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if(isRecording) {
        stopConversation();
      }
    };
  }, [isRecording, stopConversation]);
  
  const getButtonContent = () => {
    switch (status) {
      case 'idle':
        return <><MicrophoneIcon className="w-6 h-6 mr-2" /> Start Session</>;
      case 'connecting':
        return <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div> Connecting...</>;
      case 'connected':
        return <><StopIcon className="w-6 h-6 mr-2" /> End Session</>;
    }
  };

  if (!apiKeySelected) {
    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-full flex flex-col flex-grow items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-4 text-teal-400">Welcome to the Financial Voice Agent</h2>
            {error && <div className="text-red-400 text-sm text-center mb-4 max-w-sm">{error}</div>}
            <p className="text-gray-400 mb-6">Please select a Google AI API key to continue.</p>
            <button
                onClick={handleSelectApiKey}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
                Select API Key
            </button>
            <p className="text-xs text-gray-500 mt-4">
                For more information, see the{' '}
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
                    API billing documentation
                </a>.
            </p>
        </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-full flex flex-col flex-grow">
            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg">
              <h2 className="text-lg font-semibold text-teal-400 mb-3">Account Overview</h2>
              <div className="flex flex-col sm:flex-row justify-around gap-4">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-full">
                          <DollarSignIcon className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                          <p className="text-sm text-gray-400">Checking</p>
                          <p className="text-xl font-semibold text-gray-100">${accounts.checking.toFixed(2)}</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/20 rounded-full">
                          <DollarSignIcon className="w-6 h-6 text-green-400" />
                      </div>
                      <div>
                          <p className="text-sm text-gray-400">Savings</p>
                          <p className="text-xl font-semibold text-gray-100">${accounts.savings.toFixed(2)}</p>
                      </div>
                  </div>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto mb-4 pr-2 flex-grow min-h-[200px]">
              <div className="space-y-4">
                {transcript.map((msg) => {
                  if (!msg.text.trim()) return null;
                  const isUser = msg.sender === Sender.User;
                  return (
                    <div key={msg.id} className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
                      {!isUser && (
                        <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                          <BotIcon className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div className={`px-4 py-2 rounded-lg max-w-xs md:max-w-md ${isUser ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                        <p className="text-sm">{msg.text}</p>
                      </div>
                      {isUser && (
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
                {isRecording && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse self-center ml-12"></div>}
                <div ref={transcriptEndRef} />
              </div>
              {transcript.length === 0 && !isRecording && (
                <div className="text-center text-gray-500 pt-10">
                    <p>Press "Start Session" and ask about your accounts.</p>
                    <p className="text-xs mt-2">e.g., "What's my checking balance?" or "Show my savings history."</p>
                </div>
              )}
            </div>

            {error && <div className="text-red-400 text-sm text-center mb-2">{error}</div>}
            
            <div className="flex-shrink-0 pt-4 border-t border-gray-700">
              <button
                onClick={isRecording ? stopConversation : startConversation}
                disabled={status === 'connecting'}
                className={`w-full flex items-center justify-center py-3 px-4 rounded-lg font-semibold text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800
                  ${status === 'connected' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}
                  ${status === 'connecting' ? 'bg-gray-600 cursor-not-allowed' : ''}
                `}
              >
                {getButtonContent()}
              </button>
            </div>
        </div>
        <TransactionHistory transactions={transactions} accountType={viewingHistory} />
    </div>
  );
};