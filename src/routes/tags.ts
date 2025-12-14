import express from 'express';

const router = express.Router();

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

router.post('/generate', async (req, res) => {
  try {
    const { topic, intent, persona, stage, selectedTags, avoidDuplicates, detected } = req.body;

    // TODO: Integrate actual Gemini AI call here
    // For now, we return the robust fallback data to satisfy the contract
    
    // Simulate AI processing delay
    // await new Promise(resolve => setTimeout(resolve, 500));

    const tags = FALLBACK_TAGS[persona]?.[intent] || [];
    
    // If stage 2, we might filter or adjust based on selectedTags if we had dynamic AI
    // For static fallback, we return the full set and let frontend handle display logic

    res.json({
      success: true,
      tags: tags,
      metadata: {
        source: 'fallback', // or 'ai'
        stage: stage,
        processingTime: 0
      },
      fallback: true, // Explicitly signal this is fallback data
      message: 'Generated using fallback logic'
    });

  } catch (error) {
    console.error('Tag generation error:', error);
    res.status(500).json({
      success: false,
      tags: [],
      metadata: {},
      fallback: true,
      message: 'Internal server error, using fallback'
    });
  }
});

export default router;
