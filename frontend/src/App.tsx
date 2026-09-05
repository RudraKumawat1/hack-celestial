import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default leaflet marker icons broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Numbered circle marker for each itinerary stop
function numberedIcon(n: number, isSelected: boolean) {
  const bg = isSelected ? '#ea580c' : '#0f172a'
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 9999px;
      background: ${bg}; color: #ffffff;
      font-weight: 700; font-size: 13px; font-family: ui-sans-serif, system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    ">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// User live GPS position indicator
const userLiveIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 18px; height: 18px; border-radius: 9999px;
    background: #2563eb; border: 3px solid #ffffff;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.3), 0 2px 5px rgba(0,0,0,0.2);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// Auto-fit map bounds when stops change
function MapFitter({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 15 })
    }
  }, [positions, map])
  return null
}

// Fly to a selected stop on user interaction
function MapFlyController({ targetCoord }: { targetCoord: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (targetCoord) {
      map.flyTo(targetCoord, 16, { animate: true, duration: 1.0 })
    }
  }, [targetCoord, map])
  return null
}

// Calculate Haversine distance in kilometers
function getDistanceKm(lat1?: number, lon1?: number, lat2?: number, lon2?: number): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

interface Stop {
  id: string
  name: string
  category: string
  start_time: string
  end_time: string
  duration_minutes: number
  estimated_cost: number
  vibe_tags: string[]
  lat?: number
  lng?: number
  is_verified?: boolean
  notes?: string
  opening_hours?: string
  image_url?: string
  signature_item?: string
  transit_tips?: string
}

interface ItineraryResult {
  stops: Stop[]
  total_cost: number
  budget_remaining: number
  total_duration_minutes: number
  time_remaining: number
  city?: string
  group_type?: string
  error?: string
}

const API_BASE = 'http://127.0.0.1:8000'

const CATEGORY_STYLES: Record<string, { label: string; badge: string }> = {
  food: { label: 'Culinary Heritage', badge: 'bg-amber-50 text-amber-900 border-amber-200' },
  landmark: { label: 'Historic Landmark', badge: 'bg-sky-50 text-sky-900 border-sky-200' },
  culture: { label: 'Cultural Waypoint', badge: 'bg-purple-50 text-purple-900 border-purple-200' },
  nature: { label: 'Scenic & Natural', badge: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  shopping: { label: 'Local Market', badge: 'bg-rose-50 text-rose-900 border-rose-200' },
}

const GROUP_OPTIONS = [
  { id: 'solo', label: 'Solo Explorer' },
  { id: 'couple', label: 'Duo & Couple' },
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Group / Friends' },
]

function App() {
  const [city, setCity] = useState('Delhi')
  const [minutes, setMinutes] = useState(160)
  const [budget, setBudget] = useState(2000)
  const [vibes, setVibes] = useState('authentic,street-food')
  const [groupType, setGroupType] = useState('solo')
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [disrupted, setDisrupted] = useState(false)
  const [simulateStopName, setSimulateStopName] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(true)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  
  // Selected place for detailed Inspector Modal
  const [inspectedStop, setInspectedStop] = useState<Stop | null>(null)
  const [selectedTransitMode, setSelectedTransitMode] = useState<'walk' | 'auto' | 'metro' | 'cab'>('auto')

  // Track excluded stop IDs for single-stop swaps
  const [excludedIds, setExcludedIds] = useState<string[]>([])

  // Live GPS state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locStatus, setLocStatus] = useState<'prompt' | 'detecting' | 'ready' | 'denied'>('prompt')

  // Editorial Curator Insights (Gemini)
  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)

  // Copy feedback
  const [copied, setCopied] = useState(false)

  const mapRef = useRef<HTMLDivElement | null>(null)

  // Detect user live GPS
  const detectUserLocation = (autoFillCity = false) => {
    if (!navigator.geolocation) return
    setLocStatus('detecting')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(coords)
        setLocStatus('ready')

        if (autoFillCity) {
          try {
            const res = await fetch(`${API_BASE}/reverse-geocode?lat=${coords.lat}&lon=${coords.lng}`)
            const data = await res.json()
            if (data?.city && data.city !== 'Unknown') {
              setCity(data.city)
            }
          } catch (e) {
            console.error('Reverse geocode error:', e)
          }
        }
      },
      () => setLocStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    detectUserLocation(false)
  }, [])

  // Build Itinerary
  const fetchItinerary = async () => {
    setLoading(true)
    setDisrupted(false)
    setSimulateStopName(null)
    setExcludedIds([])
    setAiInsights(null)
    try {
      const res = await fetch(
        `${API_BASE}/compose-itinerary-live?city=${encodeURIComponent(city)}&minutes=${minutes}&budget=${budget}&vibes=${encodeURIComponent(vibes)}&group_type=${groupType}`
      )
      const data: ItineraryResult = await res.json()
      setItinerary(data)
      if (data && !data.error && data.stops?.length > 0) {
        setSimulateStopName(data.stops[0].name)
        setShowMap(true)
        setSelectedStopId(data.stops[0].id)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Simulate unexpected stop closure
  const simulateDisruption = async () => {
    if (!itinerary?.stops?.length) return
    setLoading(true)
    const firstStopId = itinerary.stops[0].id
    const newExcluded = [...excludedIds, firstStopId]
    setExcludedIds(newExcluded)
    try {
      const res = await fetch(
        `${API_BASE}/replan-itinerary-live?city=${encodeURIComponent(city)}&minutes=${minutes}&budget=${budget}&vibes=${encodeURIComponent(vibes)}&group_type=${groupType}&exclude_ids=${newExcluded.join(',')}`
      )
      const data = await res.json()
      setItinerary(data)
      setDisrupted(true)
      setSimulateStopName(null)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Swap single venue
  const handleSwapStop = async (stopIdToSwap: string) => {
    setLoading(true)
    const newExcluded = [...excludedIds, stopIdToSwap]
    setExcludedIds(newExcluded)
    if (inspectedStop?.id === stopIdToSwap) {
      setInspectedStop(null)
    }
    try {
      const res = await fetch(
        `${API_BASE}/replan-itinerary-live?city=${encodeURIComponent(city)}&minutes=${minutes}&budget=${budget}&vibes=${encodeURIComponent(vibes)}&group_type=${groupType}&exclude_ids=${newExcluded.join(',')}`
      )
      const data = await res.json()
      setItinerary(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Request Editorial Field Notes
  const fetchAiInsights = async () => {
    if (!itinerary?.stops?.length) return
    setShowAiModal(true)
    if (aiInsights) return
    setAiLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ai-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: itinerary.city || city,
          stops: itinerary.stops,
          group_type: groupType,
          vibes,
        }),
      })
      const data = await res.json()
      setAiInsights(data.insights || 'No field notes available for this sequence.')
    } catch (err) {
      setAiInsights('Service temporarily unavailable. Please retry shortly.')
    }
    setAiLoading(false)
  }

  // Focus venue on map and open Inspector Modal
  const handleOpenInspector = (stop: Stop) => {
    setInspectedStop(stop)
    setSelectedStopId(stop.id)
    if (stop.lat && stop.lng) {
      setFlyTarget([stop.lat, stop.lng])
    }
  }

  const handleFocusOnMap = (stop: Stop) => {
    setSelectedStopId(stop.id)
    if (stop.lat && stop.lng) {
      setFlyTarget([stop.lat, stop.lng])
      if (mapRef.current) {
        mapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  // Direct navigation URL anchored to user location
  const getDirectionsUrl = (stop: Stop, travelMode: 'walking' | 'driving' | 'transit' = 'walking') => {
    if (!stop.lat || !stop.lng) return '#'
    const dest = `${stop.lat},${stop.lng}`
    if (userLocation) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${dest}&travelmode=${travelMode}`
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${travelMode}`
  }

  // Master multi-stop navigation
  const getFullTourUrl = () => {
    if (!itinerary?.stops?.length) return '#'
    const valid = itinerary.stops.filter((s) => s.lat && s.lng)
    if (valid.length === 0) return '#'
    const origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : `${valid[0].lat},${valid[0].lng}`
    const dest = `${valid[valid.length - 1].lat},${valid[valid.length - 1].lng}`
    const waypoints = valid.slice(0, valid.length - 1).map((s) => `${s.lat},${s.lng}`).join('|')
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}&travelmode=walking`
  }

  // WhatsApp share
  const getWhatsAppShareUrl = () => {
    if (!itinerary?.stops) return '#'
    const lines = [
      `*Curated Local Itinerary: ${itinerary.city || city}* (${groupType.toUpperCase()})`,
      `Duration: ${itinerary.total_duration_minutes} min | Cost: Rs. ${itinerary.total_cost}`,
      '',
      ...itinerary.stops.map(
        (s, i) => `${i + 1}. *${s.name}* [${s.start_time} - ${s.end_time}] - Rs. ${s.estimated_cost}`
      ),
      '',
      `Navigation Route: ${getFullTourUrl()}`,
    ]
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`
  }

  // Copy schedule to clipboard
  const handleCopy = () => {
    if (!itinerary?.stops) return
    const text = itinerary.stops
      .map((s, i) => `${i + 1}. ${s.name} (${s.start_time} - ${s.end_time}) - Rs. ${s.estimated_cost}`)
      .join('\n')
    navigator.clipboard.writeText(`Itinerary for ${itinerary.city || city}:\n\n${text}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Compute multimodal transit estimation for a given stop from user coordinates (or previous stop)
  const getTransitEstimate = (stop: Stop, index: number) => {
    let originLat = userLocation?.lat
    let originLng = userLocation?.lng

    if ((!originLat || !originLng) && index > 0 && itinerary?.stops) {
      originLat = itinerary.stops[index - 1].lat
      originLng = itinerary.stops[index - 1].lng
    }

    const distKm = getDistanceKm(originLat, originLng, stop.lat, stop.lng)
    if (distKm == null) {
      return {
        distKm: 1.2,
        walk: { min: 15, fare: 0 },
        auto: { min: 6, fare: 45 },
        metro: { min: 10, fare: 20 },
        cab: { min: 8, fare: 95 },
      }
    }

    const roundedDist = Math.max(0.2, Math.round(distKm * 10) / 10)
    return {
      distKm: roundedDist,
      walk: { min: Math.max(3, Math.round((roundedDist / 4.5) * 60)), fare: 0 },
      auto: { min: Math.max(4, Math.round((roundedDist / 22) * 60)), fare: Math.round(30 + roundedDist * 13) },
      metro: { min: Math.max(8, Math.round((roundedDist / 28) * 60 + 5)), fare: 20 },
      cab: { min: Math.max(6, Math.round((roundedDist / 24) * 60)), fare: Math.round(65 + roundedDist * 18) },
    }
  }

  const mappableStops = (itinerary?.stops ?? []).filter((s) => s.lat != null && s.lng != null)
  const positions: [number, number][] = mappableStops.map((s) => [s.lat!, s.lng!])

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
      {/* Professional Navbar */}
      <nav className="bg-white border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base tracking-tight">WAYFINDER</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded">
                  Local Discovery Engine
                </span>
              </div>
            </div>
          </div>

          {/* GPS telemetry */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => detectUserLocation(true)}
              className="flex items-center gap-2 text-xs font-medium px-3.5 py-1.5 rounded-md border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition shadow-sm"
              title="Synchronize device geolocation coordinates"
            >
              <span className={`w-2 h-2 rounded-full ${userLocation ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
              <span>
                {locStatus === 'detecting'
                  ? 'Acquiring GPS...'
                  : userLocation
                  ? 'Location Synchronized'
                  : 'Sync Device Location'}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Hero Title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Autonomous Micro-Itinerary Planning
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Algorithmic discovery across verified local street food hubs, historic heritage waypoints, and neighborhood culture.
          </p>
        </div>

        {/* Configuration Panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-5 items-end">
            {/* City Input */}
            <div className="col-span-1 md:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Target Destination
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchItinerary()}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none transition pr-9"
                  placeholder="Enter city..."
                />
                <button
                  type="button"
                  onClick={() => detectUserLocation(true)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 transition"
                  title="Use live location"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Time Allocation */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Available Window (Min)
              </label>
              <input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                step={30}
                min={30}
                max={720}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none transition"
              />
            </div>

            {/* Budget Constraint */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Budget Cap (INR)
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                step={200}
                min={0}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none transition"
              />
            </div>

            {/* Preference Profile */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Vibe Filters
              </label>
              <input
                type="text"
                value={vibes}
                onChange={(e) => setVibes(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none transition"
                placeholder="authentic,street-food"
              />
            </div>

            {/* Submit CTA */}
            <div>
              <button
                onClick={fetchItinerary}
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold py-2.5 px-4 rounded-lg text-sm shadow-sm transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>Composing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span>Compile Itinerary</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Persona selector and quick presets */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Traveler Persona:</span>
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                {GROUP_OPTIONS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupType(g.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      groupType === g.id
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-500">
              <span className="text-[11px] font-medium">Presets:</span>
              {[
                { label: 'Street Food Heritage', val: 'authentic,street-food,local' },
                { label: 'Scenic & Historic', val: 'scenic,heritage,quiet' },
                { label: 'Markets & Vibrant', val: 'bustling,local,market' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setVibes(p.val)}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error notification */}
        {itinerary?.error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6 text-sm flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold">Resolution Notice</p>
              <p className="text-xs mt-0.5">{itinerary.error}</p>
            </div>
          </div>
        )}

        {/* Incident simulation banner */}
        {itinerary && !itinerary.error && simulateStopName && (
          <div className="mb-6 bg-slate-900 text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Dynamic Route Resiliency Test</p>
                <p className="text-sm text-slate-200 mt-0.5">
                  Simulate closure of <strong>{simulateStopName}</strong> to evaluate autonomous replanning.
                </p>
              </div>
            </div>
            <button
              onClick={simulateDisruption}
              disabled={loading}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              Simulate Closure & Reroute
            </button>
          </div>
        )}

        {/* Adapted confirmation */}
        {itinerary && !itinerary.error && disrupted && !simulateStopName && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2.5 text-emerald-900 text-xs font-medium">
            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Itinerary rebalanced. Sequence recalculated within original temporal and financial parameters.</span>
          </div>
        )}

        {/* Itinerary Results Section */}
        {itinerary && !itinerary.error && itinerary.stops && itinerary.stops.length > 0 && (
          <div className="space-y-6">
            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Destination</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block truncate">{itinerary.city}</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Calculated Cost</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">Rs. {itinerary.total_cost}</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Remaining Budget</span>
                <span className="text-lg font-bold text-emerald-600 mt-0.5 block">Rs. {itinerary.budget_remaining}</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Itinerary Runtime</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">{itinerary.total_duration_minutes} min</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Buffer Margin</span>
                <span className="text-lg font-bold text-indigo-600 mt-0.5 block">{itinerary.time_remaining} min</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <a
                  href={getFullTourUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition shadow-sm"
                  title="Launch sequential turn-by-turn navigation starting from your device location"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>Launch Tour Navigation</span>
                </a>

                <button
                  onClick={fetchAiInsights}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                  title="Access field notes, transit analysis, and culinary history"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Curator Field Notes</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={getWhatsAppShareUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>Export</span>
                </a>

                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => setShowMap((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>{showMap ? 'Hide Map' : 'Show Map'}</span>
                </button>
              </div>
            </div>

            {/* Curator Editorial Panel */}
            {showAiModal && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight uppercase">
                      Curator Field Notes & Transit Context
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Synthesized local guidance and logistical parameters</p>
                  </div>
                  <button
                    onClick={() => setShowAiModal(false)}
                    className="text-slate-400 hover:text-slate-700 transition p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {aiLoading ? (
                  <div className="flex items-center gap-3 py-4 text-slate-500 text-xs">
                    <svg className="animate-spin h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>Synthesizing location telemetry and cultural parameters...</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-normal max-w-4xl">
                    {aiInsights}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Cartography */}
            {showMap && mappableStops.length > 0 && (
              <div
                ref={mapRef}
                className="rounded-xl overflow-hidden shadow-sm border border-slate-200 relative z-10"
                style={{ height: 380 }}
              >
                <MapContainer
                  center={positions[0]}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />

                  {positions.length > 1 && (
                    <Polyline
                      positions={positions}
                      pathOptions={{ color: '#0f172a', weight: 3, dashArray: '6,6', opacity: 0.8 }}
                    />
                  )}

                  {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={userLiveIcon}>
                      <Popup>
                        <div className="text-xs p-1">
                          <strong className="text-slate-900 block font-semibold">Device Geolocation</strong>
                          <span className="text-slate-500 text-[11px]">Active GPS Anchor</span>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {mappableStops.map((stop, i) => (
                    <Marker
                      key={stop.id}
                      position={[stop.lat!, stop.lng!]}
                      icon={numberedIcon(i + 1, selectedStopId === stop.id)}
                      eventHandlers={{
                        click: () => handleOpenInspector(stop),
                      }}
                    >
                      <Popup>
                        <div className="text-xs p-1 min-w-[190px]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                            Stop {i + 1}
                          </span>
                          <strong className="text-slate-900 text-sm block font-bold mb-1">{stop.name}</strong>
                          <p className="text-slate-500 text-[11px] mb-2">
                            {stop.start_time} – {stop.end_time} · Estimated: Rs. {stop.estimated_cost}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleOpenInspector(stop)}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1 px-2 rounded text-[11px] transition text-center mb-1"
                          >
                            Inspect Details & Transit
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  <MapFitter positions={positions} />
                  <MapFlyController targetCoord={flyTarget} />
                </MapContainer>
              </div>
            )}

            {/* Waypoint Timeline */}
            <div className="space-y-3">
              {itinerary.stops.map((stop, i) => {
                const isSelected = selectedStopId === stop.id
                const catStyle = CATEGORY_STYLES[stop.category] || {
                  label: stop.category,
                  badge: 'bg-slate-100 text-slate-800 border-slate-200',
                }
                const transit = getTransitEstimate(stop, i)

                return (
                  <div
                    key={stop.id}
                    className={`bg-white rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border transition-all ${
                      isSelected
                        ? 'border-slate-900 ring-1 ring-slate-900 shadow-md'
                        : 'border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    {/* Thumbnail Image + Details */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* Stop Number or Thumbnail */}
                      <div className="relative flex-shrink-0">
                        {stop.image_url ? (
                          <img
                            src={stop.image_url}
                            alt={stop.name}
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition"
                            onClick={() => handleOpenInspector(stop)}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                            #{i + 1}
                          </div>
                        )}
                        <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-slate-900 text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                          {i + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4
                            onClick={() => handleOpenInspector(stop)}
                            className="text-base font-bold text-slate-900 tracking-tight hover:text-indigo-600 cursor-pointer transition truncate"
                            title="Click to view full photos, transit options, and cost breakdown"
                          >
                            {stop.name}
                          </h4>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${catStyle.badge}`}
                          >
                            {catStyle.label}
                          </span>
                          {stop.is_verified && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Verified Culinary Gem
                            </span>
                          )}
                        </div>

                        {/* Signature item if available */}
                        {stop.signature_item && (
                          <p className="text-xs text-slate-600 font-medium mb-1 truncate">
                            <span className="text-slate-400">Signature:</span> {stop.signature_item}
                          </p>
                        )}

                        {/* Schedule & Quick Transit Telemetry */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-2 flex-wrap">
                          <span className="font-medium text-slate-700">
                            {stop.start_time} – {stop.end_time} ({stop.duration_minutes}m)
                          </span>
                          <span>·</span>
                          <span>Cost: Rs. {stop.estimated_cost}</span>
                          <span>·</span>
                          <span className="text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
                            {transit.distKm} km away · ~{transit.auto.min}m auto (Rs. {transit.auto.fare}) · ~{transit.walk.min}m walk
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {stop.vibe_tags?.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {/* Details & Transit button */}
                      <button
                        type="button"
                        onClick={() => handleOpenInspector(stop)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                        title="View photos, transit options, and cost breakdown"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Details & Transit</span>
                      </button>

                      {stop.lat && stop.lng && (
                        <a
                          href={getDirectionsUrl(stop)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition shadow-sm"
                          title="Open Google Maps navigation starting from your device GPS location"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Directions</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSwapStop(stop.id)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition"
                        title="Allocate alternative venue within remaining window"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Alternative</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* Location Inspector & Multimodal Transit Modal */}
      {inspectedStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-200">
            {/* Modal Header Photo */}
            <div className="relative h-60 w-full overflow-hidden bg-slate-900">
              {inspectedStop.image_url ? (
                <img
                  src={inspectedStop.image_url}
                  alt={inspectedStop.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400 text-sm font-medium">
                  High-Resolution Field Cartography
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
              
              <button
                onClick={() => setInspectedStop(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="absolute bottom-4 left-6 right-6 text-white">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/20 backdrop-blur-md text-white border border-white/20">
                    {CATEGORY_STYLES[inspectedStop.category]?.label || inspectedStop.category}
                  </span>
                  {inspectedStop.is_verified && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/90 text-white">
                      Verified Culinary Gem
                    </span>
                  )}
                  <span className="text-[10px] uppercase font-semibold text-slate-300">
                    {inspectedStop.opening_hours || 'Open Daily'}
                  </span>
                </div>
                <h3 className="text-xl font-bold tracking-tight text-white">{inspectedStop.name}</h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Signature items & Notes */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Highlights & Historical Notes
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {inspectedStop.notes || 'An authentic local neighborhood destination recognized for heritage and cultural flavor.'}
                </p>
                {inspectedStop.signature_item && (
                  <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      ✓
                    </div>
                    <div>
                      <span className="text-xs font-bold text-amber-900 block">Must-Try Signature Specialty</span>
                      <span className="text-xs text-amber-800">{inspectedStop.signature_item}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Multimodal Transit Matrix */}
              {(() => {
                const stopIdx = itinerary?.stops.findIndex((s) => s.id === inspectedStop.id) ?? 0
                const transit = getTransitEstimate(inspectedStop, stopIdx)
                const activeCost =
                  selectedTransitMode === 'walk'
                    ? transit.walk.fare
                    : selectedTransitMode === 'auto'
                    ? transit.auto.fare
                    : selectedTransitMode === 'metro'
                    ? transit.metro.fare
                    : transit.cab.fare
                const totalEstimatedAmount = activeCost + inspectedStop.estimated_cost

                return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          How to Reach & Transit Comparison
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Calculated distance: <strong>{transit.distKm} km</strong> from current coordinates
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-semibold text-slate-400 block">Total Journey Amount</span>
                        <span className="text-base font-extrabold text-slate-900">
                          Rs. {totalEstimatedAmount}{' '}
                          <span className="text-xs font-normal text-slate-500">(Travel + Venue)</span>
                        </span>
                      </div>
                    </div>

                    {/* 4 Mode Option Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                      {/* Walking */}
                      <button
                        type="button"
                        onClick={() => setSelectedTransitMode('walk')}
                        className={`p-3 rounded-xl border text-left transition ${
                          selectedTransitMode === 'walk'
                            ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block">Foot / Walking</span>
                        <span className="text-lg font-extrabold text-slate-800 block mt-1">~{transit.walk.min} min</span>
                        <span className="text-xs text-emerald-600 font-semibold block">Rs. 0 (Free)</span>
                      </button>

                      {/* Auto-Rickshaw */}
                      <button
                        type="button"
                        onClick={() => setSelectedTransitMode('auto')}
                        className={`p-3 rounded-xl border text-left transition ${
                          selectedTransitMode === 'auto'
                            ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block">Auto-Rickshaw</span>
                        <span className="text-lg font-extrabold text-slate-800 block mt-1">~{transit.auto.min} min</span>
                        <span className="text-xs text-slate-600 font-semibold block">Rs. {transit.auto.fare} est.</span>
                      </button>

                      {/* Metro / Transit */}
                      <button
                        type="button"
                        onClick={() => setSelectedTransitMode('metro')}
                        className={`p-3 rounded-xl border text-left transition ${
                          selectedTransitMode === 'metro'
                            ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block">City Metro</span>
                        <span className="text-lg font-extrabold text-slate-800 block mt-1">~{transit.metro.min} min</span>
                        <span className="text-xs text-slate-600 font-semibold block">Rs. {transit.metro.fare} fare</span>
                      </button>

                      {/* Rideshare Cab */}
                      <button
                        type="button"
                        onClick={() => setSelectedTransitMode('cab')}
                        className={`p-3 rounded-xl border text-left transition ${
                          selectedTransitMode === 'cab'
                            ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block">Cab / Uber</span>
                        <span className="text-lg font-extrabold text-slate-800 block mt-1">~{transit.cab.min} min</span>
                        <span className="text-xs text-slate-600 font-semibold block">Rs. {transit.cab.fare} est.</span>
                      </button>
                    </div>

                    {/* Transit Station guidance if any */}
                    {inspectedStop.transit_tips && (
                      <div className="p-3 bg-slate-100/80 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{inspectedStop.transit_tips}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Action Toolbar inside Modal */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleFocusOnMap(inspectedStop)
                      setInspectedStop(null)
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                  >
                    <span>Focus on Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwapStop(inspectedStop.id)}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                  >
                    <span>Swap Venue</span>
                  </button>
                </div>

                <a
                  href={getDirectionsUrl(
                    inspectedStop,
                    selectedTransitMode === 'walk' ? 'walking' : selectedTransitMode === 'metro' ? 'transit' : 'driving'
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition shadow-sm"
                >
                  <span>Launch Directions in {selectedTransitMode.toUpperCase()}</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
