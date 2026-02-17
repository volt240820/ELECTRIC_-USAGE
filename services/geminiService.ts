
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, GeminiResponseSchema } from "../types";

// Helper function to safely retrieve API Key from various environment configurations
const getApiKey = (): string => {
  let key = '';

  // 1. Try Vite-specific import.meta.env (Primary for Vite apps, Cloudflare Pages, Vercel)
  try {
    // @ts-ignore
    if (import.meta?.env?.VITE_API_KEY) {
      // @ts-ignore
      key = import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  // 2. Try standard process.env (Fallback)
  if (!key) {
    try {
      if (typeof process !== 'undefined' && process.env?.API_KEY) {
        key = process.env.API_KEY || '';
      }
    } catch (e) {}
  }

  // Sanitize: Trim whitespace and remove surrounding quotes if present
  // This handles cases where users accidentally paste "AIza..." or 'AIza...' or add spaces.
  return key.trim().replace(/^["']|["']$/g, '');
};

// Optimization: Compress and Resize Image before sending to API
// Reduces payload size from ~5MB (PNG) to ~150KB (JPG), speeding up transfer and inference significantly.
const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      // Limit max dimension to 1024px. 
      // This is sufficient for OCR but vastly faster than full 4K screenshots.
      const MAX_SIZE = 1024;
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
      
      // White background (handles transparent PNGs)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG with 0.7 quality (Good balance for OCR speed/accuracy)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(url);
      resolve(dataUrl.split(',')[1]); // Return base64 string only
    };
    
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
};

// NEW: Create a tiny thumbnail for URL sharing (< 2KB target)
export const createThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        // Ultra-aggressive resize for URL sharing (max 120px width)
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
        if (!ctx) {
            resolve(""); // Fail gracefully
            return;
        }
        
        // Draw
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Low quality JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4); 
        URL.revokeObjectURL(url);
        resolve(dataUrl.split(',')[1]); 
      };
      
      img.onerror = () => resolve("");
    });
  };

// Helper function for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Wrapper to handle quota limits with retry logic
const generateContentWithRetry = async (
  model: string, 
  contents: any, 
  config: any, 
  retries = 3, 
  initialDelay = 2000
) => {
  // Lazy initialization of the client to prevent top-level crashes
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key is missing");
  }
  
  // Removed strict 'startsWith(AIza)' check to allow flexibility.
  // The API call itself will fail if the key is invalid, which is handled in the catch block.
  
  const ai = new GoogleGenAI({ apiKey });

  let currentDelay = initialDelay;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      return response;
    } catch (error: any) {
      // Check if it's a quota or rate limit error
      const errorMessage = JSON.stringify(error).toLowerCase();
      const isQuotaError = errorMessage.includes('429') || 
                           errorMessage.includes('quota') || 
                           errorMessage.includes('exhausted') ||
                           errorMessage.includes('too many requests');

      if (isQuotaError && i < retries) {
        console.warn(`API Quota hit. Retrying in ${currentDelay}ms... (Attempt ${i + 1}/${retries})`);
        await wait(currentDelay);
        currentDelay *= 2; // Exponential backoff (2s -> 4s -> 8s)
        continue;
      }
      
      // If it's not a quota error or we ran out of retries, throw the error
      throw error;
    }
  }
  throw new Error("Failed to connect to AI service after multiple attempts.");
};

export const analyzeMeterImage = async (file: File): Promise<AnalysisResult> => {
  // Use compressed image for speed
  const base64Data = await compressImage(file);
  
  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: 'image/jpeg',
    },
  };

  // Simplified prompt for faster processing tokens
  const prompt = `
    Analyze this utility log table (electricity/gas/water). 
    Extract the Start and End readings to calculate monthly usage.
    
    **CRITICAL EXTRACTION RULES**:
    1. **Start Reading**: Find the row for the **1st day of the month** (e.g., 01 or 1st) at **00:00** (midnight).
    2. **End Reading**: Find the row that represents the end of the monthly period.
       - **Priority A**: **1st day of the NEXT month** at **00:00**.
       - **Priority B**: **Last day of the CURRENT month** at **24:00**.
       - **Priority C**: **Last day of the CURRENT month** at **00:00** (Use this if Priorities A/B are unavailable, or if it explicitly marks the period end).
    3. **Usage**: Calculate the absolute difference: |End Value - Start Value|.
    4. **Date Format**: Return the date string EXACTLY as "YYYY-MM-DD HH:MM". (e.g., 2023-10-01 00:00).
    5. **OCR Correction**: Fix common digit errors (e.g. 1 vs 7, 0 vs 8, 5 vs 6) based on the sequence of numbers.
    
    Return JSON format.
  `;

  try {
    // Switch to stable 'gemini-3-flash-preview' to avoid 404 errors with experimental names
    const response = await generateContentWithRetry(
      'gemini-3-flash-preview', 
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
    if (!text) {
      throw new Error("No response from Gemini.");
    }

    let data: GeminiResponseSchema;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse JSON:", text);
      throw new Error("AI response was not valid JSON.");
    }
    
    const startVal = Number(data.startReading.value);
    const endVal = Number(data.endReading.value);

    // Calculate usage, handling potential floating point errors
    const usage = parseFloat(Math.abs(endVal - startVal).toFixed(2));

    return {
      startReading: { ...data.startReading, value: startVal },
      endReading: { ...data.endReading, value: endVal },
      usage: usage
    };

  } catch (error: any) {
    console.error("Error analyzing image:", error);
    
    // Improved Error Parsing
    let errorMessage = error.message || "Failed to analyze the image.";

    // Attempt to extract message from JSON string error (e.g. {"error": ...})
    if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('{"error"'))) {
        try {
            // Sometimes the error message is wrapped in text, try to find the JSON part
            const jsonMatch = errorMessage.match(/\{.*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : errorMessage;
            const parsed = JSON.parse(jsonString);
            
            if (parsed.error?.message) {
                errorMessage = parsed.error.message;
            } else if (parsed.message) {
                errorMessage = parsed.message;
            }
        } catch(e) {
            // If parsing fails, use the original message
        }
    }

    // User-friendly error mapping
    const lowerMsg = errorMessage.toLowerCase();

    if (lowerMsg.includes('api key is missing')) {
      throw new Error("Setup Error: Key not found. Please set 'VITE_API_KEY' in Cloudflare Pages settings (Environment Variables).");
    }
    // We removed the 'invalid api key format' check from the top, so we don't throw it here.
    // Instead, if the key is wrong (e.g. Project ID), Google will return a 400/403.
    if (lowerMsg.includes('400') || lowerMsg.includes('invalid argument') || lowerMsg.includes('403')) {
        throw new Error("API Key Invalid: The key was rejected by Google. Please check your Cloudflare VITE_API_KEY setting.");
    }
    if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('exhausted')) {
       throw new Error("Server is busy (Quota Limit). Please try again in 1 minute.");
    }
    if (lowerMsg.includes('404') || lowerMsg.includes('not found')) {
        throw new Error("AI Model unavailable. Please contact support or try again later.");
    }
    
    // Return the cleaned up error message
    throw new Error(errorMessage);
  }
};
