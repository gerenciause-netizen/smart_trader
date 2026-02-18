
import { GoogleGenAI } from "@google/genai";
import { Transaction, StrategyCard } from "../types";

// Helper para convertir URL a Base64
async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    console.error("DEBUG: La variable process.env.API_KEY está vacía o es undefined.");
    throw new Error("ERROR CRÍTICO: No se detectó la clave de IA del proyecto 'Smart Trader'. Verifica las variables de entorno.");
  }
  
  return new GoogleGenAI({ apiKey });
};

// Analyse trading performance with Google Search grounding for real-time market context
export async function analyzeTradingPerformance(transactions: Transaction[]) {
  try {
    const ai = getAiClient();
    const summary = transactions.map(tx => ({
      date: tx.date,
      symbol: tx.symbol,
      pnl: tx.net_amount,
      strategy: tx.strategy || 'Uncategorized',
      type: tx.transaction_type
    }));

    const prompt = `Actúa como el motor analítico de "Smart Trader". Analiza este historial de Interactive Brokers y proporciona insights profesionales en español, utilizando datos de mercado actualizados si es necesario:
    1. La estrategia más rentable y por qué podría estar funcionando en el contexto actual del mercado.
    2. Patrones de riesgo detectados.
    3. Recomendaciones concretas.
    
    DATA: ${JSON.stringify(summary.slice(0, 40))}
    
    Responde en formato Markdown con encabezados claros e incluye fuentes si usas información externa.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 16384 } // High-depth reasoning for performance audit
      }
    });
    
    // List citations if present from grounding metadata
    let citations = "";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      citations = "\n\n---\n**Fuentes de Mercado:**\n" + chunks
        .filter(c => c.web)
        .map(c => `- [${c.web.title}](${c.web.uri})`)
        .join("\n");
    }

    return (response.text || "No se generó análisis.") + citations;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return error.message || "Error al analizar los datos con IA.";
  }
}

// Analyze chart image with Thinking Budget for deeper technical audit
export async function analyzeChartImage(base64Image: string, calendarBase64?: string, strategyCards: StrategyCard[] = []) {
  try {
    const ai = getAiClient();
    const chartData = base64Image.split(',')[1] || base64Image;

    let prompt = `Actúa como el Auditor Senior de "Smart Trader". Audita este trade de forma exhaustiva.
    
    CONTEXTO:
    - Imagen 1: Gráfico técnico actual.
    ${calendarBase64 ? '- Imagen 2: Calendario Económico.' : ''}
    
    TU MISIÓN:
    1. Analizar el setup técnico profundo.
    2. Evaluar el riesgo macro si hay calendario adjunto.
    3. Validar contra la biblioteca de estrategias del usuario.
    
    OBLIGATORIO: Finaliza con:
    [SENTIMENT] LONG: X%, SHORT: Y%
    [TRADE_PLAN] ENTRY: Valor, STOP: Valor, TARGET: Valor
    
    INFORME EN ESPAÑOL (Markdown).`;

    const parts: any[] = [{ text: prompt }];

    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: chartData
      }
    });

    if (calendarBase64) {
      const calendarData = calendarBase64.split(',')[1] || calendarBase64;
      parts.push({ text: "CALENDARIO ECONÓMICO:" });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: calendarData
        }
      });
    }

    const cardsToProcess = strategyCards.slice(0, 3);
    for (const card of cardsToProcess) {
      try {
        const cardBase64 = await imageUrlToBase64(card.image_url);
        parts.push({ text: `REFERENCIA ESTRATEGIA: ${card.title}. ${card.description}` });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cardBase64
          }
        });
      } catch (err) {
        parts.push({ text: `REFERENCIA TEXTO: ${card.title}. ${card.description}` });
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingBudget: 24576 } // Maximum depth for technical validation
      }
    });

    return response.text || "No se pudo completar el análisis visual.";
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    throw error;
  }
}