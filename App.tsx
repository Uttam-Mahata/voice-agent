import React from 'react';
import { Conversation } from './components/Conversation';
import { GithubIcon } from './components/icons';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-6xl mx-auto flex flex-col h-full flex-grow">
        <header className="flex justify-between items-center py-4 border-b border-gray-700">
          <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500">
            Gemini Financial Voice Agent
          </h1>
          <a
            href="https://github.com/google/genai-js"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <GithubIcon className="w-6 h-6" />
          </a>
        </header>

        <main className="flex-grow flex flex-col py-8">
          <Conversation />
        </main>
      </div>
    </div>
  );
};

export default App;
