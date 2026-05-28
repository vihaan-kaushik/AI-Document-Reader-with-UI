import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  FileText, 
  Bot, 
  User, 
  X, 
  Menu, 
  Loader2, 
  Trash2,
  Sparkles,
  UploadCloud,
  Settings,
  MoreVertical,
  Maximize2
} from 'lucide-react';

const App = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'ai',
      text: "Hello! I'm DocuMind. Upload a PDF, text file, or image, and I can answer questions based on its content.",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      body, #root {
        width: 100vw;
        height: 100vh;
        margin: 0;
        padding: 0;
        max-width: none !important;
        display: block !important;
        background-color: #000;
        color: #fff;
      }
      button {
        background-color: transparent;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFileUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file); 
    });

    const newFiles = selectedFiles.map(file => ({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      type: file.type,
      uploading: true
    }));

    setFiles(prev => [...prev, ...newFiles]);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();

      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'ai',
        text: `Success! ${data.message} You can now ask questions about these documents.`,
        timestamp: new Date().toISOString()
      }]);

    } catch (error) {
      console.error("Upload Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'ai',
        text: "⚠️ Error uploading files. Is the backend server running on port 8000?",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // --- UPDATED STREAMING CHAT FUNCTION ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // 1. Add User Message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      text: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true); // Show loader while waiting for connection

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.text }),
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      // 2. Prepare AI Message Placeholder
      // We create an empty message immediately so we can fill it up
      const aiMsgId = Date.now() + 1;
      setMessages(prev => [...prev, {
        id: aiMsgId,
        role: 'ai',
        text: '', // Start empty
        timestamp: new Date().toISOString()
      }]);

      setIsLoading(false); // Hide the "Thinking..." bubbles now that we are streaming

      // 3. Set up the Stream Reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk (a few words)
        const chunk = decoder.decode(value, { stream: true });

        // Update the SPECIFIC message ID with the new chunk
        setMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, text: msg.text + chunk } // Append chunk to existing text
            : msg
        ));
      }

    } catch (error) {
      console.error("Chat Error:", error);
      setIsLoading(false);
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        text: `⚠️ Error: ${error.message}. Make sure the backend is running.`,
        timestamp: new Date().toISOString()
      }]);
    }
  };
  // ----------------------------------------

  return (
    <div className="flex h-screen w-full bg-black text-zinc-100 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-72 bg-black border-r border-zinc-900
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-none'}
          flex flex-col
        `}
        style={!isSidebarOpen && window.innerWidth >= 1024 ? { width: '0px', overflow: 'hidden' } : {}}
      >
        <div className="h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-indigo-500">
            <Sparkles size={20} className="fill-indigo-500/20" />
            <span className="font-bold text-lg tracking-tight text-white">DocuMind</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="lg:hidden p-2 text-zinc-400 bg-zinc-900 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 hover:border-indigo-500 hover:bg-zinc-900 transition-all group"
          >
            <div className="p-3 rounded-full bg-zinc-900 group-hover:bg-indigo-500/20 text-zinc-400 group-hover:text-indigo-400 transition-colors">
              <UploadCloud size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-200">Upload Data</p>
              <p className="text-xs text-zinc-500 mt-1">PDF, TXT, CSV</p>
            </div>
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload} 
            className="hidden" 
            multiple
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {files.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase px-2 mb-2">Attached Files</h3>
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all group">
                  <div className="p-2 rounded bg-indigo-500/10 text-indigo-400">
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500">{file.size}</p>
                  </div>
                  <button 
                    onClick={() => removeFile(idx)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 bg-zinc-900 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-zinc-600 text-sm">
              <p>No files uploaded</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-black">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white">
              JS
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">John Smith</p>
              <p className="text-xs text-zinc-500 truncate">Pro Plan</p>
            </div>
            <Settings size={16} className="text-zinc-500" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-black relative w-full h-full">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-zinc-900 bg-black/50 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-zinc-400 bg-zinc-900/50 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <span className="text-sm font-medium text-zinc-200">
              {files.length > 0 ? `Context: ${files.length} File(s)` : 'General Chat'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-zinc-400 bg-zinc-900/50 hover:text-white hover:bg-zinc-900 rounded-lg">
              <Maximize2 size={18} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-4 max-w-3xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'ai' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot size={18} className="text-white" />
                </div>
              )}
              
              <div 
                className={`
                  relative px-6 py-4 rounded-2xl text-sm leading-relaxed shadow-sm
                  ${msg.role === 'user' 
                    ? 'bg-zinc-900 text-white rounded-tr-sm' 
                    : 'bg-black border border-zinc-900 text-zinc-300 rounded-tl-sm'
                  }
                `}
              >
                {/* Using whitespace-pre-wrap allows newlines to render correctly 
                  as the text streams in 
                */}
                <span className="whitespace-pre-wrap">{msg.text}</span>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-1">
                  <User size={18} className="text-zinc-300" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 max-w-3xl mx-auto">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                 <Loader2 size={18} className="text-white animate-spin" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-black border border-zinc-900">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-6 bg-black border-t border-zinc-900">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-zinc-900/50 border border-zinc-900 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition-all">
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-zinc-400 bg-transparent hover:text-white hover:bg-zinc-900 rounded-xl transition-colors"
              >
                <Paperclip size={20} />
              </button>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Ask something..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-zinc-500 resize-none max-h-32 py-3"
                rows={1}
                style={{ minHeight: '44px' }} 
              />
              
              <button 
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className={`
                  p-3 rounded-xl flex items-center justify-center transition-all
                  ${input.trim() && !isLoading
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20' 
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  }
                `}
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-center text-xs text-zinc-600 mt-3 font-medium">
              DocuMind AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;