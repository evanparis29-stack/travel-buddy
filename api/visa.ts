// api/visa.ts — RapidAPI "Visa Requirement" (POST form-encoded to root endpoint)
// Expects query: ?passport=FRA&destination=JPN  (ISO3)
// Converts to ISO2 (FR/JP) and calls the provider.

async function iso3to2(iso3: string): Promise<string | null> {
  const x = (iso3 || "").toUpperCase().trim();
  if (/^[A-Z]{2}$/.test(x)) return x; // already ISO2
  // quick map for common codes
  const map: Record<string, string> = {
    USA: "US", GBR: "GB", FRA: "FR", DEU: "DE", ITA: "IT", ESP: "ES",
    CAN: "CA", AUS: "AU", JPN: "JP", KAZ: "KZ", UZB: "UZ", RUS: "RU",
    CHN: "CN", IND: "IN", MEX: "MX", BRA: "BR", TUR: "TR", ARE: "AE",
  };
  if (map[x]) return map[x];
  try {
    const r = await fetch(`https://restcountries.com/v3.1/alpha/${x}`);
    if (!r.ok) return null;
    const j = await r.json();
    const c2 = j?.[0]?.cca2;
    return c2 ? String(c2).toUpperCase() : null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  const p3 = String(req.query.passport || "").toUpperCase();
  const d3 = String(req.query.destination || "").toUpperCase();
  if (!p3 || !d3) {
    return res.status(400).json({ error: true, message: "Missing passport or destination (ISO3)" });
  }

  const p2 = await iso3to2(p3);
  const d2 = await iso3to2(d3);
  if (!p2 || !d2) {
    return res.status(400).json({ error: true, message: "Could not convert ISO3 to ISO2" });
  }

  const apiKey = process.env.RAPIDAPI_KEY || process.env.VISA_API_KEY || "";
  if (!apiKey) {
    return res.status(500).json({ error: true, message: "Missing RAPIDAPI_KEY (or VISA_API_KEY) in Vercel env" });
  }

  try {
    const body = new URLSearchParams({ passport: p2, destination: d2 }).toString();

    const r = await fetch("https://visa-requirement.p.rapidapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
        "Accept": "application/json",
      },
      body,
      cache: "no-store",
    });

    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: true, message: "Non-JSON response", text }; }

    if (data?.error === true) {
      return res.status(200).json({
        passport: p3, destination: d3, fetchedAt: new Date().toISOString(),
        requirement: "unknown", notes: data?.message || "Provider error", _raw: data
      });
    }

    // Normalize main fields
    const colorMap: Record<string, string> = {
      red: "visa_required",
      blue: "visa_on_arrival", // provider uses blue for VoA/eVisa
      yellow: "eta",
      green: "visa_free",
    };

    return res.status(200).json({
      passport: p3,
      destination: d3,
      requirement: colorMap[String(data?.color || "").toLowerCase()] ?? (data?.visa ? String(data.visa) : "unknown"),
      allowedStay: data?.stay_of || undefined,
      notes: data?.except_text || undefined,
      source: "visa-requirement.p.rapidapi.com",
      fetchedAt: new Date().toISOString(),
      _raw: data,
    });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: err?.message || "Unexpected provider error" });
  }
}
