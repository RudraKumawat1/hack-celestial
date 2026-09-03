from fastapi import FastAPI
from itinerary_engine import compose_itinerary
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
from google import genai
import requests
import os

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

places_api_key = os.environ.get("GOOGLE_PLACES_API_KEY")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/test-db")
def test_db():
    response = supabase.table("venues").select("*").execute()
    return {"venues": response.data}

@app.get("/test-gemini")
def test_gemini():
    response = gemini_client.models.generate_content(
        model="gemini-3.6-flash",
        contents="Say hello in exactly 5 words."
    )
    return {"gemini_says": response.text}

@app.get("/test-places")
def test_places():
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": "cafes in Mumbai",
        "key": places_api_key
    }
    response = requests.get(url, params=params)
    return response.json()

@app.get("/venues")
def get_venues():
    response = supabase.table("venues").select("*").execute()
    return response.data

@app.get("/compose-itinerary")
def get_itinerary(
    minutes: int = 120,
    budget: int = 1000,
    vibes: str = "",
    categories: str = ""
):
    response = supabase.table("venues").select("*").execute()
    all_venues = response.data

    preferred_vibes = [v.strip() for v in vibes.split(",") if v.strip()]
    preferred_categories = [c.strip() for c in categories.split(",") if c.strip()]

    result = compose_itinerary(
        venues=all_venues,
        available_minutes=minutes,
        budget=budget,
        preferred_vibes=preferred_vibes,
        preferred_categories=preferred_categories,
    )
    return result

@app.get("/replan-itinerary")
def replan_itinerary(
    minutes: int = 120,
    budget: int = 1000,
    vibes: str = "",
    categories: str = "",
    exclude_id: str = ""
):
    response = supabase.table("venues").select("*").execute()
    all_venues = response.data

    preferred_vibes = [v.strip() for v in vibes.split(",") if v.strip()]
    preferred_categories = [c.strip() for c in categories.split(",") if c.strip()]
    exclude_ids = {exclude_id} if exclude_id else set()

    result = compose_itinerary(
        venues=all_venues,
        available_minutes=minutes,
        budget=budget,
        preferred_vibes=preferred_vibes,
        preferred_categories=preferred_categories,
        exclude_ids=exclude_ids,
    )
    return result