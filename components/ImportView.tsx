
import React, { useState, useRef, useEffect } from 'react';
import { Transaction, AccountType } from '../types';

interface ImportViewProps {
  onImport: (txs: Omit<Transaction, 'id'>[], startingCash?: number) => Promise<void>;
  activeAccount: AccountType;
}

const ImportView: React.FC<ImportViewProps> = ({ onImport, activeAccount }) => {
  const [importMode, setImportMode] = useState<'csv' | 'paste'>('csv');
  const [csvText, setCsvText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [globalStrategy, setGlobalStrategy] = useState('');
  const [manualStartingCash, setManualStartingCash] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectionSummary, setDetectionSummary] = useState<{
    txCount: number;
    startCash: number;
    endCash: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Define regexes outside of functions to avoid syntax error in template contexts if any
  const quoteRegex = /"/g;
  const numRegex = /[^0-9.\-]/g;

  const cleanNum = (val: string) => {
    if (!val) return 0;
    let sanitized = val.trim();
    if (sanitized.includes(',') && sanitized.includes('.')) {
      if (sanitized.indexOf(',') < sanitized.indexOf('.')) sanitized = sanitized.replace(/,/g, '');
      else sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    } else if (sanitized.includes(',')) sanitized = sanitized.replace(',', '.');
    
    // Using numRegex defined in outer scope
    return parseFloat(sanitized.replace(numRegex, "")) || 0;
  };

  const analyzeData = (text: string) => {
    try {
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      if (lines.length === 0) return;
      const firstLine = lines[0].replace(quoteRegex, '');
      const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');
      
      let startCash = 0;
      let txCount = 0;

      lines.forEach(line => {
        const cols = line.replace(quoteRegex, '').split(delimiter);
        const col0 = cols[0]?.toLowerCase() || '';
        const col1 = cols[1]?.toLowerCase() || '';
        
        if (col0.includes('summary') && col1.includes('data')) {
          const label = cols[2]?.toLowerCase() || '';
          if (label.includes('starting cash') || label.includes('efectivo inicial')) {
            startCash = cleanNum(cols[3]);
          }
        }
        
        if (col0.toLowerCase().includes('transaction') && col1.toLowerCase() === 'data') {
          txCount++;
        }
      });

      setDetectionSummary({ txCount, startCash, endCash: 0 });
      if (startCash > 0 && !manualStartingCash) setManualStartingCash(startCash.toString());
    } catch (e) {
      console.error("Error analizando preliminarmente:", e);
    }
  };

  const processData = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const input = importMode === 'csv' ? csvText : pasteText;
      const finalStartCash = manualStartingCash ? parseFloat(manualStartingCash) : detectionSummary?.startCash;

      if (!input.trim() && finalStartCash !== undefined) {
        // Solo actualizar balance
        await onImport([], finalStartCash);
        return;
      }

      if (!input.trim()) throw new Error("No hay datos para procesar ni balance manual.");

      const lines = input.split('\n').map(l => l.trim().replace(quoteRegex, ''));
      const firstValidLine = lines.find(l => l.length > 0) || "";
      const delimiter = firstValidLine.includes('\t') ? '\t' : (firstValidLine.includes(';') ? ';' : ',');

      let newTxs: any[] = [];
      let colMap: Record<string, number> = {};
      let foundHeader = false;

      for (let i = 0; i < lines.length; i++) {
        const row = lines[i].split(delimiter);
        const isTransactionSection = row[0]?.toLowerCase().includes('transaction');
        const isHeaderRow = row[1]?.toLowerCase() === 'header';

        if (isTransactionSection && isHeaderRow) {
          foundHeader = true;
          const findIdx = (names: string[]) => row.findIndex(h => names.some(n => h.toLowerCase().includes(n.toLowerCase())));
          
          colMap = {
            date: findIdx(['date', 'fecha']),
            account: findIdx(['account', 'cuenta']),
            description: findIdx(['description', 'descripción']),
            txType: findIdx(['transaction type', 'transaction t']),
            symbol: findIdx(['symbol', 'símbolo']),
            qty: findIdx(['quantity', 'cantidad']),
            price: findIdx(['price', 'precio']),
            gross: findIdx(['gross amount', 'gross amoun']),
            comm: findIdx(['commission', 'comisión']),
            net: findIdx(['net amount', 'net'])
          };
          
          for (let j = i + 1; j < lines.length; j++) {
            const dataRow = lines[j].split(delimiter);
            if (dataRow[0]?.toLowerCase().includes('transaction') && dataRow[1]?.toLowerCase() === 'data') {
              const symbol = dataRow[colMap.symbol];
              if (symbol && !symbol.toLowerCase().includes('total')) {
                newTxs.push({
                  header: 'Data',
                  date: dataRow[colMap.date] || new Date().toISOString().split('T')[0],
                  account: dataRow[colMap.account] || '',
                  description: dataRow[colMap.description] || '',
                  transaction_type: dataRow[colMap.txType] || (cleanNum(dataRow[colMap.qty]) > 0 ? 'BUY' : 'SELL'),
                  symbol: symbol,
                  quantity: cleanNum(dataRow[colMap.qty]),
                  price: cleanNum(dataRow[colMap.price]),
                  gross_amount: cleanNum(dataRow[colMap.gross]),
                  commission: cleanNum(dataRow[colMap.comm]),
                  net_amount: cleanNum(dataRow[colMap.net]),
                  strategy: globalStrategy || 'Importación IBKR',
                  account_label: activeAccount
                });
              }
            } else if (dataRow[0] && !dataRow[0].toLowerCase().includes('transaction')) break;
          }
          break;
        }
      }

      if (!foundHeader) throw new Error("No se encontró la cabecera 'Transaction History'.");
      if (newTxs.length === 0) throw new Error("No se detectaron transacciones válidas.");

      await onImport(newTxs, finalStartCash);
      
      setCsvText('');
      setPasteText('');
      setGlobalStrategy('');
      setManualStartingCash('');
      setDetectionSummary(null);
    } catch (e: any) {
      setError(e.message || "Error desconocido al procesar.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      analyzeData(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className={`p-12 text-white transition-colors duration-500 ${activeAccount === 'demo' ? 'bg-indigo-950' : 'bg-emerald-950'}`}>
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h2 className="text-3xl font-black tracking-tight mb-1 uppercase italic">Configurar Cuenta</h2>
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest">Importa historial o ajusta tu balance</p>
            </div>
            
            <div className="flex bg-black/20 p-1.5 rounded-2xl border border-white/10">
              <button onClick={() => setImportMode('csv')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'csv' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/40 hover:text-white'}`}>Subir CSV</button>
              <button onClick={() => setImportMode('paste')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'paste' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/40 hover:text-white'}`}>Pegar Texto</button>
            </div>
          </div>
        </div>

        <div className="p-12 -mt-8 bg-white rounded-t-[3.5rem] relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
            <div className="lg:col-span-1 space-y-8">
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Capital Inicial Manual</label>
                  <div className="relative group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                    <input 
                      type="number"
                      value={manualStartingCash}
                      onChange={(e) => setManualStartingCash(e.target.value)}
                      placeholder="Ej: 5000"
                      className="w-full pl-10 pr-5 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-indigo-600 outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase ml-1 italic">* Si dejas este campo vacío, se usará el del CSV.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Estrategia Global</label>
                  <input 
                    type="text"
                    value={globalStrategy}
                    onChange={(e) => setGlobalStrategy(e.target.value)}
                    placeholder="Ej: Wheel Strategy"
                    className="w-full px-5 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {detectionSummary && detectionSummary.txCount > 0 && (
                <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 animate-in zoom-in">
                  <span className="text-[9px] font-black text-indigo-400 uppercase block mb-4">Detección Automática</span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-500">Filas:</span><span className="text-slate-800">{detectionSummary.txCount}</span></div>
                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-500">Caja detectada:</span><span className="text-slate-800">${detectionSummary.startCash.toLocaleString()}</span></div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              {importMode === 'csv' ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-full border-4 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center p-10 cursor-pointer hover:bg-slate-50 transition-all min-h-[300px]"
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                  <i className="fa-solid fa-cloud-arrow-up text-4xl text-slate-200 mb-4"></i>
                  <p className="text-slate-500 font-black uppercase text-xs tracking-widest text-center">
                    {csvText ? 'Reporte cargado • Haz clic para cambiar' : 'Arrastra o selecciona tu archivo CSV de IBKR'}
                  </p>
                </div>
              ) : (
                <textarea 
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); analyzeData(e.target.value); }}
                  placeholder="Pega las líneas de tu reporte aquí..."
                  className="w-full h-full min-h-[300px] p-8 bg-slate-50 border-2 border-slate-100 rounded-[3rem] font-mono text-xs text-slate-500 outline-none focus:border-indigo-500"
                />
              )}
            </div>
          </div>

          {error && <div className="mb-8 p-6 bg-rose-50 text-rose-600 rounded-3xl font-bold text-sm flex items-center gap-3"><i className="fa-solid fa-triangle-exclamation"></i>{error}</div>}

          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={processData}
              disabled={isProcessing}
              className="flex-grow py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:bg-slate-100"
            >
              {isProcessing ? 'Sincronizando...' : (csvText || pasteText ? 'Procesar e Importar' : 'Actualizar solo Balance')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportView;
