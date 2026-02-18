
import React, { useState, useCallback, useEffect } from 'react';
import { analyzeChartImage } from '../services/geminiService';
import { supabase } from '../lib/supabase';
import { AccountType, StrategyCard } from '../types';

interface AnalysisRecord {
  id: string;
  image_url: string;
  calendar_image_url?: string;
  analysis_text: string;
  created_at: string;
}

interface TradePlan {
  entry: string;
  stop: string;
  target: string;
}

interface ChartAnalyzerProps {
  activeAccount: AccountType;
  userId: string;
}

const ChartAnalyzer: React.FC<ChartAnalyzerProps> = ({ activeAccount, userId }) => {
  const [image, setImage] = useState<string | null>(null);
  const [calendarImage, setCalendarImage] = useState<string | null>(null);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [sentiment, setSentiment] = useState<{ long: number, short: number } | null>(null);
  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [strategyCards, setStrategyCards] = useState<StrategyCard[]>([]);
  
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [inspectingRecord, setInspectingRecord] = useState<AnalysisRecord | null>(null);

  const parseMetaData = (text: string) => {
    const sMatch = text.match(/\[SENTIMENT\]\s*LONG:\s*(\d+)%,\s*SHORT:\s*(\d+)%/i);
    const pMatch = text.match(/\[TRADE_PLAN\]\s*ENTRY:\s*([^,]+),\s*STOP:\s*([^,]+),\s*TARGET:\s*(.+)/i);
    
    let sent = null;
    let plan = null;

    if (sMatch) {
      sent = { long: parseInt(sMatch[1]), short: parseInt(sMatch[2]) };
    }
    if (pMatch) {
      plan = { entry: pMatch[1].trim(), stop: pMatch[2].trim(), target: pMatch[3].trim() };
    }
    return { sent, plan };
  };

  const updateCurrentAnalysisStates = (text: string) => {
    const { sent, plan } = parseMetaData(text);
    setSentiment(sent);
    setTradePlan(plan);
  };

  const fetchTodayCalendar = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('daily_calendars')
        .select('image_url')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (data) {
        setCalendarImage(data.image_url);
        setCalendarUrl(data.image_url);
      }
    } catch (err) { console.error(err); }
  }, [userId]);

  const fetchData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: histData } = await supabase
        .from('chart_analyses')
        .select('*')
        .eq('account_label', activeAccount)
        .order('created_at', { ascending: false });
      setHistory(histData || []);
      const { data: cardData } = await supabase.from('strategy_cards').select('*');
      setStrategyCards(cardData || []);
      await fetchTodayCalendar();
    } catch (err) { console.error(err); }
    finally { setHistoryLoading(false); }
  }, [activeAccount, fetchTodayCalendar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            if (!image) setImage(result);
            else { setCalendarImage(result); setCalendarUrl(null); }
            setAnalysis('');
            setSentiment(null);
            setTradePlan(null);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, [image]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const runAnalysis = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeChartImage(image, calendarImage || undefined, strategyCards);
      setAnalysis(result);
      updateCurrentAnalysisStates(result);
      const publicImageUrl = await uploadToBucket(image, activeAccount);
      let finalCalendarUrl = calendarUrl;
      if (calendarImage && !calendarUrl) {
        finalCalendarUrl = await uploadToBucket(calendarImage, 'calendars');
        const today = new Date().toISOString().split('T')[0];
        const { error: calError } = await supabase.from('daily_calendars').upsert({ 
          user_id: userId, 
          date: today, 
          image_url: finalCalendarUrl 
        }, { onConflict: 'user_id,date' });
        
        if (calError && calError.code === '42P10') {
           console.warn("Falta restricción UNIQUE en daily_calendars.");
        }
        setCalendarUrl(finalCalendarUrl);
      }
      const { data, error: insertError } = await supabase.from('chart_analyses').insert({
        account_label: activeAccount, image_url: publicImageUrl, calendar_image_url: finalCalendarUrl, analysis_text: result, user_id: userId
      }).select().single();
      if (insertError) throw insertError;
      if (data) setHistory(prev => [data, ...prev]);
    } catch (err: any) { 
      console.error("Error en Auditoría:", err);
      setError(err.message || "Error desconocido al procesar la auditoría."); 
    }
    finally { setLoading(false); }
  };

  const uploadToBucket = async (base64Data: string, folder: string): Promise<string> => {
    if (base64Data.startsWith('http')) return base64Data;
    const base64Content = base64Data.split(',')[1];
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    const fileName = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const { error: uploadError } = await supabase.storage.from('chart-images').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('chart-images').getPublicUrl(fileName);
    return publicUrl;
  };

  const deleteFromHistory = async (record: AnalysisRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este análisis?')) return;
    try {
      const urlParts = record.image_url.split('/chart-images/public/');
      const filePath = urlParts.length > 1 ? urlParts[1] : record.image_url.split('/chart-images/')[1];
      if (filePath) await supabase.storage.from('chart-images').remove([filePath]);
      await supabase.from('chart_analyses').delete().eq('id', record.id);
      setHistory(prev => prev.filter(r => r.id !== record.id));
      if (inspectingRecord?.id === record.id) setInspectingRecord(null);
    } catch (err) { alert("Error al eliminar"); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500 pb-20 relative">
      
      {/* Smart Zoom Preview Overlay (Hover) */}
      {hoveredImage && !inspectingRecord && (
        <div className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center p-12 bg-indigo-950/20 backdrop-blur-[2px] animate-in zoom-in fade-in duration-200">
          <div className="bg-white p-3 rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.5)] border-4 border-indigo-600/10 max-w-6xl w-full">
            <img src={hoveredImage} className="w-full max-h-[85vh] object-contain rounded-[2rem]" alt="Zoom Preview" />
            <div className="mt-4 flex justify-center">
              <span className="bg-indigo-950 text-white px-8 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl">
                Vista de Pájaro Activada
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Auditor Split-Screen Modal (SIMULTANEOUS VIEW) */}
      {inspectingRecord && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 md:p-8 bg-indigo-950/80 backdrop-blur-2xl animate-in zoom-in duration-300">
          <div className="bg-white w-full max-w-[98vw] h-[95vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
            {/* Header */}
            <div className="bg-slate-900 px-10 py-6 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <i className="fa-solid fa-microscope text-xl"></i>
                </div>
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight">Consola de Auditoría</h3>
                  <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.4em]">{new Date(inspectingRecord.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setInspectingRecord(null)} className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center hover:bg-rose-500 hover:rotate-90 transition-all">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Split Content */}
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden bg-slate-50">
              {/* Left Side: Sticky Visuals */}
              <div className="w-full md:w-[65%] h-1/2 md:h-full flex flex-col p-6 gap-4 overflow-hidden border-r border-slate-200">
                <div className="flex-grow bg-slate-900 rounded-[2.5rem] p-4 flex items-center justify-center shadow-inner relative group">
                  <img src={inspectingRecord.image_url} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-transform duration-700 hover:scale-[1.03]" alt="Main Chart" />
                  <div className="absolute top-6 left-6 bg-indigo-600/90 text-white px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">Captura de Ejecución</div>
                </div>
                {inspectingRecord.calendar_image_url && (
                  <div className="h-1/3 bg-white rounded-[2.5rem] border border-slate-200 p-4 shadow-sm relative group overflow-hidden">
                    <img src={inspectingRecord.calendar_image_url} className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity" alt="Calendar" />
                    <div className="absolute top-4 left-6 text-[8px] font-black uppercase text-slate-400">Contexto Macroeconómico</div>
                  </div>
                )}
              </div>

              {/* Right Side: Professional Report */}
              <div className="w-full md:w-[35%] h-1/2 md:h-full bg-white overflow-y-auto custom-scrollbar flex flex-col">
                <div className="p-10 space-y-10">
                  {(() => {
                    const { sent, plan } = parseMetaData(inspectingRecord.analysis_text);
                    return (
                      <>
                        {sent && (
                          <div className="bg-indigo-950 p-8 rounded-[2.5rem] shadow-xl text-white">
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-4">Pulso de Probabilidad</span>
                            <div className="flex gap-1 h-8 rounded-full overflow-hidden border border-white/10">
                              <div className="bg-emerald-500 h-full flex items-center justify-center" style={{ width: `${sent.long}%` }}><span className="text-[10px] font-black">{sent.long}%</span></div>
                              <div className="bg-rose-500 h-full flex items-center justify-center" style={{ width: `${sent.short}%` }}><span className="text-[10px] font-black">{sent.short}%</span></div>
                            </div>
                            <div className="flex justify-between mt-3 px-1 text-[8px] font-black uppercase text-white/40"><span>Long</span><span>Short</span></div>
                          </div>
                        )}
                        {plan && (
                          <div className="grid grid-cols-1 gap-4">
                            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex justify-between items-center group hover:border-indigo-200 transition-all">
                              <span className="text-[9px] font-black text-slate-400 uppercase">Punto Entrada</span>
                              <span className="text-sm font-black text-indigo-600 italic">{plan.entry}</span>
                            </div>
                            <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex justify-between items-center group hover:border-rose-300 transition-all">
                              <span className="text-[9px] font-black text-rose-400 uppercase">Stop Loss</span>
                              <span className="text-sm font-black text-rose-600 italic">{plan.stop}</span>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex justify-between items-center group hover:border-emerald-300 transition-all">
                              <span className="text-[9px] font-black text-emerald-400 uppercase">Take Profit</span>
                              <span className="text-sm font-black text-emerald-600 italic">{plan.target}</span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed font-medium whitespace-pre-wrap pb-10">
                    {inspectingRecord.analysis_text.replace(/\[SENTIMENT\].*/, '').replace(/\[TRADE_PLAN\].*/, '')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Analysis Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[3.5rem] shadow-sm border border-slate-100">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2 italic uppercase">Audit War Room</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8">Análisis Híbrido: Técnico + Fundamental</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">1. Análisis Técnico</label>
                <div className={`relative border-4 border-dashed rounded-[2.5rem] transition-all group flex flex-col items-center justify-center p-6 min-h-[280px] overflow-hidden ${image ? 'border-indigo-100 bg-slate-50' : 'border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30'}`}>
                  {!image ? (
                    <div className="text-center">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><i className="fa-solid fa-chart-line text-xl"></i></div>
                      <p className="text-slate-600 font-black text-xs mb-1">Pega el Gráfico</p>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) { const r = new FileReader(); r.onload = (ev) => setImage(ev.target?.result as string); r.readAsDataURL(file); }
                      }} accept="image/*" />
                    </div>
                  ) : (
                    <div className="w-full h-full relative group">
                      <img src={image} className="w-full h-[220px] rounded-2xl shadow-xl object-contain cursor-zoom-in" onMouseEnter={() => setHoveredImage(image)} onMouseLeave={() => setHoveredImage(null)} />
                      <button onClick={() => setImage(null)} className="absolute top-2 right-2 w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><i className="fa-solid fa-xmark text-xs"></i></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center ml-4 mr-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">2. Calendario</label>
                  {calendarUrl && <span className="text-[8px] font-black text-emerald-500 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">Sincro OK</span>}
                </div>
                <div className={`relative border-4 border-dashed rounded-[2.5rem] transition-all group flex flex-col items-center justify-center p-6 min-h-[280px] overflow-hidden ${calendarImage ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
                  {!calendarImage ? (
                    <div className="text-center">
                      <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><i className="fa-solid fa-calendar-days text-xl"></i></div>
                      <p className="text-slate-600 font-black text-xs mb-1">Pega el Calendario</p>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) { const r = new FileReader(); r.onload = (ev) => setCalendarImage(ev.target?.result as string); r.readAsDataURL(file); }
                      }} accept="image/*" />
                    </div>
                  ) : (
                    <div className="w-full h-full relative group">
                      <img src={calendarImage} className="w-full h-[220px] rounded-2xl shadow-xl object-contain cursor-zoom-in" onMouseEnter={() => setHoveredImage(calendarImage)} onMouseLeave={() => setHoveredImage(null)} />
                      <button onClick={() => { setCalendarImage(null); setCalendarUrl(null); }} className="absolute top-2 right-2 w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><i className="fa-solid fa-xmark text-xs"></i></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {error && (
              <div className="mb-6 p-6 bg-rose-50 border border-rose-100 rounded-[2rem] animate-in slide-in-from-top-2">
                <div className="flex items-center gap-3 text-rose-600 font-black text-[10px] uppercase mb-2">
                   <i className="fa-solid fa-triangle-exclamation"></i>
                   Atención requerida
                </div>
                <p className="text-rose-500 text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}

            <button onClick={runAnalysis} disabled={!image || loading} className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl ${!image || loading ? 'bg-slate-100 text-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}>
              {loading ? <i className="fa-solid fa-microscope animate-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-3"></i>}
              {loading ? 'Analizando...' : 'Iniciar Auditoría Completa'}
            </button>
          </div>
        </div>

        <div className="lg:min-h-[600px] flex flex-col gap-6">
          {sentiment && (
            <div className="bg-indigo-950 p-10 rounded-[3rem] shadow-2xl animate-in slide-in-from-top-4 duration-500">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Trade Pulse</span>
                <i className="fa-solid fa-bolt-lightning text-amber-400"></i>
              </div>
              <div className="flex gap-1 h-14 rounded-2xl overflow-hidden border-2 border-white/5">
                <div className="bg-emerald-500 h-full flex items-center justify-center relative group transition-all duration-1000" style={{ width: `${sentiment.long}%` }}>
                  <span className="text-white font-black text-lg italic">{sentiment.long}%</span>
                </div>
                <div className="bg-rose-500 h-full flex items-center justify-center relative group transition-all duration-1000" style={{ width: `${sentiment.short}%` }}>
                  <span className="text-white font-black text-lg italic">{sentiment.short}%</span>
                </div>
              </div>
              {tradePlan && (
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[8px] font-black text-indigo-400 uppercase mb-1">Entry</span>
                    <span className="text-sm font-black text-white italic">{tradePlan.entry}</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[8px] font-black text-rose-400 uppercase mb-1">Stop</span>
                    <span className="text-sm font-black text-white italic">{tradePlan.stop}</span>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[8px] font-black text-emerald-400 uppercase mb-1">Target</span>
                    <span className="text-sm font-black text-white italic">{tradePlan.target}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {analysis ? (
            <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-right-4 duration-500 flex-grow overflow-y-auto max-h-[600px] group/report relative">
              <button onClick={() => setInspectingRecord({ id: 'current', image_url: image!, analysis_text: analysis, created_at: new Date().toISOString() })} className="absolute top-8 right-8 bg-indigo-600 text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl opacity-0 group-hover/report:opacity-100 transition-opacity flex items-center gap-2">
                <i className="fa-solid fa-expand"></i> Simultanear Vista
              </button>
              <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-50">
                <div className="w-10 h-10 bg-indigo-950 text-white rounded-xl flex items-center justify-center shadow-lg"><i className="fa-solid fa-clipboard-check"></i></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg italic">Reporte de Auditoría</h3>
              </div>
              <div className="prose prose-slate max-w-none text-slate-600 whitespace-pre-wrap font-medium leading-relaxed">
                {analysis.replace(/\[SENTIMENT\].*/, '').replace(/\[TRADE_PLAN\].*/, '')}
              </div>
            </div>
          ) : (
            <div className="flex-grow bg-slate-50/50 border-4 border-dashed border-slate-100 rounded-[3.5rem] flex flex-col items-center justify-center p-20 text-center opacity-40 min-h-[400px]">
              <i className="fa-solid fa-robot text-5xl text-slate-300 mb-8"></i>
              <h3 className="text-xl font-black text-slate-300 uppercase tracking-widest">Motor Listo</h3>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="pt-12 border-t border-slate-100">
        <h3 className="text-2xl font-black text-slate-800 mb-10 tracking-tight flex items-center gap-4 italic uppercase">
          <i className="fa-solid fa-history text-indigo-400"></i> Registro Histórico
        </h3>
        {historyLoading ? (
          <div className="flex justify-center py-10 opacity-20"><i className="fa-solid fa-circle-notch animate-spin text-3xl"></i></div>
        ) : history.length === 0 ? (
          <div className="bg-slate-50 rounded-[3.5rem] p-20 text-center border-2 border-dashed border-slate-200 opacity-50"><p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Sin registros</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {history.map(record => (
              <div key={record.id} onClick={() => setInspectingRecord(record)} onMouseEnter={() => setHoveredImage(record.image_url)} onMouseLeave={() => setHoveredImage(null)} className="group relative bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer transform hover:-translate-y-2">
                <div className="aspect-video overflow-hidden bg-slate-100 relative">
                  <img src={record.image_url} alt="Histórico" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-950/20 backdrop-blur-[1px]"><i className="fa-solid fa-magnifying-glass-plus text-white text-2xl"></i></div>
                </div>
                <div className="p-8">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{new Date(record.created_at).toLocaleDateString()}</span>
                    <button onClick={(e) => deleteFromHistory(record, e)} className="text-slate-300 hover:text-rose-500 transition-colors z-10"><i className="fa-solid fa-trash-can text-xs"></i></button>
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 line-clamp-2 italic opacity-80">{record.analysis_text.substring(0, 80).replace(/[#*\[\]SENTIMENT:TRADE_PLAN]/g, '')}...</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartAnalyzer;
