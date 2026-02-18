
import React, { useMemo, useState } from 'react';
import { Transaction, ConsolidatedTrade, AccountType } from '../types';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area
} from 'recharts';

interface DashboardProps {
  transactions: Transaction[];
  startingCash: number;
  accountType: AccountType;
  onUpdateStartingCash: (amount: number) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, startingCash, accountType, onUpdateStartingCash }) => {
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [tempCash, setTempCash] = useState(startingCash.toString());

  const consolidated = useMemo(() => {
    if (transactions.length === 0 && startingCash === 0) return { trades: [], stats: null };

    const tradesMap: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
      if (!tradesMap[tx.symbol]) tradesMap[tx.symbol] = [];
      tradesMap[tx.symbol].push(tx);
    });

    const trades: ConsolidatedTrade[] = Object.entries(tradesMap).map(([symbol, txs]) => {
      const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const totalQty = sorted.reduce((acc, curr) => acc + curr.quantity, 0);
      const totalPnL = sorted.reduce((acc, curr) => acc + curr.net_amount, 0);
      
      return {
        symbol,
        strategy: sorted[0].strategy || 'Sin Estrategia',
        totalQuantity: totalQty,
        avgEntryPrice: 0,
        avgExitPrice: 0,
        totalPnL: totalPnL,
        executions: sorted,
        status: Math.abs(totalQty) < 0.0001 ? 'Closed' : 'Open',
        lastDate: sorted[sorted.length - 1].date
      };
    });

    const totalPnL = trades.reduce((acc, t) => acc + t.totalPnL, 0);
    const currentBalance = startingCash + totalPnL;
    const roi = startingCash > 0 ? (totalPnL / startingCash) * 100 : 0;
    
    const strategyStats: Record<string, { pnl: number, count: number }> = {};
    trades.forEach(t => {
      if (!strategyStats[t.strategy]) strategyStats[t.strategy] = { pnl: 0, count: 0 };
      strategyStats[t.strategy].pnl += t.totalPnL;
      strategyStats[t.strategy].count += 1;
    });

    const strategyList = Object.entries(strategyStats).map(([name, data]) => ({
      name, pnl: data.pnl, count: data.count
    })).sort((a, b) => b.pnl - a.pnl);

    let cumulative = startingCash;
    const equityCurve = [...trades]
      .sort((a, b) => new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime())
      .map(t => {
        cumulative += t.totalPnL;
        return { date: t.lastDate, balance: parseFloat(cumulative.toFixed(2)) };
      });

    if (equityCurve.length === 0 && startingCash > 0) {
      equityCurve.push({ date: 'Inicio', balance: startingCash });
    } else if (equityCurve.length > 0) {
      equityCurve.unshift({ date: 'Balance Inicial', balance: startingCash });
    }

    return { 
      trades, 
      equityCurve,
      stats: {
        totalPnL,
        roi,
        currentBalance,
        openPositions: trades.filter(t => t.status === 'Open').length,
        closedTrades: trades.filter(t => t.status === 'Closed').length,
        bestStrategy: strategyList[0] || { name: 'N/A', pnl: 0 },
        strategyList
      }
    };
  }, [transactions, startingCash]);

  const handleSaveCash = async () => {
    const val = parseFloat(tempCash);
    if (!isNaN(val)) {
      await onUpdateStartingCash(val);
      setIsEditingCash(false);
    }
  };

  const themeColor = accountType === 'demo' ? '#4f46e5' : '#10b981';

  if (!consolidated.stats && startingCash === 0 && !isEditingCash) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in duration-500">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-inner border border-slate-100 mb-6">
          <i className={`fa-solid fa-vault text-3xl ${accountType === 'demo' ? 'text-indigo-100' : 'text-emerald-100'}`}></i>
        </div>
        <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Cuenta sin fondos</h3>
        <button 
          onClick={() => { setTempCash('0'); setIsEditingCash(true); }}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg"
        >
          Configurar Balance Inicial
        </button>
      </div>
    );
  }

  const { stats, equityCurve } = consolidated;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`bg-white p-10 rounded-[3.5rem] shadow-sm border transition-all hover:shadow-2xl relative group ${accountType === 'demo' ? 'border-indigo-50' : 'border-emerald-50'}`}>
          <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Capital {accountType.toUpperCase()}</p>
            <button 
              onClick={() => { setTempCash(startingCash.toString()); setIsEditingCash(!isEditingCash); }}
              className="text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
            >
              <i className={`fa-solid ${isEditingCash ? 'fa-xmark' : 'fa-pen-to-square'}`}></i>
            </button>
          </div>
          
          {isEditingCash ? (
            <div className="space-y-3 animate-in fade-in">
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl">$</span>
                <input 
                  type="number" 
                  value={tempCash}
                  onChange={(e) => setTempCash(e.target.value)}
                  className="w-full pl-6 bg-transparent border-b-2 border-indigo-500 outline-none text-2xl font-black text-slate-800"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCash()}
                />
              </div>
              <button 
                onClick={handleSaveCash}
                className="w-full py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest"
              >
                Guardar Balance
              </button>
            </div>
          ) : (
            <>
              <h3 className={`text-4xl font-black transition-colors ${accountType === 'demo' ? 'text-indigo-900' : 'text-emerald-900'}`}>
                ${(stats?.currentBalance || startingCash).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Base Inicial: ${startingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </>
          )}
        </div>

        <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-50 group hover:shadow-xl transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">P&L Neto</p>
          <h3 className={`text-4xl font-black ${(stats?.totalPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {(stats?.totalPnL || 0) >= 0 ? '+' : ''}${(stats?.totalPnL || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black mt-2 uppercase ${ (stats?.roi || 0) >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600' }`}>
            {stats?.roi.toFixed(2)}% ROI
          </div>
        </div>

        <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Operativa</p>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <span className="block text-2xl font-black text-slate-800">{stats?.closedTrades || 0}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">Cerradas</span>
            </div>
            <div className="w-px h-10 bg-slate-100"></div>
            <div className="text-center">
              <span className={`block text-2xl font-black ${accountType === 'demo' ? 'text-indigo-600' : 'text-emerald-600'}`}>{stats?.openPositions || 0}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">Abiertas</span>
            </div>
          </div>
        </div>

        <div className={`${accountType === 'demo' ? 'bg-indigo-950' : 'bg-emerald-950'} p-10 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden group`}>
          <div className={`absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-20 group-hover:scale-125 transition-transform duration-700 ${accountType === 'demo' ? 'bg-indigo-600' : 'bg-emerald-600'}`}></div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 relative z-10">Mejor Estrategia</p>
          <h3 className="text-xl font-black truncate relative z-10">{stats?.bestStrategy.name || 'N/A'}</h3>
          <p className="text-emerald-400 font-black mt-1 text-2xl relative z-10">+${(stats?.bestStrategy.pnl || 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        <div className="lg:col-span-2 bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 h-[500px]">
          <h4 className="text-xl font-black text-slate-800 mb-8 tracking-tight flex items-center gap-3">
            <i className={`fa-solid fa-chart-area ${accountType === 'demo' ? 'text-indigo-500' : 'text-emerald-500'}`}></i>
            Curva de Equity {accountType.toUpperCase()}
          </h4>
          <div className="h-full pb-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={themeColor} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                <XAxis dataKey="date" hide />
                <YAxis 
                  domain={['dataMin - 100', 'auto']} 
                  fontSize={10} 
                  fontWeight="black" 
                  stroke="#cbd5e1" 
                  tickFormatter={(v) => `$${v.toLocaleString()}`} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)', padding: '16px' }}
                  itemStyle={{ fontWeight: '900', color: themeColor }}
                  labelStyle={{ fontWeight: '700', color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}
                  formatter={(v: any) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Balance']}
                />
                <Area 
                  type="monotone" 
                  dataKey="balance" 
                  stroke={themeColor} 
                  strokeWidth={6} 
                  fill="url(#colorBalance)" 
                  animationDuration={2000} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 overflow-y-auto max-h-[500px]">
          <h4 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Estrategias {accountType.toUpperCase()}</h4>
          <div className="space-y-8">
            {stats?.strategyList.map((s) => (
              <div key={s.name} className="flex flex-col gap-3 group">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-sm font-black text-slate-700 group-hover:text-indigo-600 transition-colors">{s.name}</span>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase mt-0.5">{s.count} Trades</span>
                  </div>
                  <span className={`text-sm font-black ${s.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ${s.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-50">
                  <div 
                    className={`h-full transition-all duration-1000 group-hover:opacity-80 ${s.pnl >= 0 ? (accountType === 'demo' ? 'bg-indigo-500' : 'bg-emerald-500') : 'bg-rose-500'}`} 
                    style={{ width: `${Math.min(100, (Math.abs(s.pnl) / (Math.abs(stats.bestStrategy.pnl) || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
