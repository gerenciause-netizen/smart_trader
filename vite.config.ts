import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Carga las variables de entorno del sistema (Vercel) o del archivo .env
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Mapeamos AI_Analisis o API_KEY a process.env.API_KEY para que el servicio de Gemini lo encuentre
      'process.env.API_KEY': JSON.stringify(env.AI_Analisis || env.API_KEY || env.VITE_API_KEY || process.env.API_KEY)
    }
  };
});
