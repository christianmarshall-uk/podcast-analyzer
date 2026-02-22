# Podcast Analyzer

A web application that analyzes podcasts from RSS feeds, transcribes the audio using OpenAI Whisper, and generates AI-powered summaries and cross-episode insights using Claude.

## Features

### Core Features
- Add podcasts via RSS feed URL
- Automatic episode extraction with GUID tracking
- Audio transcription using OpenAI Whisper API
- AI-powered structured analysis using Claude API

### Scheduled Updates
- **Automatic RSS Refresh**: Checks all feeds every 4 hours for new episodes
- Manual refresh option available in the UI
- Track last checked time for each podcast

### Structured Episode Analysis
Each analyzed episode includes:
- **Overview**: Brief summary of the episode
- **Key Points**: Main points discussed (5-10 bullet points)
- **Themes**: Key themes identified across the content
- **Predictions**: Future predictions mentioned
- **Recommendations**: Actionable recommendations for listeners
- **Key Advice**: Important pieces of advice given
- **Notable Quotes**: Memorable quotes from the episode

### Digest Reports
Generate cross-episode analysis for any time period:
- **Time Periods**: Latest, daily, weekly, monthly, or custom date range
- **Common Themes**: Themes appearing across multiple episodes
- **Trends**: Identified trends with direction indicators
- **Aggregated Predictions**: Synthesized predictions from multiple sources
- **Action Items**: Specific steps to take based on all content
- **AI-Generated Art**: Monet-style impressionist image representing key themes

### Batch Analysis
- Analyze all episodes in a time period at once
- Filter by specific podcasts
- Track analysis progress

## Prerequisites

- Python 3.11+
- Node.js 18+
- OpenAI API key (for Whisper transcription and DALL-E image generation)
- Anthropic API key (for Claude summarization)

## Setup

### Backend

1. Navigate to the backend directory:
   ```bash
   cd podcast-analyzer/backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

6. Start the backend server:
   ```bash
   uvicorn app.main:app --reload
   ```

   The API will be available at http://localhost:8000

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd podcast-analyzer/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The app will be available at http://localhost:5173

## Usage

### Adding Podcasts
1. Open http://localhost:5173
2. Enter a podcast RSS feed URL
3. Click "Add Podcast"
4. The system will automatically check for new episodes every 4 hours

### Analyzing Episodes
1. Click on a podcast to see its episodes
2. Select an episode and click "Analyze Episode"
3. Wait for transcription and analysis to complete
4. View structured analysis with themes, predictions, and recommendations

### Creating Digests
1. Go to the "Digests" page
2. Select a time period (latest, day, week, month)
3. Optionally filter by specific podcasts
4. Click "Create Digest"
5. View cross-episode insights with trends and action items
6. Each digest includes a generated Monet-style image representing the key themes

## API Endpoints

### Podcasts
- `POST /api/podcasts/feed` - Add a podcast from RSS feed
- `GET /api/podcasts` - List all podcasts
- `GET /api/podcasts/{id}` - Get podcast details with episodes
- `PATCH /api/podcasts/{id}` - Update podcast settings
- `DELETE /api/podcasts/{id}` - Delete a podcast
- `POST /api/podcasts/{id}/refresh` - Refresh feed for new episodes

### Analysis
- `POST /api/podcasts/{podcast_id}/episodes/{episode_id}/analyze` - Analyze an episode
- `POST /api/analysis/batch` - Batch analyze episodes by time period
- `GET /api/episodes/{id}/summary` - Get episode summary
- `GET /api/episodes/{id}/analysis` - Get structured analysis
- `GET /api/episodes/{id}/status` - Get analysis status
- `GET /api/episodes` - List episodes with filters

### Digests
- `POST /api/digests` - Create a new digest
- `GET /api/digests` - List all digests
- `GET /api/digests/{id}` - Get digest with full analysis
- `DELETE /api/digests/{id}` - Delete a digest

### Scheduler
- `GET /api/scheduler/status` - Get scheduler status
- `POST /api/scheduler/refresh` - Manually trigger feed refresh

## Project Structure

```
podcast-analyzer/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app with scheduler
│   │   ├── config.py            # Settings and env vars
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── database.py          # DB connection
│   │   ├── routers/
│   │   │   ├── podcasts.py      # Podcast CRUD endpoints
│   │   │   ├── analysis.py      # Analysis endpoints
│   │   │   └── digests.py       # Digest endpoints
│   │   └── services/
│   │       ├── feed_parser.py   # RSS feed parsing
│   │       ├── audio.py         # Audio download
│   │       ├── transcription.py # Whisper API
│   │       ├── summarizer.py    # Claude API (structured)
│   │       ├── digest.py        # Cross-episode analysis
│   │       └── scheduler.py     # APScheduler service
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── PodcastForm.jsx
│   │   │   ├── PodcastList.jsx
│   │   │   ├── SummaryView.jsx
│   │   │   ├── DigestCard.jsx
│   │   │   ├── DigestView.jsx
│   │   │   ├── BatchAnalysisForm.jsx
│   │   │   └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── PodcastDetail.jsx
│   │   │   ├── Digests.jsx
│   │   │   └── DigestDetail.jsx
│   │   └── api/
│   │       └── client.js
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite, APScheduler
- **Frontend**: React, Vite, Tailwind CSS
- **APIs**: OpenAI Whisper, OpenAI DALL-E, Anthropic Claude

## Database Schema

### Tables
- **podcasts**: Podcast metadata and feed URL
- **episodes**: Episode data with transcripts and status
- **episode_analyses**: Structured analysis results (themes, predictions, etc.)
- **digests**: Cross-episode analysis reports
- **digest_episodes**: Links digests to included episodes

## Notes

- Audio files are limited to 25MB (Whisper API limit)
- Long transcripts are automatically chunked for analysis
- Analysis runs in the background; the UI polls for status updates
- RSS feeds are checked every 4 hours automatically
- Digest images are generated using DALL-E 3 with a Monet impressionist style
