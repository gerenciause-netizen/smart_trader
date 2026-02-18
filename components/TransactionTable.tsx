
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, ConsolidatedTrade } from '../types';
import { supabase } from '../lib/supabase';

interface TransactionTableProps {
  transactions: Transaction[];
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
}

const TransactionTable: React.FC<TransactionTableProps> = ({ transactions, onUpdate, onDelete }) => {
  const [viewMode, setViewMode] = useState<'individual' | 'consolidated'>('consolidated');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempStrategy, setTempStrategy] = useState('');
  const [showLinkModal, setShowLinkModal] = useState<{symbol: string, txIds: string[]} | null>(null);
  const [aiAnalyses, setAiAnalyses] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Cargar análisis para el modal de vínculo
  useEffect(() => {
    if (showLinkModal) {
      supabase.from('chart_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8)
        .then(({ data }) => setAiAnalyses(data || []));
    }
  }, [showLinkModal]);

  const consolidatedTrades = useMemo(() => {
    const tradesMap: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
      if (!tradesMap[tx.symbol]) tradesMap[tx.symbol] = [];
      tradesMap[tx.symbol].push(tx);
    });

    return Object.entries(tradesMap).map(([symbol, txs]): ConsolidatedTrade => {
      const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const totalQty = sorted.reduce((acc, curr) => acc + curr.quantity, 0);
      const totalPnL = sorted.reduce((acc, curr) => acc + curr.net_amount, 0);
      
      const entryTxs = sorted.filter(t => t.quantity > 0);
      const exitTxs = sorted.filter(t => t.quantity < 0);
      
      const avgEntry = entryTxs.length > 0 
        ? entryTxs.reduce((acc, t) => acc + (t.price * t.quantity), 0) / entryTxs.reduce((acc, t) => acc + t.quantity, 0)
        : 0;
        
      const avgExit = exitTxs.length > 0
        ? Math.abs(exitTxs.reduce((acc, t) => acc + (t.price * t.quantity), 0) / exitTxs.reduce((acc, t) => acc + t.quantity, 0))
        : 0;

      // Buscamos si alguna transacción del grupo ya tiene una imagen asociada
      const txWithImage = sorted.find(t => t.analysis_image_url || t.analysis_id);

      return {
        symbol,
        strategy: sorted[0].strategy || 'Sin Estrategia',
        totalQuantity: totalQty,
        avgEntryPrice: avgEntry,
        avgExitPrice: avgExit,
        totalPnL: totalPnL,
        executions: sorted,
        status: Math.abs(totalQty) < 0.0001 ? 'Closed' : 'Open',
        lastDate: sorted[sorted.length - 1].date,
        analysis_image_url: txWithImage?.analysis_image_url,
        analysis_id: txWithImage?.analysis_id
      };
    }).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [transactions]);

  const handleLinkAnalysis = async (analysis: any) => {
    if (!showLinkModal) return;
    // Vinculamos a todas las transacciones de este símbolo para que sea consistente
    for (const id of showLinkModal.txIds) {
      await onUpdate(id, { 
        analysis_id: analysis.id, 
        analysis_image_url: analysis.image_url 
      });
    }
    setShowLinkModal(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !showLinkModal) return;
    setIsUploading(true);

    try {
      // Clean filename before use to avoid issues with regex or special chars
      const spaceRegex = /\s+/g;
      const cleanName = file.name.replace(spaceRegex, '_');
      const fileName = `manual-trade-charts/${Date.now()}-${cleanName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chart-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chart-images')
        .getPublicUrl(fileName);

      for (const id of showLinkModal.txIds) {
        await onUpdate(id, { analysis_image_url: publicUrl });
      }
      setShowLinkModal(null);
    } catch (err: any) {
      alert("Error al subir imagen: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[600px] animate-in fade-in duration-500">
      <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center bg-slate-50/30 gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase italic">Bitácora de Guerra</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Análisis de ejecución y validación visual</p>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-[2rem] shadow-inner border border-slate-200">
          <button 
            onClick={() => setViewMode('consolidated')}
            className={`px-8 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'consolidated' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-indigo-600'}`}
          >
            Trades Consolidados
          </button>
          <button 
            onClick={() => setViewMode('individual')}
            className={`px-8 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'individual' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-indigo-600'}`}
          >
            Histórico IBKR
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-400 text-[10px] uppercase tracking-[0.3em] font-black border-b border-slate-100">
              <th className="px-10 py-8">Activo / Fecha</th>
              <th className="px-10 py-8">Estado</th>
              <th className="px-10 py-8">Evidencia / Plan</th>
              <th className="px-10 py-8">Estrategia</th>
              {viewMode === 'consolidated' && <th className="px-10 py-8">P. Entrada</th>}
              <th className="px-10 py-8 text-right">PnL Neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {viewMode === 'consolidated' ? (
              consolidatedTrades.map(trade => (
                <tr key={trade.symbol} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-10 py-6">
                    <span className="font-black text-slate-800 block text-base tracking-tighter">{trade.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{trade.lastDate}</span>
                  </td>
                  <td className="px-10 py-6">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${trade.status === 'Closed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                      {trade.status === 'Closed' ? 'Cerrado' : 'Abierto'}
                    </span>
                  </td>
                  <td className="px-10 py-6">
                    {trade.analysis_image_url ? (
                      <div className="relative group w-14 h-14">
                        <img 
                          src={trade.analysis_image_url} 
                          className="w-full h-full object-cover rounded-2xl shadow-lg border border-white cursor-pointer hover:scale-[2.5] hover:z-50 transition-transform origin-center" 
                          onClick={() => window.open(trade.analysis_image_url, '_blank')}
                        />
                        <button 
                          onClick={() => setShowLinkModal({symbol: trade.symbol, txIds: trade.executions.map(ex => ex.id)})}
                          className="absolute -top-2 -right-2 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <i className="fa-solid fa-link text-[10px]"></i>
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowLinkModal({symbol: trade.symbol, txIds: trade.executions.map(ex => ex.id)})}
                        className="w-14 h-14 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 hover:border-indigo-400 hover:text-indigo-400 hover:bg-indigo-50 transition-all group/btn"
                      >
                        <i className="fa-solid fa-camera-retro text-xs mb-1 group-hover/btn:scale-110 transition-transform"></i>
                        <span className="text-[7px] font-black uppercase">Link</span>
                      </button>
                    )}
                  </td>
                  <td className="px-10 py-6">
                    <span className="text-xs font-bold text-slate-500 italic bg-slate-100 px-3 py-1 rounded-lg">
                      {trade.strategy}
                    </span>
                  </td>
                  {viewMode === 'consolidated' && (
                    <td className="px-10 py-6 font-black text-slate-600 text-sm tracking-tight">${trade.avgEntryPrice.toFixed(2)}</td>
                  )}
                  <td className={`px-10 py-6 text-right font-black text-xl tracking-tighter ${trade.totalPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {trade.totalPnL >= 0 ? '+' : ''}${trade.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            ) : (
              transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-10 py-6">
                    <span className="font-black text-slate-800 block text-sm tracking-tighter">{tx.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{tx.date}</span>
                  </td>
                  <td className="px-10 py-6">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${tx.quantity > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                      {tx.quantity > 0 ? 'Compra' : 'Venta'}
                    </span>
                  </td>
                  <td className="px-10 py-6">
                    {tx.analysis_image_url && (
                      <img 
                        src={tx.analysis_image_url} 
                        className="w-10 h-10 object-cover rounded-xl shadow-sm cursor-pointer" 
                        onClick={() => window.open(tx.analysis_image_url, '_blank')}
                      />
                    )}
                  </td>
                  <td className="px-10 py-6 text-[10px] font-bold text-slate-400">{tx.strategy}</td>
                  <td className={`px-10 py-6 text-right font-black text-sm ${tx.net_amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ${tx.net_amount.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para vincular evidencias */}
      {showLinkModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-indigo-950/40 backdrop-blur-md animate-in fade-in p-6">
          <div className="bg-white w-full max-w-3xl rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-indigo-950 p-10 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter italic">Vincular Plan: {showLinkModal.symbol}</h3>
                <p className="text-indigo-300/60 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Asocia tu análisis técnico a esta ejecución</p>
              </div>
              <button onClick={() => setShowLinkModal(null)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-rose-500 transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Opción 1: Subida Directa */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Carga Manual Directa</h4>
                <div 
                  onClick={() => document.getElementById('manual-trade-upload')?.click()}
                  className={`border-4 border-dashed rounded-[3rem] p-10 h-[300px] flex flex-col items-center justify-center cursor-pointer transition-all ${isUploading ? 'bg-slate-50 border-slate-200' : 'border-slate-100 hover:border-indigo-400 hover:bg-indigo-50/50'}`}
                >
                  <input type="file" id="manual-trade-upload" className="hidden" onChange={handleFileUpload} accept="image/*" />
                  <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 shadow-xl ${isUploading ? 'bg-slate-200' : 'bg-indigo-600 text-white rotate-3 group-hover:rotate-0 transition-transform'}`}>
                    {isUploading ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>}
                  </div>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-tight text-center">
                    {isUploading ? 'Sincronizando...' : 'Arrastra o haz clic para subir gráfico'}
                  </span>
                </div>
              </div>

              {/* Opción 2: Historial AI */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vincular desde Chart AI</h4>
                <div className="h-[300px] overflow-y-auto pr-4 space-y-3 custom-scrollbar">
                  {aiAnalyses.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                      <i className="fa-solid fa-robot text-3xl mb-4"></i>
                      <p className="text-[10px] font-black uppercase">Sin historial de IA</p>
                    </div>
                  ) : (
                    aiAnalyses.map(analysis => (
                      <div 
                        key={analysis.id} 
                        onClick={() => handleLinkAnalysis(analysis)}
                        className="group flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-indigo-600 hover:border-indigo-600 cursor-pointer transition-all shadow-sm hover:shadow-indigo-200"
                      >
                        <img src={analysis.image_url} className="w-14 h-14 rounded-2xl object-cover shadow-md group-hover:scale-110 transition-transform" />
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-slate-800 uppercase truncate group-hover:text-white">{new Date(analysis.created_at).toLocaleDateString()}</p>
                          <p className="text-[8px] font-bold text-slate-400 truncate opacity-80 group-hover:text-white/60">Análisis Validado</p>
                        </div>
                        <i className="fa-solid fa-link ml-auto text-slate-300 group-hover:text-white/40"></i>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionTable;
