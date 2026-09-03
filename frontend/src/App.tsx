import { useEffect, useState } from 'react'

interface Venue {
  id: string
  name: string
  category: string
  price_level: number
  duration_minutes: number
  opening_hours: string
  vibe_tags: string[]
}

function App() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('http://127.0.0.1:8000/venues')
      .then((res) => res.json())
      .then((data) => {
        setVenues(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-8 text-xl">Loading venues...</div>
  if (error) return <div className="p-8 text-xl text-red-600">Error: {error}</div>

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-6">Local Venues ({venues.length})</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {venues.map((venue) => (
          <div key={venue.id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-xl font-semibold">{venue.name}</h2>
            <p className="text-gray-500 capitalize">{venue.category}</p>
            <p className="text-sm mt-2">⏱ {venue.duration_minutes} min · ₹{'₹'.repeat(venue.price_level) || 'Free'}</p>
            <p className="text-xs text-gray-400 mt-1">{venue.opening_hours}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {venue.vibe_tags.map((tag) => (
                <span key={tag} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App