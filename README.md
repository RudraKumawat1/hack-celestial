# Hack Celestial 3.0 — Local Discovery & Experience Platform

An intelligent local discovery platform that composes personalized micro-itineraries based on a traveler's time, budget, group type, and location — instead of just listing places.

## Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** FastAPI (Python)
- **Database:** Supabase (PostgreSQL)
- **AI:** Google Gemini API

## Getting Started (for teammates)

### 1. Clone the repo

git clone https://github.com/RudraKumawat1/hack-celestial.git
cd hack-celestial


### 2. Backend setup

cd backend
python -m venv venv
venv\Scripts\Activate.ps1 (Windows PowerShell)
pip install fastapi uvicorn python-dotenv supabase google-genai requests


Ask Rudra for the `.env` file contents (not committed to git for security) — create a file named `.env` inside `backend/` with:

SUPABASE_URL=...
SUPABASE_KEY=...
GEMINI_API_KEY=...
GOOGLE_PLACES_API_KEY=...


Run the backend:

uvicorn main:app --reload

Confirm at `http://127.0.0.1:8000/health` → should show `{"status":"ok"}`

### 3. Frontend setup

cd frontend
npm install
npm run dev

Confirm at `http://localhost:5173`

## Project Structure

hack-celestial/
├── backend/
│ ├── main.py # FastAPI app + routes
│ ├── seed_data.py # Script to load venue data into Supabase
│ └── data/
│ └── seed_venues.json
└── frontend/
└── src/ # React app


## Current Status
- ✅ Backend connected to Supabase + Gemini
- ✅ Frontend scaffolded with Tailwind
- 🔲 Frontend ↔ backend connection
- 🔲 Itinerary composer algorithm