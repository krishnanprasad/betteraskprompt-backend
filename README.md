# BetterAskPrompt Backend API

Express.js backend API for the EdPicker Prompt Engineering Coach application. This service analyzes student prompts using Google's Gemini AI and provides detailed feedback and improvements.

## Features

- ✅ Prompt analysis using Gemini 2.5 Flash
- ✅ Detailed error handling with environment-aware logging
- ✅ CORS support for frontend integration
- ✅ Health check endpoint
- ✅ Production-ready with GCP deployment support

## Local Development

### Prerequisites
- Node.js 18+
- Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your Gemini API key to `.env`:
```
GEMINI_API_SECRET=your-api-key-here
PORT=3001
NODE_ENV=development
```

4. Run development server:
```bash
npm run dev
```

Server runs on `http://localhost:3001`

## API Endpoints

### `GET /health`
Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-11T04:30:00.000Z",
  "version": "1.0.0"
}
```

### `POST /api/gemini/analyze`
Analyze a student prompt and get feedback.

**Request:**
```json
{
  "studentPrompt": "Explain photosynthesis"
}
```

**Response:**
```json
{
  "score": 75,
  "feedback": "Your prompt is clear but could be more specific...",
  "improvedPrompt": {
    "role": "Act as a biology teacher",
    "context": "Teaching high school students",
    "task": "Explain photosynthesis",
    "format": "Step-by-step explanation with diagrams",
    "tone": "Educational and encouraging",
    "persona": "Experienced educator",
    "exemplars": ["Use real-world examples like plants in a garden"]
  }
}
```

## Deployment

### Google Cloud Platform (Cloud Run)

1. Install Google Cloud CLI
2. Login and set project:
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

3. Create secret for API key:
```bash
echo -n "your-api-key" | gcloud secrets create GEMINI_API_SECRET --data-file=-
```

4. Deploy:
```bash
npm run deploy:cloudrun
```

### Google Cloud Platform (App Engine)

```bash
npm run deploy:gcp
```

## Environment Variables

- `GEMINI_API_SECRET` - Your Gemini API key (required)
- `PORT` - Server port (default: 8080 for GCP, 3001 for local)
- `NODE_ENV` - Environment mode (`development` or `production`)

## Error Handling

The API provides detailed error messages in development and secure messages in production:

- **400** - Invalid request (missing or invalid prompt)
- **401** - Authentication failed (invalid API key)
- **429** - Rate limit exceeded
- **403** - Model access denied
- **500** - Internal server error
- **503** - Service unavailable (network issues)

## Security

- ⚠️ Never commit `.env` files
- ✅ Use GCP Secret Manager for production
- ✅ API key is validated on startup
- ✅ CORS configured for allowed origins only

## License

MIT
