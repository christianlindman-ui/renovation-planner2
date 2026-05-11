// Proxy for Nominatim + Overpass to avoid CORS issues in browser
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address' });

  try {
    // 1. Geocode via Nominatim
    const geoUrl = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
    const geoRes = await fetch(geoUrl, {
      headers: {
        'User-Agent': 'RenoveringsplanerareApp/1.0 (christian.lindman@above.se)',
        'Accept-Language': 'sv',
      },
    });
    const geo = await geoRes.json();
    if (!geo.length) return res.status(404).json({ error: 'Adressen hittades inte' });

    const lat = parseFloat(geo[0].lat);
    const lng = parseFloat(geo[0].lon);
    const displayName = geo[0].display_name;

    // 2. Fetch building polygon from Overpass
    const query = `[out:json][timeout:10];way["building"](around:40,${lat},${lng});out geom tags;`;
    const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'User-Agent': 'RenoveringsplanerareApp/1.0' },
    });
    const ovData = await ovRes.json();

    return res.status(200).json({ lat, lng, displayName, elements: ovData.elements || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
