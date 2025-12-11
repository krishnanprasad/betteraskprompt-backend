import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import geminiRouter from './routes/gemini.js';

const app = express();
const PORT = process.env.PORT || 8080; // GCP uses PORT env variable
const isDev = process.env.NODE_ENV !== 'production';

// CORS configuration
app.use(cors({
  origin: isDev 
    ? ['http://localhost:4201', 'http://localhost:4200']
    : [
        'https://krishnanprasad.github.io',
        'https://yourdomain.com' // Add your production frontend URL
      ],
  credentials: true
}));

app.use(express.json());

// Health check endpoint for GCP
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/gemini', geminiRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'BetterAskPrompt Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      analyze: '/api/gemini/analyze'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  if (isDev) {
    console.log(`   API endpoint: http://localhost:${PORT}/api/gemini/analyze`);
  }
});
