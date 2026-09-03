from datetime import datetime, timedelta

TRAVEL_BUFFER_MINUTES = 15  # estimated time to move between stops (placeholder until real routing is added)


def score_venue(venue, preferred_vibes, preferred_categories):
    """
    Higher score = better match to what the traveler asked for.
    """
    score = 0

    if preferred_vibes:
        venue_vibes = set(venue.get("vibe_tags") or [])
        overlap = venue_vibes.intersection(set(preferred_vibes))
        score += len(overlap) * 3

    if preferred_categories and venue.get("category") in preferred_categories:
        score += 2

    score += max(0, 5 - (venue.get("duration_minutes", 30) // 20))

    return score


def compose_itinerary(venues, available_minutes, budget, preferred_vibes=None, preferred_categories=None, exclude_ids=None):
    """
    Greedily builds an itinerary that fits within available_minutes and budget.
    """
    exclude_ids = exclude_ids or set()
    price_map = {0: 0, 1: 200, 2: 500, 3: 1000}

    candidates = [v for v in venues if v["id"] not in exclude_ids]

    for v in candidates:
        v["_score"] = score_venue(v, preferred_vibes, preferred_categories)
    candidates.sort(key=lambda v: v["_score"], reverse=True)

    itinerary = []
    remaining_time = available_minutes
    remaining_budget = budget
    used_categories = set()

    for venue in candidates:
        duration = venue.get("duration_minutes", 30)
        cost = price_map.get(venue.get("price_level", 0), 0)
        time_needed = duration + (TRAVEL_BUFFER_MINUTES if itinerary else 0)

        if time_needed <= remaining_time and cost <= remaining_budget:
            itinerary.append(venue)
            remaining_time -= time_needed
            remaining_budget -= cost
            used_categories.add(venue.get("category"))

        if remaining_time <= 15:
            break

    schedule = []
    current_time = datetime.now()
    for i, venue in enumerate(itinerary):
        if i > 0:
            current_time += timedelta(minutes=TRAVEL_BUFFER_MINUTES)
        start = current_time
        end = start + timedelta(minutes=venue.get("duration_minutes", 30))
        schedule.append({
            "id": venue["id"],
            "name": venue["name"],
            "category": venue.get("category"),
            "start_time": start.strftime("%I:%M %p"),
            "end_time": end.strftime("%I:%M %p"),
            "duration_minutes": venue.get("duration_minutes"),
            "estimated_cost": price_map.get(venue.get("price_level", 0), 0),
            "vibe_tags": venue.get("vibe_tags"),
        })
        current_time = end

    total_cost = sum(s["estimated_cost"] for s in schedule)
    total_duration = sum(s["duration_minutes"] for s in schedule) + TRAVEL_BUFFER_MINUTES * max(0, len(schedule) - 1)

    return {
        "stops": schedule,
        "total_cost": total_cost,
        "budget_remaining": budget - total_cost,
        "total_duration_minutes": total_duration,
        "time_remaining": available_minutes - total_duration,
    }