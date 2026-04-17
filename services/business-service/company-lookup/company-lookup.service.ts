import { GoogleGenAI } from "@google/genai";
import { AppError } from "../../helper-service/modules.export";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a financial research assistant. When given a company name, search the web for the company's most recent annual revenue. Return ONLY a JSON object in this exact format, no markdown, no backticks, no explanation:
{
  "company_name": "Official Company Name",
  "revenue_inr_crores": <number or null>,
  "revenue_source": "Brief source like 'FY24 Annual Report' or 'News estimate'",
  "confidence": "high" | "medium" | "low",
  "notes": "Any important context, e.g. 'Private company, revenue estimated from news reports'"
}
If you cannot find revenue data, set revenue_inr_crores to null and explain in notes.`;

export interface CompanyLookupResponse {
  company_name: string;
  revenue_inr_crores: number | null;
  revenue_source: string;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/**
 * Extract JSON from Gemini response text
 * Handles various response formats including markdown fences
 */
function extractJson(text: string): CompanyLookupResponse | null {
  const trimmed = text.trim();

  // Pass 1: Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to other methods
  }

  // Pass 2: Strip markdown fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue to other methods
    }
  }

  // Pass 3: Extract first JSON object
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 4;

/**
 * Generate content with retry logic for rate limits and overload
 */
async function generateWithRetry(
  ai: GoogleGenAI,
  companyName: string
): Promise<{ text: string }> {
  let attempt = 0;

  while (true) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Company: ${companyName}`,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ googleSearch: {} }],
        },
      });
      return { text: response.text ?? "" };
    } catch (err: unknown) {
      const error = err as { status?: number; response?: { status?: number }; message?: string };
      const status = error?.status || error?.response?.status;

      if (status && RETRY_STATUSES.has(status) && attempt < MAX_RETRIES) {
        const delayMs = Math.min(1000 * 2 ** attempt + Math.random() * 500, 16000);
        console.warn(
          `Gemini ${status} on attempt ${attempt + 1}, retrying in ${Math.round(delayMs)}ms…`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        attempt++;
      } else {
        throw err;
      }
    }
  }
}

/**
 * Lookup company revenue using Google Gemini AI
 */
export const lookupCompanyService = async (
  companyName: string
): Promise<CompanyLookupResponse> => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AppError("GEMINI_API_KEY is not configured", 500);
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await generateWithRetry(ai, companyName);
    const rawText = response.text;

    if (!rawText.trim()) {
      throw new AppError("Empty response from Gemini model", 502);
    }

    const parsed = extractJson(rawText);

    if (!parsed) {
      console.error("Failed to parse Gemini response:", rawText);
      throw new AppError("Model response was not valid JSON", 502);
    }

    return parsed;
  } catch (err: unknown) {
    const error = err as { status?: number; response?: { status?: number }; message?: string };

    // Re-throw AppError as-is
    if (err instanceof AppError) {
      throw err;
    }

    const status = error?.status || error?.response?.status || 500;
    const isOverloaded = status === 503;

    if (isOverloaded) {
      throw new AppError("Gemini API is overloaded. Please try again in a moment.", 503);
    }

    throw new AppError(error?.message || "Internal error during company lookup", status);
  }
};
