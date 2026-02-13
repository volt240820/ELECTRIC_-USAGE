import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, GeminiResponseSchema } from "../types";

// Helper function to safely retrieve API Key from various environment configurations
const getApiKey = (): string => {
  // 1. Try standard process.env (Node/Webpack/Vercel)
  try {
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {}

  // 2. Try Vite-specific import.meta.env (Fallback for standard Vite builds)
  try {
    // @ts-ignore
    if (import.meta?.env?.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  return '';
};

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
    throw new Error("API Key is missing. Please check your settings (Vercel Environment Variables). Key must be named 'API_KEY' or 'VITE_API_KEY'.");
  }
  
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
      const errorMessage = error.message?.toLowerCase() || '';
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
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    You are an advanced AI data analyst specializing in OCR correction for utility logs.
    
    **TASK**: 
    Analyze the provided utility data table image and extract the **Start Reading** and **End Reading** to calculate monthly usage.
    
    **SPECIFIC REQUIREMENT**:
    The user wants to calculate usage based on:
    1. **Start Reading**: The reading on the **1st day of the target month** (e.g., '2024-01-01') at **00:00**.
    2. **End Reading**: The reading on the **Last day of the target month** (e.g., '2024-01-31') at **00:00** (or the closest available timestamp to the end of the month if 00:00 is missing).
    
    **STRATEGY**:
    1. **Scan All Rows**: Identify the date column and value column.
    2. **Find Start**: Look for row matching "Day 01" at "00:00".
    3. **Find End**: Look for row matching the last day (28, 29, 30, or 31) at "00:00". 
       - If "Last Day 00:00" is missing, try finding "Next Month 1st 00:00" as it is equivalent.
       - If neither exists, take the very last recorded entry in the table.
    4. **Calculate Usage**: |End Value - Start Value|.

    **OCR CORRECTION TIPS**:
    - **7 vs 4**: A '7' often looks like a '4' in low res. Check the top bar angle.
    - **8 vs 6/9**: Check for closed loops.
    - **Decimals**: Look carefully for dots or commas. "12345.6"
    - **Consistency**: The End Value should be >= Start Value (usually). If End < Start, check if the meter rolled over or if OCR misread a digit.

    **OUTPUT FORMAT**:
    Return JSON only.
  `;

  try {
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
    
    // User-friendly error mapping
    if (error.message?.includes('API Key is missing')) {
      throw new Error("System Error: API Key is not configured. Please verify Vercel Environment Variables.");
    }
    if (error.message?.includes('429') || error.message?.includes('quota')) {
       throw new Error("Server is busy (Quota Exceeded). Please wait a moment and try again.");
    }
    
    throw new Error(error.message || "Failed to analyze the image.");
  }
};