import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const router = express.Router();
const isDevelopment = process.env.NODE_ENV !== 'production';

const apiKey = process.env.GEMINI_API_SECRET;
if (!apiKey) {
  console.error('GEMINI_API_SECRET not set. The server will not be able to process analyze requests.');
}
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

const schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER, description: "A score from 0-100 evaluating the prompt's quality." },
    feedback: { type: Type.STRING, description: "Constructive feedback explaining the score and suggesting areas for improvement." },
    improvedPrompt: {
      type: Type.OBJECT,
      description: "A structured, improved version of the student's prompt.",
      properties: {
        role: { type: Type.STRING },
        context: { type: Type.STRING },
        task: { type: Type.STRING },
        exemplars: { type: Type.ARRAY, items: { type: Type.STRING } },
        persona: { type: Type.STRING },
        format: { type: Type.STRING },
        tone: { type: Type.STRING },
      },
      required: ["task"]
    }
  },
  required: ["score", "feedback", "improvedPrompt"]
};

router.post('/analyze', async (req: Request, res: Response) => {
  // Development-only: Log incoming request
  if (isDevelopment) {
    console.log('\n📥 [INCOMING REQUEST] /api/gemini/analyze');
    console.log('   Request body:', JSON.stringify(req.body, null, 2));
    console.log('   Timestamp:', new Date().toISOString());
  }
  
  const { studentPrompt } = req.body;
  
  // Validation: Empty or invalid prompt
  if (!studentPrompt || typeof studentPrompt !== 'string' || studentPrompt.trim() === '') {
    const errorMsg = 'studentPrompt is required and must be a non-empty string';
    if (isDevelopment) {
      console.error('\n❌ [VALIDATION ERROR]');
      console.error('   Reason:', errorMsg);
      console.error('   Received value:', studentPrompt);
      console.error('   Type:', typeof studentPrompt);
    }
    return res.status(400).json({ error: errorMsg });
  }

  // Configuration check: API key missing
  if (!genAI) {
    const errorMsg = 'Gemini API is not configured. Please set GEMINI_API_SECRET in .env file.';
    if (isDevelopment) {
      console.error('\n❌ [CONFIGURATION ERROR]');
      console.error('   Reason: API key not found');
      console.error('   Environment variable: GEMINI_API_SECRET');
      console.error('   Current value:', apiKey ? '[SET]' : '[NOT SET]');
    } else {
      console.error('Gemini API key not configured');
    }
    return res.status(500).json({ error: 'Service temporarily unavailable. Please contact support.' });
  }

  if (isDevelopment) {
    console.log('\n🔑 [CONFIGURATION CHECK]');
    console.log('   API Key status: CONFIGURED');
    console.log('   API Key length:', apiKey?.length || 0);
    console.log('   API Key prefix:', apiKey?.substring(0, 10) + '...');
    console.log('\n🤖 [CALLING GEMINI API]');
    console.log('   Model: gemini-2.5-flash');
    console.log('   Prompt length:', studentPrompt.length, 'characters');
  }

  try {
    const systemInstruction = `You are an expert prompt engineering coach for high school and college students. Your goal is to analyze a student's prompt and help them improve it for better results from AI models. Evaluate the provided prompt on a scale of 0 to 100 based on its clarity, context, specificity, and inclusion of key elements like role, format, and tone. A score of 0 is a very poor, vague prompt, while 100 is a perfect, highly-detailed prompt. Provide constructive feedback and generate an improved version of the prompt, breaking it down into its core components (role, context, task, etc.). Your response must be a single, valid JSON object.`;

    const startTime = Date.now();
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Please analyze this student's prompt: "${studentPrompt}"`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const apiResponseTime = Date.now() - startTime;

    if (isDevelopment) {
      console.log('\n✅ [GEMINI API RESPONSE]');
      console.log('   Response time:', apiResponseTime, 'ms');
      console.log('   Response received: SUCCESS');
    }

    // Safely extract text from Gemini response (SDK exposes text as a getter string)
    const rawText = (response as any)?.text ?? '';

    const jsonText = (rawText || '').trim();

    if (isDevelopment) {
      console.log('\n📄 [PARSING RESPONSE]');
      console.log('   Response text length:', jsonText.length, 'characters');
      console.log('   First 100 chars:', jsonText.substring(0, 100));
    }

    if (!jsonText) {
      throw new Error('Empty response from Gemini API');
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonText);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse Gemini response as JSON: ${parseErr.message}`);
    }
    
    if (isDevelopment) {
      console.log('   JSON parsing: SUCCESS');
      console.log('   Response keys:', Object.keys(parsedResponse));
      console.log('   Score:', parsedResponse.score);
    }

    const improvedPrompt = parsedResponse.improvedPrompt || {};

    const output = {
      ...parsedResponse,
      improvedPrompt: {
        role: improvedPrompt.role || null,
        context: improvedPrompt.context || null,
        task: improvedPrompt.task || studentPrompt,
        exemplars: improvedPrompt.exemplars || null,
        persona: improvedPrompt.persona || null,
        format: improvedPrompt.format || null,
        tone: improvedPrompt.tone || null,
      }
    };

    if (isDevelopment) {
      console.log('\n✅ [SUCCESS - SENDING RESPONSE]');
      console.log('   Score:', output.score);
      console.log('   Feedback length:', output.feedback?.length || 0, 'characters');
      console.log('   Improved prompt components:', Object.keys(output.improvedPrompt).filter(k => output.improvedPrompt[k]).join(', '));
      console.log('   Total processing time:', Date.now() - startTime, 'ms');
      console.log('─────────────────────────────────────────\n');
    }
    
    res.json(output);
  } catch (error: any) {
    // Development: Detailed error logging
    if (isDevelopment) {
      console.error('\n❌ [ERROR OCCURRED]');
      console.error('   Error Type:', error.name || 'Unknown');
      console.error('   Error Message:', error.message || 'No message');
      console.error('   Error Code:', error.code || 'No code');
      console.error('   Status Code:', error.status || error.statusCode || 'N/A');
      
      // Check for specific error properties from Gemini API
      if (error.response) {
        console.error('   API Response:', JSON.stringify(error.response, null, 2));
      }
      if (error.data) {
        console.error('   Error Data:', JSON.stringify(error.data, null, 2));
      }
      
      console.error('\n   Stack Trace:');
      console.error(error.stack);
      console.error('─────────────────────────────────────────\n');
    } else {
      // Production: Minimal logging (no sensitive data)
      console.error('[ERROR]', error.name || 'Unknown error', 'at', new Date().toISOString());
    }
    
    // Check for API key issues
    if (error.message?.includes('API key') || error.message?.includes('401') || error.status === 401) {
      if (isDevelopment) {
        console.error('\n🔴 [DIAGNOSIS] Invalid or expired API key');
        console.error('   Action required: Verify GEMINI_API_SECRET in .env file');
        console.error('   Get a new key from: https://aistudio.google.com/apikey');
      }
      return res.status(401).json({ 
        error: isDevelopment 
          ? 'Invalid or expired API key. Check console for details.'
          : 'Authentication failed. Please contact support.',
        ...(isDevelopment && { details: error.message })
      });
    }
    
    // Check for quota/rate limit issues
    if (error.message?.includes('quota') || error.message?.includes('rate limit') || 
        error.message?.includes('429') || error.status === 429) {
      if (isDevelopment) {
        console.error('\n🔴 [DIAGNOSIS] API quota exceeded or rate limited');
        console.error('   Action required: Wait before retrying or upgrade API plan');
        console.error('   Check quota: https://console.cloud.google.com/apis/dashboard');
      }
      return res.status(429).json({ 
        error: 'API quota exceeded. Please try again later.',
        ...(isDevelopment && { 
          details: error.message,
          retryAfter: '60 seconds recommended'
        })
      });
    }
    
    // Check for model/permission issues
    if (error.message?.includes('model') || error.message?.includes('permission') || error.status === 403) {
      if (isDevelopment) {
        console.error('\n🔴 [DIAGNOSIS] Model access or permission issue');
        console.error('   Action required: Verify model name and API permissions');
        console.error('   Current model: gemini-2.5-flash');
      }
      return res.status(403).json({ 
        error: isDevelopment 
          ? 'Model access denied. Check if gemini-2.5-flash is available for your API key.'
          : 'Service access denied. Please contact support.',
        ...(isDevelopment && { details: error.message })
      });
    }
    
    // Network or connectivity issues
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      if (isDevelopment) {
        console.error('\n🔴 [DIAGNOSIS] Network connectivity issue');
        console.error('   Action required: Check internet connection');
        console.error('   Error code:', error.code);
      }
      return res.status(503).json({ 
        error: 'Unable to reach Gemini API. Please check your internet connection.',
        ...(isDevelopment && { details: error.message, code: error.code })
      });
    }
    
    // Generic server error
    if (isDevelopment) {
      console.error('\n🔴 [DIAGNOSIS] Unhandled error type');
      console.error('   Action required: Review error details above');
    }
    
    res.status(500).json({ 
      error: isDevelopment 
        ? 'Failed to analyze prompt. Check server console for detailed error.'
        : 'An internal error occurred. Please try again later.',
      ...(isDevelopment && { 
        details: error.message,
        type: error.name,
        code: error.code
      })
    });
  }
});

// Smart Tags endpoint for Smart Tag Prompt Builder
router.post('/smart-tags', async (req: Request, res: Response) => {
  const { intent, topic } = req.body;
  
  if (isDevelopment) {
    console.log('\n📥 [INCOMING REQUEST] /api/gemini/smart-tags');
    console.log('   Intent:', intent);
    console.log('   Topic:', topic);
  }
  
  if (!intent || !topic) {
    return res.status(400).json({ error: 'intent and topic are required' });
  }
  
  if (!genAI) {
    return res.status(500).json({ error: 'Service temporarily unavailable.' });
  }
  
  try {
    const systemInstruction = `You are an AI assistant helping students (Class 6-12) and teachers build effective AI prompts. Based on the user's intent and topic, generate smart tags across 5 categories: Role, Context, Output, Tone, and Thinking. Each category should have 3-5 relevant, actionable tag suggestions. Return the response as a JSON array of tag objects.`;
    
    const prompt = `Intent: ${intent}\nTopic: ${topic}\n\nGenerate smart tags for building an effective AI prompt.`;
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        tags: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: "One of: Role, Context, Output, Tone, Thinking" },
              value: { type: Type.STRING, description: "The tag text" },
              description: { type: Type.STRING, description: "Optional brief description" }
            },
            required: ["category", "value"]
          }
        }
      },
      required: ["tags"]
    };
    
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    
    const jsonText = (response.text || '').trim();
    const parsedResponse = JSON.parse(jsonText);
    
    if (isDevelopment) {
      console.log('✅ Generated', parsedResponse.tags?.length || 0, 'smart tags');
    }
    
    res.json(parsedResponse);
  } catch (error: any) {
    if (isDevelopment) {
      console.error('❌ Error generating smart tags:', error.message);
    }
    res.status(500).json({ error: 'Failed to generate smart tags' });
  }
});

// POST /api/tags/generate - Generate smart tags with fallback data
router.post('/tags/generate', async (req: Request, res: Response) => {
  const { topic, intent, detected } = req.body;
  
  if (isDevelopment) {
    console.log('\n📥 [INCOMING REQUEST] /api/tags/generate');
    console.log('   Topic:', topic);
    console.log('   Intent:', intent);
    console.log('   Detected:', detected);
  }
  
  if (!topic || !intent) {
    return res.status(400).json({ 
      success: false, 
      message: 'topic and intent are required' 
    });
  }
  
  // Fallback/stub tags for now
  const fallbackTags = {
    role: [
      'Act as a teacher explaining to a student',
      'Act as a study partner',
      'Act as an expert tutor',
      'Act as a subject specialist'
    ],
    context: [
      `Student in class ${detected?.class || '10'}`,
      `${detected?.board || 'CBSE'} curriculum`,
      `Subject: ${detected?.subject || 'General'}`,
      'Preparing for exams'
    ],
    output: [
      'Explain in simple terms',
      'Provide step-by-step solution',
      'Give examples with diagrams',
      'Summarize key points in bullet form',
      'Create a mind map'
    ],
    tone: [
      'Friendly and encouraging',
      'Clear and concise',
      'Patient and supportive',
      'Enthusiastic and motivating'
    ],
    thinking: [
      'Break down complex concepts',
      'Use real-world examples',
      'Connect to previous knowledge',
      'Highlight common mistakes',
      'Provide memory tricks'
    ]
  };
  
  if (isDevelopment) {
    console.log('✅ Returning fallback tags (real Gemini integration pending)');
  }
  
  res.json({
    success: true,
    tags: fallbackTags,
    metadata: detected || {},
    fallback: true,
    message: 'Using fallback tags. Gemini integration pending.'
  });
});

// POST /api/prompt/generate - Generate final prompt from selected tags
router.post('/prompt/generate', async (req: Request, res: Response) => {
  const { topic, selectedTags, intent } = req.body;
  
  if (isDevelopment) {
    console.log('\n📥 [INCOMING REQUEST] /api/prompt/generate');
    console.log('   Topic:', topic);
    console.log('   Intent:', intent);
    console.log('   Selected tags:', selectedTags?.length || 0);
  }
  
  if (!topic || !selectedTags || !intent) {
    return res.status(400).json({ 
      success: false, 
      message: 'topic, selectedTags, and intent are required' 
    });
  }
  
  // Build prompt from selected tags
  const intentMap: Record<string, string> = {
    learn: 'I want to learn about',
    test: 'I am preparing for a test on',
    revise: 'I want to revise',
    doubt: 'I have a doubt regarding'
  };
  
  const intentPrefix = intentMap[intent] || 'I want to understand';
  
  const prompt = `${intentPrefix} "${topic}".

${selectedTags.join('\n')}

Please help me accordingly.`;
  
  if (isDevelopment) {
    console.log('✅ Generated prompt length:', prompt.length);
  }
  
  res.json({
    success: true,
    prompt
  });
});

export default router;
