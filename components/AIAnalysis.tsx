
import React, { useState } from 'react';
import { Transaction } from '../types';
import { analyzeTradingPerformance } from '../services/geminiService';

interface AIAnalysisProps {
  transactions: Transaction[];
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ transactions }) => {
  const [analysis, setAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async () => {
    setIsLoading(true);
    const result = await analyzeTradingPerformance(transactions);
    setAnalysis(result);
    setIsLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-robot text-3xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">AI Performance Strategy Advisor</h2>
        <p className="text-slate-500 mb-8 max-w-lg mx-auto">
          Our Gemini-powered AI will analyze your {transactions.length} recent transactions to find hidden patterns and suggest strategy optimizations.
        </p>
        
        <button
          onClick={handleAnalyze}
          disabled={isLoading || transactions.length === 0}
          className={`px-8 py-3 rounded-xl font-bold transition-all shadow-md ${
            isLoading || transactions.length === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <i className="fa-solid fa-circle-notch animate-spin"></i>
              Analyzing Data...
            </span>
          ) : 'Generate Strategy Insights'}
        </button>
      </div>

      {analysis && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 prose prose-indigo max-w-none animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 text-indigo-600 font-bold mb-6 border-b border-indigo-50 pb-4">
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            AI Report
          </div>
          <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
            {analysis}
          </div>
        </div>
      )}

      {!analysis && !isLoading && transactions.length > 0 && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <p>Click the button above to start your AI-powered trading review.</p>
        </div>
      )}
    </div>
  );
};

export default AIAnalysis;
