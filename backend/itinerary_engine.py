from datetime import datetime, timedelta

TRAVEL_BUFFER_MINUTES = 15  # estimated time to move between stops (placeholder until real routing is added)


GROUP_TYPE_BONUS = {
    "solo": {"culture": 3, "food": 2, "landmark": 2},
    "couple": {"landmark": 3, "food": 3, "nature": 3},
    "family": {"nature": 3, "culture": 2, "landmark": 2},
    "friends": {"food": 3, "shopping": 3, "landmark": 2},
}


def score_venue(venue, preferred_vibes, preferred_categories, group_type="solo"):
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

    # Group type personalization
    if group_type and group_type in GROUP_TYPE_BONUS:
        bonus = GROUP_TYPE_BONUS[group_type].get(venue.get("category"), 0)
        score += bonus

    # High-priority boost for authentic local food & street culinary discovery
    if venue.get("category") == "food":
        score += 4
    if venue.get("is_verified"):
        score += 3

    score += max(0, 5 - (venue.get("duration_minutes", 30) // 20))

    return score


def compose_itinerary(
    venues,
    available_minutes,
    budget,
    preferred_vibes=None,
    preferred_categories=None,
    exclude_ids=None,
    group_type="solo"
):
    """
    Intelligently builds a balanced, high-discovery itinerary fitting time & budget.
    Ensures a diverse mix (culinary discoveries, landmarks, cultural spots).
    """
    exclude_ids = exclude_ids or set()
    price_map = {0: 0, 1: 200, 2: 500, 3: 1000}

    candidates = [v for v in venues if v["id"] not in exclude_ids]

    for v in candidates:
        v["_score"] = score_venue(v, preferred_vibes, preferred_categories, group_type)
    candidates.sort(key=lambda v: v["_score"], reverse=True)

    itinerary = []
    remaining_time = available_minutes
    remaining_budget = budget
    used_categories = set()

    # Balanced selection loop with category diversity
    pool = list(candidates)
    while remaining_time >= 20 and pool:
        best_pick = None
        best_score = -9999

        for venue in pool:
            duration = venue.get("duration_minutes", 30)
            cost = price_map.get(venue.get("price_level", 0), 0)
            time_needed = duration + (TRAVEL_BUFFER_MINUTES if itinerary else 0)

            if time_needed <= remaining_time and cost <= remaining_budget:
                # Slight penalty if we already used this category (unless budget/time restricts options)
                cat = venue.get("category")
                penalty = 4 if (cat in used_categories and cat != "food") else 0
                effective_score = venue["_score"] - penalty

                if effective_score > best_score:
                    best_score = effective_score
                    best_pick = (venue, time_needed, cost)

        if not best_pick:
            break

        chosen, time_spent, cost_spent = best_pick
        itinerary.append(chosen)
        remaining_time -= time_spent
        remaining_budget -= cost_spent
        used_categories.add(chosen.get("category"))
        pool.remove(chosen)

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
            "lat": venue.get("lat"),
            "lng": venue.get("lng"),
            "is_verified": venue.get("is_verified", False),
            "notes": venue.get("notes", ""),
            "opening_hours": venue.get("opening_hours", "Open daily"),
            "image_url": venue.get("image_url", ""),
            "signature_item": venue.get("signature_item", ""),
            "transit_tips": venue.get("transit_tips", ""),
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