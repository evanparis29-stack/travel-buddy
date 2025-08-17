// api/visa.ts  — Vercel Serverless Function (Node.js runtime, no extra typings)
// Uses RapidAPI "visa-requirement" endpoint (POST x-www-form-urlencoded)

export default async function handler(req: any, res: any) {
  // Accept either ?passport=FRA&destination=JPN or ?nationality=FRA&destination=JPN
  const passport = String(req.query.passport || '').toUpperCase();
  const nationality = String(req.query.nationality || passport).toUpperCase(); // alias
  const destination = String(req.query.destination || '').toUpperCase();

  if (!nationality || !destination) {
    return res.status(400).json({ error: 'Missing nationality/passport or destination (ISO code)' });
  }

  try {
    // RapidAPI endpoint you showed in cURL
    const url = 'https://visa-requirement.p.rapidapi.com/map';

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-rapidapi-host': 'visa-requirement.p.rapidapi.com',
        'x-rapidapi-key': process.env.VISA_API_KEY || '', // <- set in Vercel env
      },
      body: new URLSearchParams({
        nationality,   // e.g. FRA
        destination,   // e.g. JPN
      }),
      // Don't cache server-side to always get fresh rules
      cache: 'no-store',
    });

    const data = await r.json();

    // Normalize to a consistent shape for the app UI (best-effort mapping)
    // Adjust these field names to match the exact response you see from the provider.
    const rawReq = (data?.requirement || data?.status || 'unknown').toString().toLowerCase();
    const map: Record<string, string> = {
      'visa free': 'visa_free',
      'visa-free': 'visa_free',
      'visa on arrival': 'visa_on_arrival',
      'e-visa': 'evisa',
      'eta': 'eta',
      'visa required': 'visa_required',
      'unknown': 'unknown',
    };

    const result = {
      passport: nationality,                // treat nationality as passport ISO
      destination,
      requirement: (map[rawReq] ?? 'unknown') as
        'visa_free' | 'visa_on_arrival' | 'evisa' | 'eta' | 'visa_required' | 'unknown',
      allowedStay: data?.stay || data?.duration || undefined,
      notes: data?.notes || data?.message || undefined,
      source: data?.source || data?.official_url || undefined,
      fetchedAt: new Date().toISOString(),
      _raw: data, // optional: keep raw for debugging; remove in prod if you want
    };

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(200).json({
      passport: nationality,
      destination,
      requirement: 'unknown',
      notes: err?.message || 'Unexpected error calling provider',
      fetchedAt: new Date().toISOString(),
    });
  }
}
