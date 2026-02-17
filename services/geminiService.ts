
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, GeminiResponseSchema } from "../types";

// Helper function to safely retrieve API Key
const getApiKey = (): string => {
  let key = '';
  try {
    // @ts-ignore
    if (import.meta?.env?.VITE_API_KEY) {
      // @ts-ignore
      key = import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  if (!key) {
    try {
      if (typeof process !== 'undefined' && process.env?.API_KEY) {
        key = process.env.API_KEY || '';
      }
    } catch (e) {}
  }
  return key.trim().replace(/^["']|["']$/g, '');
};

// Optimization: Compress and Resize Image
// Reduced MAX_SIZE to 800px to further lower token usage and improve success rate
const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      // 800px is sufficient for meter digits and drastically reduces payload/latency
      const MAX_SIZE = 800;
      if (width > height && width > MAX_SIZE) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else if (height > width && height > MAX_SIZE) {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context failed"));
        return;
      }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // 0.6 quality is optimal for text readability while minimizing size
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      URL.revokeObjectURL(url);
      resolve(dataUrl.split(',')[1]); 
    };
    
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
};

export const createThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        const MAX_SIZE = 120;
        if (width > height && width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else if (height > width && height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
  
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(""); return; }
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4); 
        URL.revokeObjectURL(url);
        resolve(dataUrl.split(',')[1]); 
      };
      
      img.onerror = () => resolve("");
    });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fallback Strategy: List of models to try in order
// If the experimental 3.0 model is busy (429), we fall back to 2.0 or Stable Flash
const MODELS_TO_TRY = [
  'gemini-3-flash-preview', // Primary: Smartest
  'gemini-2.0-flash-exp',   // Secondary: Fast & generous limits
  'gemini-flash-latest'     // Tertiary: Most stable
];

const generateContentWithFallback = async (contents: any, config: any) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing");
  const ai = new GoogleGenAI({ apiKey });

  let lastError: any;

  for (const model of MODELS_TO_TRY) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      return response;
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error.message);
      lastError = error;

      // Check for specific errors that warrant trying another model
      const msg = error.message?.toLowerCase() || '';
      
      // 429: Quota Exceeded / Resource Exhausted / Busy
      // 503: Service Unavailable / Overloaded
      // 404: Model not found (experimental models sometimes disappear)
      const shouldRetry = msg.includes('429') || 
                          msg.includes('quota') || 
                          msg.includes('exhausted') || 
                          msg.includes('busy') ||
                          msg.includes('503') || 
                          msg.includes('overloaded') ||
                          msg.includes('404') || 
                          msg.includes('not found');

      if (shouldRetry) {
         // Wait briefly before switching models
         await wait(500); 
         continue; // Try next model in loop
      }

      // If it's a 400 (Bad Request) or 401 (Auth), retrying other models usually won't help
      throw error;
    }
  }
  
  // If all models fail
  throw lastError || new Error("All AI models are currently busy. Please try again later.");
};

export const analyzeMeterImage = async (file: File): Promise<AnalysisResult> => {
  const base64Data = await compressImage(file);
  
  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: 'image/jpeg',
    },
  };

  const prompt = `
    Analyze this utility log table. Extract Start/End readings for monthly usage.
    
    Rules:
    1. Start: 1st day of month 00:00.
    2. End: 1st day of NEXT month 00:00 OR Last day of CURRENT month 24:00.
    3. Usage: |End - Start|.
    4. Date Format: "YYYY-MM-DD HH:MM".
    5. Fix OCR errors (e.g. 1 vs 7, 0 vs 8).
    
    Return JSON.
  `;

  try {
    // Use the fallback wrapper instead of calling specific model directly
    const response = await generateContentWithFallback(
      {
        parts: [
          imagePart,
          { text: prompt }
        ]
      },
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            startReading: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                value: { type: Type.NUMBER },
              },
              required: ['date', 'value'],
            },
            endReading: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                value: { type: Type.NUMBER },
              },
              required: ['date', 'value'],
            },
          },
          required: ['startReading', 'endReading'],
        }
      }
    );

    const text = response.text;
    if (!text) throw new Error("No response from Gemini.");

    let data: GeminiResponseSchema;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("AI response was not valid JSON.");
    }
    
    const startVal = Number(data.startReading.value);
    const endVal = Number(data.endReading.value);
    const usage = parseFloat(Math.abs(endVal - startVal).toFixed(2));

    return {
      startReading: { ...data.startReading, value: startVal },
      endReading: { ...data.endReading, value: endVal },
      usage: usage
    };

  } catch (error: any) {
    console.error("Analysis Error:", error);
    
    let errorMessage = error.message || "Failed to analyze.";
    
    // Attempt to unwrap JSON error
    if (errorMessage.includes('{')) {
        try {
            const jsonMatch = errorMessage.match(/\{.*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : errorMessage);
            if (parsed.error?.message) errorMessage = parsed.error.message;
        } catch(e) {}
    }

    const lower = errorMessage.toLowerCase();
    
    if (lower.includes('api key')) {
      throw new Error("Check your API Key configuration.");
    }
    if (lower.includes('quota') || lower.includes('429')) {
       throw new Error("High traffic: All AI models are busy. Please wait 1 minute.");
    }
    
    throw new Error(errorMessage);
  }
};
