from fastapi import FastAPI
from osm_service import geocode_city, fetch_osm_venues, reverse_geocode
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
    allow_origins=["http://localhost:5173", "http://localhost:5174", "*"],
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

@app.get("/reverse-geocode")
def get_reverse_geocode(lat: float, lon: float):
    city = reverse_geocode(lat, lon)
    return {"city": city or "Unknown"}


@app.get("/venues-live")
def venues_live(city: str = "Mumbai"):
    location = geocode_city(city)
    if not location:
        return {"error": f"Could not find location for '{city}'"}
    lat, lon = location
    venues = fetch_osm_venues(lat, lon)
    return {"city": city, "count": len(venues), "venues": venues}


@app.get("/compose-itinerary-live")
def compose_itinerary_live(
    city: str = "Mumbai",
    minutes: int = 120,
    budget: int = 1000,
    vibes: str = "",
    categories: str = "",
    group_type: str = "solo"
):
    location = geocode_city(city)
    if not location:
        return {"error": f"Could not find location for '{city}'"}
    lat, lon = location
    all_venues = fetch_osm_venues(lat, lon)

    preferred_vibes = [v.strip() for v in vibes.split(",") if v.strip()]
    preferred_categories = [c.strip() for c in categories.split(",") if c.strip()]

    result = compose_itinerary(
        venues=all_venues,
        available_minutes=minutes,
        budget=budget,
        preferred_vibes=preferred_vibes,
        preferred_categories=preferred_categories,
        group_type=group_type,
    )
    result["city"] = city
    result["group_type"] = group_type
    return result


@app.get("/replan-itinerary-live")
def replan_itinerary_live(
    city: str = "Mumbai",
    minutes: int = 120,
    budget: int = 1000,
    vibes: str = "",
    categories: str = "",
    exclude_id: str = "",
    exclude_ids: str = "",
    group_type: str = "solo"
):
    location = geocode_city(city)
    if not location:
        return {"error": f"Could not find location for '{city}'"}
    lat, lon = location
    all_venues = fetch_osm_venues(lat, lon)

    preferred_vibes = [v.strip() for v in vibes.split(",") if v.strip()]
    preferred_categories = [c.strip() for c in categories.split(",") if c.strip()]
    
    # Handle single or comma-separated exclude IDs
    to_exclude = set()
    if exclude_id:
        to_exclude.add(exclude_id.strip())
    if exclude_ids:
        for eid in exclude_ids.split(","):
            if eid.strip():
                to_exclude.add(eid.strip())

    result = compose_itinerary(
        venues=all_venues,
        available_minutes=minutes,
        budget=budget,
        preferred_vibes=preferred_vibes,
        preferred_categories=preferred_categories,
        exclude_ids=to_exclude,
        group_type=group_type,
    )
    result["city"] = city
    result["group_type"] = group_type
    return result


@app.post("/ai-insights")
def generate_ai_insights(payload: dict):
    """
    Calls Gemini to generate a personalized local guide narrative,
    insider tips for each stop, and transportation advice.
    """
    city = payload.get("city", "the city")
    stops = payload.get("stops", [])
    group_type = payload.get("group_type", "traveler")
    vibes = payload.get("vibes", "local")

    if not stops:
        return {"insights": "No stops available to generate insights."}

    stop_names = ", ".join([s.get("name", "stop") for s in stops])

    prompt = f"""
You are a witty, knowledgeable local travel concierge in {city}.
A {group_type} traveler has created an itinerary with vibes '{vibes}' visiting: {stop_names}.

Provide:
1. 🌟 "Vibe Check & Story": A short 2-3 sentence engaging summary of why this flow is special.
2. 💡 "Insider Pro-Tips": 1 bullet point insider secret for each stop (e.g. what to look for, famous snack nearby, best photo angle, or etiquette).
3. 🚇 "Transit Tip": 1 quick practical advice for getting between these spots (e.g. walking, metro, auto).

Keep it punchy, practical, and exciting for a traveler. Max 180 words.
"""
    try:
        # Try gemini models in order of availability
        for model_name in ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"]:
            try:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                if response and response.text:
                    return {"insights": response.text.strip()}
            except Exception:
                continue
        # Fallback if AI call didn't succeed
        return {
            "insights": f"🌟 **Curator's Note for {city}**: This route is crafted for a {group_type} exploring with a {vibes} vibe. Expect an authentic balance between historic charm and local pace. Pro-tip: Keep small cash handy for local street bites and auto-rickshaws!"
        }
    except Exception as e:
        return {
            "insights": f"🌟 **Curator's Note for {city}**: This route is crafted for a {group_type} exploring with a {vibes} vibe. Keep small cash handy and enjoy the journey!"
        }