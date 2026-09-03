from fastapi import FastAPI
from dotenv import load_dotenv
from supabase import create_client
from google import genai
import requests
import os

load_dotenv()

app = FastAPI()

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