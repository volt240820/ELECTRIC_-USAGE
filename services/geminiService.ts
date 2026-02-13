import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, GeminiResponseSchema } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const analyzeMeterImage = async (file: File): Promise<AnalysisResult> => {
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    You are an advanced AI data analyst specializing in OCR correction for utility logs.
    
    **TASK**: 
    Analyze the provided utility data table image and extract the **Start Reading** and **End Reading**.
    
    **LOGIC**:
    The user specifically requested: "Calculate usage by checking the difference between the 1st day reading and the Last Day 00:00 reading."
    
    1. **Start Reading**: Find the row for the **1st day of the month** (e.g., '01', 'DD-01') at **00:00**.
    2. **End Reading**: Find the row for the **Last day of the month** (e.g., 30th or 31st) at **00:00**.
       - *Note*: If the log doesn't have the last day at 00:00, look for the reading closest to the end of the month.
       - *Priority*: 1st Day 00:00 vs Last Day 00:00.
    3. **Usage Calculation**: Absolute difference between End Value and Start Value. (|End - Start|).

    **STRATEGY**:
    1. **Scan All Rows**: Identify all date/value pairs.
    2. **Select Start Row**: Look for 'DD-01' (1st of month). If not found, take the earliest timestamp.
    3. **Select End Row**: 
       - Look for the row with date 30 or 31 (or 28/29 for Feb) at time 00:00.
       - If not found, look for the highlighted row or the last recorded entry.

    **OCR CORRECTION (CRITICAL)**:
    - The images often have low resolution or compression artifacts.
    - **7 vs 4**: A '7' often looks like a '4' if the top bar is blurry. Look at the angle.
    - **8 vs 6/9**: Verify loops.
    - **Context Check**: Compare the Start Value and End Value. The numbers should look consistent in magnitude.
    - **Specific Case**: If you see '694957.7' but the pixels might be '697948.7', re-examine the 3rd digit carefully. Trust the visual shape over assumptions.

    **DATA FORMAT**:
    - Value: "684955,8" (comma) should be read as number 684955.8.
  `;

  try {
    // Upgrading to gemini-3-flash-preview for better OCR reasoning and context understanding
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        parts: [
          imagePart,
          { text: prompt }
        ]
      },
      config: {
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
    });

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

    const usage = Math.abs(endVal - startVal);

    return {
      startReading: { ...data.startReading, value: startVal },
      endReading: { ...data.endReading, value: endVal },
      usage: parseFloat(usage.toFixed(2))
    };

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw new Error("Failed to analyze the image. Please try a clearer image or manually edit the results.");
  }
};