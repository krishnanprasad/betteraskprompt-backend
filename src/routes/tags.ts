import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const router = express.Router();
const isDevelopment = process.env.NODE_ENV !== 'production';

const apiKey = process.env.GEMINI_API_SECRET;
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Fallback/Static data for when AI fails or is unavailable
// This mirrors the frontend structure for consistency
const FALLBACK_TAGS: Record<string, Record<string, string[]>> = {
  'Teacher': {
    'Generate Questions': ['Multiple Choice', 'Critical Thinking', 'Real-world Application', 'Bloom\'s Taxonomy', 'Answer Key'],
    'Create Explanation': ['Step-by-step', 'Visual Aids', 'Real-life Examples', 'Common Misconceptions', 'Interactive Elements'],
    'Simplify Weak': ['Core Concepts', 'Visual Analogies', 'Practice Problems', 'Confidence Building', 'Step-by-step Guide'],
    'Use Analogy': ['Everyday Life', 'Sports', 'Cooking', 'Nature', 'Technology'],
    'Latest Research': ['Key Findings', 'Methodology', 'Implications', 'Summary', 'Citations']
  },
  'Parents': {
    'Help Homework': ['Step-by-step', 'Don\'t Solve Directly', 'Guiding Questions', 'Encouragement', 'Check Understanding'],
    'Help Project': ['Brainstorming', 'Materials List', 'Timeline', 'Creative Ideas', 'Safety Tips'],
    'Explain Simply': ['EL5', 'Real-world Examples', 'No Jargon', 'Visuals', 'Fun Facts'],
    'Find Resources': ['Videos', 'Articles', 'Games', 'Books', 'Worksheets'],
    'Play & Learn': ['Educational Games', 'Outdoor Activities', 'DIY Crafts', 'Science Experiments', 'Storytelling']
  },
  'Students': {
    'Homework Help': ['Explain Concept', 'Hint', 'Similar Example', 'Step-by-step', 'Check Answer'],
    'Project Ideas': ['Creative', 'Feasible', 'Unique', 'Science Fair', 'Artistic'],
    'Learn Concept': ['Deep Dive', 'Summary', 'Key Points', 'Quiz Me', 'Examples'],
    'Exam Prep': ['Practice Questions', 'Flashcards', 'Summary Sheet', 'Time Management', 'Key Formulas'],
    'Clear Doubt': ['Simple Explanation', 'Analogy', 'Example', 'Diagram Description', 'Why/How']
  }
};

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

  // 2. Fallback if no API key
  if (!genAI) {
    if (isDevelopment) console.warn('⚠️ Gemini API not configured');
    return res.json({ success: false, tags: [], fallback: true, message: 'Gemini API not configured' });
  }

  try {
    // 3. Construct Prompt
    const count = stage === 1 ? 3 : 5;
    const existingTags = [...new Set([...selectedTags, ...visibleTags])];
    
    const systemInstruction = `You are an expert educational prompt engineer. Your task is to generate "Smart Tags" - short, action-oriented suggestions that help a user refine their prompt.
    
    Constraints:
    1. Each tag must be exactly 3 to 4 words long.
    2. Each tag must start with a strong verb (e.g., Include, Add, Explain, Give, Use, Make, Provide, Compare, Highlight).
    3. Tags must be safe for students and appropriate for a school setting.
    4. Do NOT duplicate any of these existing tags: ${existingTags.join(', ')}.
    5. Return exactly ${count} tags.
    `;

    const userPrompt = `Generate ${count} smart tags for a prompt about "${topic}".
    Persona: ${persona}
    Intent: ${intent}
    Stage: ${stage} (1 = Initial suggestions, 2 = Follow-up suggestions)`;

    // 4. Define Schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of generated smart tags"
        }
      },
      required: ["tags"]
    };

    // 5. Call Gemini
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.7
      }
    });

    // 6. Parse Response
    const responseText = (result as any).text?.() ?? (result as any).text ?? '';
    const data = JSON.parse(responseText);
    let generatedTags: string[] = data.tags || [];

    if (isDevelopment) {
      console.log('   Raw Tags:', generatedTags);
    }

    // 7. Validate Tags (Word count & Verb check)
    generatedTags = generatedTags.filter(tag => {
      const words = tag.trim().split(/\s+/);
      const wordCount = words.length;
      // Check word count (3-4)
      if (wordCount < 3 || wordCount > 4) return false;
      return true;
    });

    if (generatedTags.length === 0) {
       throw new Error('No valid tags generated after validation');
    }

    // Limit to requested count
    const finalTags = generatedTags.slice(0, count);

    res.json({
      success: true,
      tags: finalTags,
      fallback: false
    });

  } catch (error) {
    console.error('Gemini Tag Generation Error:', error);
    res.json({
      success: false,
      tags: [],
      fallback: true,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
