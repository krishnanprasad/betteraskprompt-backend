import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';

const router = express.Router();
const isDevelopment = process.env.NODE_ENV !== 'production';

const apiKey = process.env.GEMINI_API_SECRET;
const openAiKey = process.env.OPEN_AI_SECRET;

const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;
const openai = openAiKey ? new OpenAI({ apiKey: openAiKey }) : null;

// Helper function for OpenAI generation
async function generateWithOpenAI(prompt: string, systemInstruction: string) {
  if (!openai) throw new Error("OpenAI API key not configured");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemInstruction + "\n\nIMPORTANT: Return ONLY valid JSON matching the schema." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error("OpenAI returned empty content");
  
  return JSON.parse(content);
}

// Helper function for model fallback (Gemini -> OpenAI)
async function generateWithFallback(
  geminiModelName: string,
  geminiFallbackModelName: string,
  geminiParams: any,
  openAiParams: { prompt: string, systemInstruction: string }
) {
  // 1. Try Gemini Primary
  try {
    if (isDevelopment) console.log(`🤖 Attempting with Gemini: ${geminiModelName}`);
    const result = await genAI!.models.generateContent({
      model: geminiModelName,
      ...geminiParams
    });
    if (isDevelopment) console.log("AI Provider Used: GEMINI");
    return { result, provider: 'gemini' };
  } catch (error: any) {
    // 2. Try Gemini Fallback (Lite)
    try {
      if (
        error.status === 429 || 
        error.status === 503 || 
        error.message?.includes('quota') || 
        error.message?.includes('rate limit') ||
        error.message?.includes('overloaded')
      ) {
        if (isDevelopment) console.warn(`⚠️ Gemini ${geminiModelName} failed. Retrying with ${geminiFallbackModelName}...`);
        const result = await genAI!.models.generateContent({
          model: geminiFallbackModelName,
          ...geminiParams
        });
        if (isDevelopment) console.log("AI Provider Used: GEMINI (Fallback Model)");
        return { result, provider: 'gemini' };
      }
      throw error; // Throw to catch block for OpenAI fallback
    } catch (geminiError) {
      // 3. Try OpenAI
      if (openai) {
        try {
          if (isDevelopment) console.warn(`⚠️ Gemini failed. Switching to OpenAI...`);
          const jsonResponse = await generateWithOpenAI(
            openAiParams.prompt,
            openAiParams.systemInstruction
          );
          if (isDevelopment) console.log("AI Provider Used: OPENAI");
          return { result: jsonResponse, provider: 'openai' };
        } catch (openAiError) {
          console.error("OpenAI Fallback failed:", openAiError);
        }
      }
      
      if (isDevelopment) console.log("AI Provider Used: STATIC FALLBACK");
      throw geminiError; // Throw original error to trigger static fallback in route handler
    }
  }
}

// --- Caching Setup ---
interface CacheEntry {
  data: any;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Fallback Data ---
const FALLBACK_TAGS = [
  "Explain Step By Step",
  "Give Real World Examples",
  "Use Simple Language",
  "Format As Bullet Points",
  "Include Practice Questions"
];

router.post('/generate', async (req: Request, res: Response) => {
  const { topic, intent, persona, stage, selectedTags = [], visibleTags = [] } = req.body;

  if (isDevelopment) {
    console.log('\n📥 [INCOMING REQUEST] /api/tags/generate');
    console.log('   Params:', { topic, intent, persona, stage });
  }

  // 1. Validation
  if (!topic || !intent || !persona) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // 2. Check Cache
  const cacheKey = `${topic}:${intent}:${persona}:${stage}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      if (isDevelopment) console.log('   ✅ Serving from cache');
      return res.json(cached.data);
    } else {
      cache.delete(cacheKey); // Expired
    }
  }

  // 3. Fallback if no API key
  if (!genAI) {
    if (isDevelopment) console.warn('⚠️ Gemini API not configured');
    return res.json({ 
      success: true, 
      tags: FALLBACK_TAGS.slice(0, stage === 1 ? 3 : 5), 
      fallback: true, 
      message: 'Gemini API not configured' 
    });
  }

  try {
    // 4. Construct Prompt
    const count = stage === 1 ? 3 : 5;
    const existingTags = [...new Set([...selectedTags, ...visibleTags])];
    
    const systemInstruction = `You are an expert educational prompt engineer. Your task is to generate "Smart Tags" - short, action-oriented suggestions that help a user refine their prompt.
    
    Categories:
    1. Persona Style: Voice/tone (e.g., "Act As Friendly Teacher", "Be Strict Exam Coach")
    2. Add Context: Curriculum/level (e.g., "Follow CBSE Style", "Use Class 10 Level")
    3. Task Instruction: Core action (e.g., "Generate Practice Questions", "Explain Key Concepts")
    4. Format Constraints: Output structure (e.g., "Give Bullet Points", "Make Short Notes")
    5. Reasoning Help: Cognitive scaffolding (e.g., "Explain Step By Step", "Add Simple Analogy")

    Constraints:
    1. Each tag must be exactly 3 to 4 words long.
    2. Each tag must start with a strong action verb (e.g., Include, Add, Use, Explain, Provide, Avoid, Make, Give).
    3. Tags must be safe for students and appropriate for a school setting.
    4. Do NOT duplicate any of these existing tags: ${existingTags.join(', ')}.
    5. Do NOT use any punctuation in the tags (no periods, commas, etc.).
    6. Generate exactly ${count} tags IN TOTAL across all categories combined. Pick the most relevant categories for the user's intent.
    `;

    const userPrompt = `Generate ${count} smart tags for a prompt about "${topic}".
    Persona: ${persona}
    Intent: ${intent}
    Stage: ${stage} (1 = Initial suggestions, 2 = Follow-up suggestions)`;

    // 5. Define Schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        personaStyle: { type: Type.ARRAY, items: { type: Type.STRING } },
        addContext: { type: Type.ARRAY, items: { type: Type.STRING } },
        taskInstruction: { type: Type.ARRAY, items: { type: Type.STRING } },
        formatConstraints: { type: Type.ARRAY, items: { type: Type.STRING } },
        reasoningHelp: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["personaStyle", "addContext", "taskInstruction", "formatConstraints", "reasoningHelp"]
    };

    // 6. Call Gemini with Fallback
    const apiResult = await generateWithFallback(
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.7
        }
      },
      {
        prompt: userPrompt,
        systemInstruction
      }
    );

    // 7. Parse Response
    let parsed;
    if (apiResult.provider === 'gemini') {
      const responseText = (apiResult.result as any).text;
      if (!responseText) {
        throw new Error('No response text received from Gemini');
      }
      parsed = JSON.parse(responseText);
    } else {
      parsed = apiResult.result;
    }

    if (isDevelopment) {
      console.log('   Raw Groups:', parsed);
      if (apiResult.provider === 'openai') {
        console.log("DONE: OpenAI fallback enabled for /generate");
      }
    }

    // Helper to validate a list of tags
    const validateTags = (tags: string[]) => {
      if (!Array.isArray(tags)) return [];
      return tags.filter(tag => {
        const cleanTag = tag.replace(/[^\w\s]/g, '').trim();
        const words = cleanTag.split(/\s+/);
        return words.length >= 3 && words.length <= 4;
      }).map(tag => tag.replace(/[^\w\s]/g, '').trim());
    };

    const groups = {
      personaStyle: validateTags(parsed.personaStyle),
      addContext: validateTags(parsed.addContext),
      taskInstruction: validateTags(parsed.taskInstruction),
      formatConstraints: validateTags(parsed.formatConstraints),
      reasoningHelp: validateTags(parsed.reasoningHelp)
    };
    
    const allTags = [
      ...groups.personaStyle,
      ...groups.addContext,
      ...groups.taskInstruction,
      ...groups.formatConstraints,
      ...groups.reasoningHelp
    ];

    // Ensure we have enough tags, if not, fill from fallback (excluding existing)
    let finalTags = allTags.filter(t => !existingTags.includes(t));
    
    if (finalTags.length < count) {
        const needed = count - finalTags.length;
        const availableFallbacks = FALLBACK_TAGS.filter(t => !existingTags.includes(t) && !finalTags.includes(t));
        finalTags = [...finalTags, ...availableFallbacks.slice(0, needed)];
    }
    
    // Limit to requested count
    finalTags = finalTags.slice(0, count);

    const responseData = { 
      success: true, 
      groups: groups,
      tags: finalTags,
      fallback: false
    };

    // 8. Update Cache
    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });

    res.json(responseData);

  } catch (error) {
    console.error('Gemini Tag Generation Error:', error);
    res.json({
      success: true,
      tags: FALLBACK_TAGS.slice(0, stage === 1 ? 3 : 5),
      fallback: true,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;