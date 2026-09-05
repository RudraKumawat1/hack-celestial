import requests
import math

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

HEADERS = {"User-Agent": "CelestialDiscoveryPlatform/2.0 (contact@celestialdiscovery.org)"}

CATEGORY_MAP = {
    "cafe": "food", "restaurant": "food", "fast_food": "food", "bar": "food", "pub": "food",
    "ice_cream": "food", "food_court": "food", "street_vendor": "food",
    "bakery": "food", "confectionery": "food", "pastry": "food", "deli": "food", "spices": "shopping",
    "museum": "culture", "gallery": "culture", "place_of_worship": "culture", "monastery": "culture",
    "attraction": "landmark", "viewpoint": "landmark", "monument": "landmark", "memorial": "landmark",
    "park": "nature", "garden": "nature",
    "marketplace": "shopping", "mall": "shopping", "bazaar": "shopping", "kiosk": "shopping",
}

DURATION_DEFAULTS = {
    "food": 35, "culture": 40, "landmark": 25, "nature": 35, "shopping": 40
}

PRICE_DEFAULTS = {
    "food": 1, "culture": 1, "landmark": 0, "nature": 0, "shopping": 1
}

FOOD_KEYWORDS = [
    "chaat", "sweet", "mithai", "dhaba", "kebab", "biryani", "paratha", "jalebi", "kulfi",
    "falooda", "kachori", "samosa", "chole", "kulcha", "bhature", "dosa", "idli", "vada",
    "pav", "bhel", "pani puri", "tea", "chai", "lassi", "bakery", "rolls", "tikki", "street food",
    "eatery", "tiffin", "bhandar", "corner", "kitchen"
]

# Curated catalog of legendary, iconic local street food & discovery shops across major cities
VERIFIED_LOCAL_GEMS = [
    # Delhi Iconic Street Food & Heritage
    {
        "id": "del-food-01", "city": "Delhi", "name": "Old Famous Jalebi Wala (Since 1884)",
        "category": "food", "lat": 28.6560, "lng": 77.2312, "price_level": 1, "duration_minutes": 25,
        "vibe_tags": ["authentic", "street-food", "heritage", "local"],
        "opening_hours": "08:00 - 22:00",
        "notes": "Fried in pure desi ghee over charcoal, served piping hot with thick condensed rabri. A Chandni Chowk legend for over 140 years.",
        "signature_item": "Desi Ghee Jalebi with Thick Rabri",
        "transit_tips": "Nearest Metro: Chandni Chowk (Yellow Line, Gate 5) - 200m walking distance.",
        "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-02", "city": "Delhi", "name": "Natraj Dahi Bhalla Corner (Dariba Kalan)",
        "category": "food", "lat": 28.6562, "lng": 77.2308, "price_level": 1, "duration_minutes": 20,
        "vibe_tags": ["authentic", "street-food", "famous", "local"],
        "opening_hours": "10:30 - 21:30",
        "notes": "Legendary melt-in-mouth lentil dahi bhallas soaked in sweet curd and special spice blend, plus crispy aloo tikki since 1940.",
        "signature_item": "Melt-in-Mouth Dahi Bhalla & Crispy Aloo Tikki",
        "transit_tips": "Located at the corner of Dariba Kalan junction, Old Delhi. Best reached by walking through main market road.",
        "image_url": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-03", "city": "Delhi", "name": "Karim's Historic Eatery (Gali Kababian)",
        "category": "food", "lat": 28.6506, "lng": 77.2334, "price_level": 2, "duration_minutes": 45,
        "vibe_tags": ["authentic", "mughlai", "historic", "local"],
        "opening_hours": "09:00 - 00:00",
        "notes": "Direct culinary lineage of royal Mughal court chefs. Renowned for Mutton Burra, seekh kebabs, and slow-cooked nihari.",
        "signature_item": "Mutton Korma, Burra Kebabs & Khamiri Roti",
        "transit_tips": "Opposite Jama Masjid Gate No. 1. Nearest Metro: Jama Masjid (Violet Line) - 400m.",
        "image_url": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-04", "city": "Delhi", "name": "Paranthe Wali Gali (Gaya Prasad & Babu Ram)",
        "category": "food", "lat": 28.6558, "lng": 77.2304, "price_level": 1, "duration_minutes": 35,
        "vibe_tags": ["authentic", "street-food", "heritage", "bustling"],
        "opening_hours": "09:00 - 23:00",
        "notes": "Historic narrow culinary alley famous for deep-fried stuffed parathas served with sweet pumpkin mash, spicy mint chutney, and tamarind dip.",
        "signature_item": "Aloo, Paneer, Papad & Rabri Parathas",
        "transit_tips": "Walkable from Chandni Chowk main road into the heritage lane.",
        "image_url": "https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-05", "city": "Delhi", "name": "Kuremal Mohan Lal Kulfi (Sita Ram Bazar)",
        "category": "food", "lat": 28.6479, "lng": 77.2289, "price_level": 1, "duration_minutes": 25,
        "vibe_tags": ["authentic", "street-food", "hidden-gem", "sweet"],
        "opening_hours": "10:00 - 23:00",
        "notes": "Since 1906, legendary creators of real fruit-stuffed kulfis. Pulp is removed, pure rabri kulfi is frozen inside the real fruit skin.",
        "signature_item": "Whole Stuffed Mango & Jamun Fruit Kulfi",
        "transit_tips": "Nearest Metro: Chawri Bazar (Yellow Line, Gate 3) - 500m walk into Sita Ram Bazar.",
        "image_url": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-06", "city": "Delhi", "name": "Sita Ram Diwan Chand (Paharganj)",
        "category": "food", "lat": 28.6433, "lng": 77.2144, "price_level": 1, "duration_minutes": 30,
        "vibe_tags": ["authentic", "street-food", "iconic", "local"],
        "opening_hours": "08:00 - 18:00",
        "notes": "Celebrated as Delhi's quintessential Chole Bhature destination with paneer-studded dough and rich spiced chickpea gravy.",
        "signature_item": "Special Paneer Chole Bhature with Pickled Carrots",
        "transit_tips": "Nearest Metro: New Delhi Railway Station / RK Ashram Marg (Blue Line).",
        "image_url": "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-07", "city": "Delhi", "name": "Aslam Chicken & Butter Kebabs (Matia Mahal)",
        "category": "food", "lat": 28.6502, "lng": 77.2340, "price_level": 2, "duration_minutes": 40,
        "vibe_tags": ["authentic", "street-food", "lively", "popular"],
        "opening_hours": "16:00 - 00:30",
        "notes": "Smoked charcoal roasted tandoori chicken submerged in a decadent trough of melted Amul butter, curd, and hand-ground spices.",
        "signature_item": "Butter Roasted Tandoori Chicken & Roomali Roti",
        "transit_tips": "Located on the bustling Matia Mahal main street near Jama Masjid.",
        "image_url": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "del-food-08", "city": "Delhi", "name": "Gianis Di Hatti (Fatehpuri Church Mission)",
        "category": "food", "lat": 28.6575, "lng": 77.2227, "price_level": 1, "duration_minutes": 20,
        "vibe_tags": ["authentic", "dessert", "historic", "local"],
        "opening_hours": "08:30 - 23:00",
        "notes": "Operating since 1956 at Fatehpuri Chowk. Renowned for velvety rabri falooda and warm seasonal winter halwas.",
        "signature_item": "Creamy Rabri Falooda & Hot Moong Dal Halwa",
        "transit_tips": "Located near Fatehpuri Mosque at the western end of Chandni Chowk.",
        "image_url": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80"
    },
    # Mumbai Iconic Street Food & Heritage
    {
        "id": "mum-food-01", "city": "Mumbai", "name": "Bademiya Seekh & Baida Roti (Colaba)",
        "category": "food", "lat": 18.9228, "lng": 72.8335, "price_level": 2, "duration_minutes": 40,
        "vibe_tags": ["authentic", "street-food", "late-night", "iconic"],
        "opening_hours": "18:00 - 03:00",
        "notes": "Legendary street food stall behind Taj Mahal Palace Hotel with flaming open-air grills.",
        "signature_item": "Mutton Seekh Kebab & Chicken Baida Roti",
        "transit_tips": "Tulloch Road, behind Taj Mahal Palace Hotel. 15 min from Churchgate.",
        "image_url": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "mum-food-02", "city": "Mumbai", "name": "Sardar Refreshments Pav Bhaji (Tardeo)",
        "category": "food", "lat": 18.9696, "lng": 72.8166, "price_level": 1, "duration_minutes": 35,
        "vibe_tags": ["authentic", "street-food", "butter-rich", "local"],
        "opening_hours": "10:00 - 00:00",
        "notes": "Generous slab of Amul butter melting over rich spiced bhaji with toasted buttered pav.",
        "signature_item": "Cheese Pav Bhaji & Extra Butter Pav",
        "transit_tips": "166-A Tardeo Road. Nearest Station: Mumbai Central (Western Line).",
        "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "mum-food-03", "city": "Mumbai", "name": "Kyani & Co. (Heritage Irani Cafe 1904)",
        "category": "food", "lat": 18.9432, "lng": 72.8279, "price_level": 1, "duration_minutes": 35,
        "vibe_tags": ["authentic", "heritage", "vintage", "cafe"],
        "opening_hours": "07:00 - 20:30",
        "notes": "Century-old Parsi-Irani bakery and cafe with checkered tablecloths, bentwood chairs, and historic charm.",
        "signature_item": "Bun Maska, Irani Chai, Kheema Pav & Mawa Cake",
        "transit_tips": "Directly opposite Metro Cinema, Marine Lines.",
        "image_url": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "mum-food-04", "city": "Mumbai", "name": "Cannon Pav Bhaji (Opp. CSMT Station)",
        "category": "food", "lat": 18.9402, "lng": 72.8347, "price_level": 1, "duration_minutes": 25,
        "vibe_tags": ["authentic", "street-food", "bustling", "local"],
        "opening_hours": "07:00 - 23:00",
        "notes": "Famous heritage stall feeding commuters right outside the UNESCO World Heritage terminus since 1975.",
        "signature_item": "Classic Mumbai Pav Bhaji with Fresh Lime",
        "transit_tips": "Directly opposite Chhatrapati Shivaji Maharaj Terminus (CSMT).",
        "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=800&q=80"
    },
    {
        "id": "mum-food-05", "city": "Mumbai", "name": "Anand Dosa & Vada Pav (Mithibai, Vile Parle)",
        "category": "food", "lat": 19.1030, "lng": 72.8373, "price_level": 1, "duration_minutes": 25,
        "vibe_tags": ["authentic", "street-food", "fusion", "youth"],
        "opening_hours": "08:30 - 23:30",
        "notes": "Street food powerhouse opposite Mithibai College, creators of legendary butter fusion dosas and crunchy vada pavs.",
        "signature_item": "Jini Dosa & Cheese Burst Butter Vada Pav",
        "transit_tips": "Opposite Mithibai College, Gulmohar Cross Road, Vile Parle West.",
        "image_url": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80"
    },
]


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in kilometers."""
    r = 6371
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def geocode_city(city_name):
    """Turn a city name into lat/lon using OpenStreetMap's free Nominatim service."""
    params = {"q": city_name, "format": "json", "limit": 1}
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=10)
        results = resp.json()
        if not results:
            return None
        return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        return None


def reverse_geocode(lat, lon):
    """Turn lat/lon into a city name using OpenStreetMap's free Nominatim service."""
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {"lat": lat, "lon": lon, "format": "json"}
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = resp.json()
        address = data.get("address", {})
        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("municipality")
            or address.get("suburb")
            or address.get("county")
            or address.get("state")
        )
        return city
    except Exception:
        return None


def fetch_osm_venues(lat, lon, radius_meters=4500, limit=60):
    """
    Queries Overpass API with comprehensive coverage for authentic food,
    street stalls, cultural discoveries, and local heritage spots.
    Also merges verified local discovery gems within the search radius.
    """
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream"](around:{radius_meters},{lat},{lon});
      node["shop"~"bakery|confectionery|pastry|deli|spices|tea|kiosk|market"](around:{radius_meters},{lat},{lon});
      node["tourism"~"attraction|museum|viewpoint|gallery"](around:{radius_meters},{lat},{lon});
      node["historic"~"monument|memorial|archaeological_site|heritage"](around:{radius_meters},{lat},{lon});
      node["leisure"~"park|garden"](around:{radius_meters},{lat},{lon});
    );
    out center {limit};
    """
    venues = []

    # 1. First, include any verified local gems within a 16km range of the query point
    for gem in VERIFIED_LOCAL_GEMS:
        dist = haversine_km(lat, lon, gem["lat"], gem["lng"])
        if dist <= 16.0:
            venues.append({
                "id": gem["id"],
                "name": gem["name"],
                "category": gem["category"],
                "lat": gem["lat"],
                "lng": gem["lng"],
                "price_level": gem["price_level"],
                "duration_minutes": gem["duration_minutes"],
                "opening_hours": gem.get("opening_hours", "Open daily"),
                "vibe_tags": gem["vibe_tags"],
                "is_verified": True,
                "notes": gem.get("notes", ""),
                "signature_item": gem.get("signature_item", ""),
                "transit_tips": gem.get("transit_tips", ""),
                "image_url": gem.get("image_url", "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"),
            })

    # Fallback images by category
    DEFAULT_CATEGORY_IMAGES = {
        "food": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
        "landmark": "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=800&q=80",
        "culture": "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=800&q=80",
        "nature": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80",
        "shopping": "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?auto=format&fit=crop&w=800&q=80",
    }

    # 2. Query live OpenStreetMap
    try:
        resp = requests.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=25)
        if resp.status_code == 200:
            data = resp.json()
            for el in data.get("elements", []):
                tags_dict = el.get("tags", {})
                name = tags_dict.get("name")
                if not name:
                    continue

                raw_amenity = tags_dict.get("amenity")
                raw_shop = tags_dict.get("shop")
                raw_tourism = tags_dict.get("tourism")
                raw_historic = tags_dict.get("historic")
                raw_leisure = tags_dict.get("leisure")

                raw_type = raw_amenity or raw_shop or raw_tourism or raw_historic or raw_leisure
                category = CATEGORY_MAP.get(raw_type, "landmark")

                # Detect if the venue name or tags contain food / street food keywords
                name_lower = name.lower()
                is_food_named = any(k in name_lower for k in FOOD_KEYWORDS)
                if is_food_named:
                    category = "food"

                # Assign authentic vibes
                if category == "food":
                    vibes = ["authentic", "street-food", "local", "taste"]
                elif category == "landmark" or raw_historic:
                    vibes = ["scenic", "heritage", "historic", "local"]
                elif category == "culture":
                    vibes = ["authentic", "culture", "quiet", "historic"]
                elif category == "nature":
                    vibes = ["scenic", "relaxed", "nature"]
                else:
                    vibes = ["authentic", "local", "bustling"]

                venues.append({
                    "id": f"osm-{el['id']}",
                    "name": name,
                    "category": category,
                    "lat": el.get("lat"),
                    "lng": el.get("lon"),
                    "price_level": PRICE_DEFAULTS.get(category, 1),
                    "duration_minutes": DURATION_DEFAULTS.get(category, 30),
                    "opening_hours": tags_dict.get("opening_hours", "Hours vary by season"),
                    "vibe_tags": vibes,
                    "is_verified": False,
                    "notes": tags_dict.get("description") or f"Popular local {category} establishment discovered on OpenStreetMap.",
                    "signature_item": tags_dict.get("cuisine") or tags_dict.get("speciality") or f"Authentic {category} experience",
                    "transit_tips": "Accessible via city transit, auto-rickshaw, or walking",
                    "image_url": DEFAULT_CATEGORY_IMAGES.get(category, DEFAULT_CATEGORY_IMAGES["landmark"]),
                })
    except Exception as e:
        print(f"Overpass live query exception: {e}")

    # Remove duplicates by name
    seen = set()
    unique_venues = []
    for v in venues:
        norm = v["name"].strip().lower()
        if norm not in seen:
            seen.add(norm)
            unique_venues.append(v)

    return unique_venues