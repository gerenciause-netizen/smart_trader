
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Usamos Refs para evitar re-renders y bloqueos de UI (Fix INP)
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
        setIsChangingPassword(true);
        setIsResetting(false);
        setIsRegistering(false);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const email = emailRef.current?.value || '';
    const password = passwordRef.current?.value || '';
    const confirmPassword = confirmPasswordRef.current?.value || '';

    try {
      if (isChangingPassword) {
        if (password !== confirmPassword) {
          throw new Error("Las contraseñas no coinciden");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage({ type: 'success', text: '¡Contraseña actualizada con éxito! Ya puedes entrar.' });
        setTimeout(() => {
          setIsChangingPassword(false);
          if (passwordRef.current) passwordRef.current.value = '';
          if (confirmPasswordRef.current) confirmPasswordRef.current.value = '';
          window.location.hash = '';
        }, 3000);
      } else if (isResetting) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/#recovery`,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Te enviamos un enlace. Revisa tu bandeja de entrada.' });
      } else if (isRegistering) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ type: 'success', text: '¡Registro exitoso! Confirma tu email para continuar.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
      <div className="max-w-md w-full bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 p-12 animate-in zoom-in duration-500">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200 rotate-3 transition-transform hover:rotate-0">
            <i className={`fa-solid ${isChangingPassword ? 'fa-key' : 'fa-layer-group'} text-3xl`}></i>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase italic">
            {isChangingPassword ? 'Nueva Clave' : 'IBKR Hub'}
          </h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
            {isChangingPassword ? 'Asegura tu cuenta de nuevo' : (isResetting ? 'Recuperar Acceso' : 'Professional Strategy Journal')}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          {!isChangingPassword && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Correo Electrónico</label>
              <div className="relative group">
                <i className="fa-solid fa-envelope absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors"></i>
                <input 
                  type="email" 
                  required
                  ref={emailRef}
                  placeholder="ejemplo@trader.com"
                  className="w-full pl-14 pr-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 transition-colors font-bold text-slate-700 outline-none"
                />
              </div>
            </div>
          )}

          {!isResetting && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {isChangingPassword ? 'Nueva Contraseña' : 'Contraseña'}
                  </label>
                  {!isChangingPassword && (
                    <button 
                      type="button"
                      onClick={() => { setIsResetting(true); setMessage(null); }}
                      className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                    >
                      ¿La olvidaste?
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <i className="fa-solid fa-lock absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors"></i>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required
                    ref={passwordRef}
                    placeholder="••••••••"
                    className="w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 transition-colors font-bold text-slate-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-500 transition-colors"
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              {isChangingPassword && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Confirmar Contraseña</label>
                  <div className="relative group">
                    <i className="fa-solid fa-shield-check absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors"></i>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      required
                      ref={confirmPasswordRef}
                      placeholder="••••••••"
                      className="w-full pl-14 pr-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 transition-colors font-bold text-slate-700 outline-none"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {message && (
            <div className={`p-5 rounded-[1.5rem] text-[11px] font-bold text-center border animate-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
              <i className={`fa-solid ${message.type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-2`}></i>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none ${isResetting || isChangingPassword ? 'bg-indigo-950 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'}`}
          >
            {loading ? (
              <i className="fa-solid fa-circle-notch animate-spin"></i>
            ) : (
              <i className={`fa-solid ${isChangingPassword ? 'fa-check-double' : (isResetting ? 'fa-paper-plane' : 'fa-arrow-right-to-bracket')}`}></i>
            )}
            {isChangingPassword ? 'Actualizar Clave' : (isResetting ? 'Enviar Enlace' : (isRegistering ? 'Crear Cuenta' : 'Ingresar'))}
          </button>
        </form>

        <div className="mt-10 text-center">
          {(isResetting || isChangingPassword) ? (
            <button 
              onClick={() => { setIsResetting(false); setIsChangingPassword(false); setMessage(null); }}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <i className="fa-solid fa-arrow-left"></i> Volver al inicio
            </button>
          ) : (
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setMessage(null); setShowPassword(false); }}
              className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors group"
            >
              {isRegistering ? '¿Ya tienes cuenta? Inicia Sesión' : '¿Eres nuevo trader? Regístrate aquí'}
              <i className="fa-solid fa-chevron-right ml-2 group-hover:translate-x-1 transition-transform"></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
