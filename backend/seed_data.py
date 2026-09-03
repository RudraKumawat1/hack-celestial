import json
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

with open("data/seed_venues.json", "r") as f:
    venues = json.load(f)

response = supabase.table("venues").insert(venues).execute()
print(f"Inserted {len(response.data)} venues successfully.")
