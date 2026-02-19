
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
      
      // Increased to 1536px to improve OCR accuracy for dense tables and small text
      const MAX_SIZE = 1536;
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
      
      // Use white background to handle transparent images correctly
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      // Use high quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      // 0.8 quality for better detail retention
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
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
  'gemini-2.0-flash-exp',   // Primary: Excellent vision capabilities
  'gemini-1.5-pro',         // Secondary: High reasoning
  'gemini-1.5-flash'        // Tertiary: Fast & stable
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
    Analyze this utility meter reading log (e.g., 3D Utility or similar software interface).
    Your task is to extract the most recent complete month's usage data with EXTREME PRECISION.

    Step-by-Step Instructions:
    1. Identify the table structure. Look for headers like 'Date', 'Time', 'Value', 'Reading', 'Total', 'kWh'.
    2. Locate the row for the START of the month (e.g., 1st day at 00:00).
    3. Locate the row for the END of the month (e.g., 1st day of NEXT month at 00:00 OR last day of CURRENT month at 24:00).
    4. Extract the reading values exactly as they appear in the image.
    5. CRITICAL: Pay close attention to decimal points. Do not miss them.
    6. CRITICAL: Distinguish between similar digits (1 vs 7, 0 vs 8, 5 vs 6, 3 vs 8).
    7. If multiple columns exist, find the 'Active Energy' or 'Cumulative' column.
    
    Rules:
    - Usage = |End Reading - Start Reading|
    - Date Format: "YYYY-MM-DD HH:MM"
    - If the image is blurry, do your best to infer from context (e.g. increasing values).

    Return the result in the specified JSON format.
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
