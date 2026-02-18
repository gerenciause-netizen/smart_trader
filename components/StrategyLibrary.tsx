
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { StrategyCard } from '../types';

interface StrategyLibraryProps {
  userId: string;
}

const StrategyLibrary: React.FC<StrategyLibraryProps> = ({ userId }) => {
  const [cards, setCards] = useState<StrategyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('strategy_cards')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCards(data || []);
    } catch (err) {
      console.error("Error cargando biblioteca:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!preview || !newTitle) return;
    setUploading(true);
    try {
      // 1. Upload to Storage
      const base64Content = preview.split(',')[1];
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const spaceRegex = /\s+/g;
      const cleanTitle = newTitle.replace(spaceRegex, '_');
      const fileName = `${userId}/strategies/${Date.now()}-${cleanTitle}.jpg`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chart-images')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chart-images')
        .getPublicUrl(fileName);

      // 2. Insert into Table
      const { error: dbError } = await supabase
        .from('strategy_cards')
        .insert({
          user_id: userId,
          title: newTitle,
          description: newDesc,
          image_url: publicUrl
        });

      if (dbError) throw dbError;

      setNewTitle('');
      setNewDesc('');
      setPreview(null);
      fetchCards();
    } catch (err: any) {
      alert("Error al subir estrategia: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteCard = async (card: StrategyCard) => {
    if (!confirm('¿Eliminar esta carta de estrategia?')) return;
    try {
      // Eliminar de storage
      const pathParts = card.image_url.split('/chart-images/public/');
      const filePath = pathParts.length > 1 ? pathParts[1] : card.image_url.split('/chart-images/')[1];
      if (filePath) await supabase.storage.from('chart-images').remove([filePath]);

      // Eliminar de DB
      await supabase.from('strategy_cards').delete().eq('id', card.id);
      setCards(prev => prev.filter(c => c.id !== card.id));
    } catch (err) {
      alert("Error al eliminar");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500 pb-20">
      <div className="bg-indigo-950 p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="max-w-xl">
            <h2 className="text-4xl font-black italic tracking-tighter mb-4 uppercase">Estrategias Maestras</h2>
            <p className="text-indigo-200 font-medium leading-relaxed">
              Sube tus capturas de patrones de velas, formaciones técnicas o reglas de entrada. 
              Nuestra IA comparará tus gráficos reales con estas cartas para validar tus operaciones.
            </p>
          </div>
          <div className="w-px h-24 bg-white/10 hidden md:block"></div>
          <div className="flex flex-col items-center">
             <span className="text-5xl font-black text-indigo-400">{cards.length}</span>
             <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Cartas Activas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Formulario de Subida */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 sticky top-24">
            <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tighter italic">Nueva Carta</h3>
            
            <div className="space-y-4">
              <div className={`border-2 border-dashed rounded-3xl p-4 flex flex-col items-center justify-center min-h-[150px] cursor-pointer transition-all hover:bg-slate-50 ${preview ? 'border-indigo-200' : 'border-slate-200'}`} onClick={() => document.getElementById('card-upload')?.click()}>
                {preview ? (
                  <img src={preview} className="w-full h-32 object-contain rounded-xl" />
                ) : (
                  <>
                    <i className="fa-solid fa-plus text-slate-300 text-2xl mb-2"></i>
                    <span className="text-[10px] font-black text-slate-400 uppercase">Cargar Imagen</span>
                  </>
                )}
                <input type="file" id="card-upload" className="hidden" onChange={handleFileChange} accept="image/*" />
              </div>

              <input 
                type="text" 
                placeholder="Nombre (ej: Bullish Engulfing)"
                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none focus:border-indigo-400"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />

              <textarea 
                placeholder="Reglas de entrada / salida..."
                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none focus:border-indigo-400 h-24 resize-none"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              ></textarea>

              <button 
                onClick={handleUpload}
                disabled={uploading || !preview || !newTitle}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 transition-all"
              >
                {uploading ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Guardar en Biblioteca'}
              </button>
            </div>
          </div>
        </div>

        {/* Galería de Cartas */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="flex justify-center py-20"><i className="fa-solid fa-circle-notch animate-spin text-4xl text-slate-200"></i></div>
          ) : cards.length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border-2 border-dashed border-slate-100 opacity-60">
              <i className="fa-solid fa-book-open text-5xl text-slate-200 mb-6"></i>
              <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Tu biblioteca está vacía</h3>
              <p className="text-slate-400 text-xs font-bold mt-2">Sube tus primeras cartas para que la IA pueda usarlas de referencia.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {cards.map(card => (
                <div key={card.id} className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm group hover:shadow-2xl transition-all transform hover:-translate-y-2">
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    <img src={card.image_url} alt={card.title} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => deleteCard(card)}
                      className="absolute top-4 right-4 w-8 h-8 bg-white/80 backdrop-blur-sm text-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                  <div className="p-6">
                    <h4 className="font-black text-slate-800 uppercase tracking-tighter mb-2">{card.title}</h4>
                    <p className="text-[11px] font-bold text-slate-400 line-clamp-3 leading-relaxed">{card.description}</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-2">
                       <i className="fa-solid fa-shield-halved text-emerald-400 text-[10px]"></i>
                       <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Private Cloud Asset</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StrategyLibrary;
