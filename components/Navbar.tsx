
import React from 'react';
import { ViewType, AccountType } from '../types';
import { supabase } from '../lib/supabase';

interface NavbarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  activeAccount: AccountType;
  onAccountChange: (acc: AccountType) => void;
  user: any;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, setView, activeAccount, onAccountChange, user }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { id: 'transactions', label: 'Trades', icon: 'fa-list-ul' },
    { id: 'import', label: 'Import CSV', icon: 'fa-file-import' },
    { id: 'strategy-library', label: 'My Library', icon: 'fa-book-bookmark' },
    { id: 'chart-analysis', label: 'Chart AI', icon: 'fa-chart-simple' },
    { id: 'ai-insights', label: 'AI Strategy', icon: 'fa-robot' },
  ];

  const handleSignOut = async () => {
    if (confirm('¿Cerrar sesión?')) {
      await supabase.auth.signOut();
    }
  };

  const bgColor = activeAccount === 'demo' ? 'bg-indigo-900' : 'bg-emerald-900';
  const activeBtnColor = activeAccount === 'demo' ? 'bg-indigo-700' : 'bg-emerald-700';

  return (
    <nav className={`${bgColor} text-white sticky top-0 z-50 shadow-2xl transition-colors duration-500`}>
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('dashboard')}>
              <i className={`fa-solid fa-brain text-2xl ${activeAccount === 'demo' ? 'text-indigo-400' : 'text-emerald-400'}`}></i>
              <span className="text-xl font-black tracking-tighter uppercase italic">Smart Trader</span>
            </div>

            {/* Account Switcher */}
            <div className="hidden lg:flex bg-black/20 p-1 rounded-2xl border border-white/10">
              <button 
                onClick={() => onAccountChange('demo')}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeAccount === 'demo' ? 'bg-white text-indigo-900 shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                Demo
              </button>
              <button 
                onClick={() => onAccountChange('real')}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeAccount === 'real' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                Real
              </button>
            </div>
          </div>
          
          <div className="hidden md:flex space-x-1 items-center">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewType)}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl transition-all duration-300 font-bold text-[11px] uppercase tracking-wider ${
                  currentView === item.id 
                    ? `${activeBtnColor} text-white shadow-lg scale-105` 
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <i className={`fa-solid ${item.icon} text-xs`}></i>
                <span>{item.label}</span>
              </button>
            ))}
            
            <div className="h-6 w-px bg-white/10 mx-4"></div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase opacity-40 leading-none">Trader</span>
                <span className="text-[11px] font-bold text-white leading-none mt-1">{user?.email?.split('@')[0]}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all group shadow-inner"
                title="Cerrar Sesión"
              >
                <i className="fa-solid fa-power-off text-xs group-hover:scale-110"></i>
              </button>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-4">
             <span className="text-[9px] font-black uppercase px-3 py-1 bg-white/10 rounded-full border border-white/20">
               {activeAccount}
             </span>
             <button onClick={handleSignOut} className="text-white/60"><i className="fa-solid fa-power-off"></i></button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;