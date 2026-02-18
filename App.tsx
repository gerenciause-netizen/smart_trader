
import React, { useState, useEffect, useCallback } from 'react';
import { ViewType, Transaction, AccountType } from './types';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import TransactionTable from './components/TransactionTable';
import ImportView from './components/ImportView';
import AIAnalysis from './components/AIAnalysis';
import ChartAnalyzer from './components/ChartAnalyzer';
import StrategyLibrary from './components/StrategyLibrary';
import Auth from './components/Auth';
import { supabase } from './lib/supabase';

const DEFAULT_DEMO_CASH = 50000;

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<ViewType>('dashboard');
  const [activeAccount, setActiveAccount] = useState<AccountType>(
    (localStorage.getItem('ibkr_active_account') as AccountType) || 'demo'
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingCash, setStartingCash] = useState<number>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdateStartingCash = async (amount: number) => {
    if (!session?.user) return;
    try {
      setStartingCash(amount);
      
      const { error } = await supabase
        .from('account_balances')
        .upsert({ 
          account_label: activeAccount, 
          starting_cash: amount,
          user_id: session.user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,account_label' });
      
      if (error) {
        if (error.code === '42P10') {
          console.error("ERROR DE BASE DE DATOS: Falta restricción UNIQUE en account_balances.");
          console.info("Ejecuta este SQL en Supabase: ALTER TABLE account_balances ADD CONSTRAINT unique_user_account UNIQUE (user_id, account_label);");
          throw new Error("Configuración de Base de Datos incompleta. Revisa la consola (F12) para instrucciones SQL.");
        }
        throw error;
      }
    } catch (err: any) {
      console.error("Error al persistir balance:", err.message);
      setError(err.message || "Error al guardar el capital inicial.");
    }
  };

  const fetchAccountData = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('account_label', activeAccount)
        .order('date', { ascending: false });
      
      if (txError) throw txError;
      setTransactions(txData || []);
      
      const { data: balanceData, error: balanceError } = await supabase
        .from('account_balances')
        .select('starting_cash')
        .eq('account_label', activeAccount)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (balanceError) throw balanceError;

      if (balanceData) {
        setStartingCash(balanceData.starting_cash);
      } else if (activeAccount === 'demo') {
        await handleUpdateStartingCash(DEFAULT_DEMO_CASH);
      } else {
        setStartingCash(0);
      }
      
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeAccount, session]);

  useEffect(() => {
    if (session) {
      fetchAccountData();
      localStorage.setItem('ibkr_active_account', activeAccount);
    }
  }, [fetchAccountData, activeAccount, session]);

  const handleAccountChange = (acc: AccountType) => {
    setActiveAccount(acc);
    setView('dashboard');
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    try {
      const { error: updateError } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id);
      
      if (updateError) throw updateError;
      setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ...updates } : tx));
    } catch (err: any) {
      alert('Error al actualizar: ' + (err.message || JSON.stringify(err)));
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta transacción?')) return;
    try {
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      setTransactions(prev => prev.filter(tx => tx.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err.message || JSON.stringify(err)));
    }
  };

  const handleBulkImport = async (newTxs: Omit<Transaction, 'id'>[], detectedStartingCash?: number) => {
    if (!session?.user) throw new Error("Debes iniciar sesión para importar datos.");
    
    try {
      if (detectedStartingCash !== undefined && detectedStartingCash !== null) {
        await handleUpdateStartingCash(detectedStartingCash);
      }

      if (newTxs.length > 0) {
        const txsWithUser = newTxs.map(tx => ({
          ...tx,
          account_label: activeAccount,
          user_id: session.user.id
        }));

        const { data, error: insertError } = await supabase
          .from('transactions')
          .insert(txsWithUser)
          .select();
        
        if (insertError) throw insertError;
        if (data) setTransactions(prev => [...data, ...prev]);
      }

      setView('dashboard');
    } catch (err: any) {
      const errMsg = err.message || JSON.stringify(err);
      throw new Error(`Error en base de datos: ${errMsg}`);
    }
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${activeAccount === 'demo' ? 'bg-[#f8fafc]' : 'bg-[#f0fdf4]'}`}>
      <Navbar 
        currentView={view} 
        setView={setView} 
        activeAccount={activeAccount} 
        onAccountChange={handleAccountChange} 
        user={session.user}
      />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className={`w-12 h-12 border-4 rounded-full animate-spin ${activeAccount === 'demo' ? 'border-indigo-100 border-t-indigo-600' : 'border-emerald-100 border-t-emerald-600'}`}></div>
            <span className="mt-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">
              Sincronizando Cuenta...
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-4xl mx-auto bg-white p-12 rounded-[3rem] shadow-xl border border-rose-100 text-center animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">Error de Sincronización</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">{error}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => window.location.reload()} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg">Reintentar</button>
              <button onClick={() => setError(null)} className="px-10 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all">Omitir</button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {view === 'dashboard' && (
              <Dashboard 
                transactions={transactions} 
                startingCash={startingCash} 
                accountType={activeAccount} 
                onUpdateStartingCash={handleUpdateStartingCash}
              />
            )}
            {view === 'transactions' && (
              <TransactionTable transactions={transactions} onUpdate={updateTransaction} onDelete={deleteTransaction} />
            )}
            {view === 'import' && (
              <ImportView onImport={handleBulkImport} activeAccount={activeAccount} />
            )}
            {view === 'chart-analysis' && (
              <ChartAnalyzer activeAccount={activeAccount} userId={session.user.id} />
            )}
            {view === 'strategy-library' && (
              <StrategyLibrary userId={session.user.id} />
            )}
            {view === 'ai-insights' && (
              <AIAnalysis transactions={transactions} />
            )}
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-100 py-8 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">
        <p>&copy; {new Date().getFullYear()} IBKR Hub • Conectado como {session.user.email}</p>
      </footer>
    </div>
  );
};

export default App;
