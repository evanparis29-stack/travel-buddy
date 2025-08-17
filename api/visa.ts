// api/visa.ts — CORS + ISO3→ISO2 + RapidAPI call (works from localhost → Vercel)
const RAPID_HOST = "visa-requirement.p.rapidapi.com";
const RAPID_URL = `https://${RAPID_HOST}/`;
const RAPID_KEY =
  process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";

// ---- CORS helpers
function setCORS(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-rapidapi-key,x-rapidapi-host"
  );
}

// ISO3 → ISO2 via restcountries
async function iso3to2(iso3: string): Promise<string> {
  const code = (iso3 || "").toUpperCase().trim();
  if (!code) return "";
  try {
    const r = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    if (!r.ok) return "";
    const arr = await r.json();
    const it = Array.isArray(arr) ? arr[0] : arr;
    return (it?.cca2 || "").toUpperCase();
  } catch {
    return "";
  }
}

export default async function handler(req: any, res: any) {
  setCORS(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // preflight
  }

  // Accept GET ?passport=FRA&destination=JPN and POST {passport,destination}
  const isGET = req.method === "GET";
  const body = isGET ? req.query : (req.body || {});
  const passportISO3 = String((body as any).passport || "").toUpperCase();
  const destinationISO3 = String((body as any).destination || "").toUpperCase();

  if (!RAPID_KEY) {
    return res
      .status(500)
      .json({ error: true, message: "Missing VISA_API_KEY/RAPIDAPI_KEY" });
  }
  if (!passportISO3 || !destinationISO3) {
    return res.status(400).json({
      error: true,
      message: "Missing 'passport' or 'destination' (use ISO3 like FRA,JPN)",
    });
  }

  // Convert to ISO2 for RapidAPI
  const [passportISO2, destinationISO2] = await Promise.all([
    iso3to2(passportISO3),
    iso3to2(destinationISO3),
  ]);

  if (!passportISO2 || !destinationISO2) {
    return res.status(400).json({
      error: true,
      message: "Could not resolve ISO3→ISO2 mapping",
      debug: { passportISO3, destinationISO3, passportISO2, destinationISO2 },
    });
  }

  // RapidAPI requires form-encoded body + headers
  const form = new URLSearchParams();
  form.set("passport", passportISO2);
  form.set("destination", destinationISO2);

  try {
    const upstream = await fetch(RAPID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": RAPID_HOST,
        "x-rapidapi-key": RAPID_KEY,
      },
      body: form.toString(),
    });

    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Normalize for app display
    const color = String(data?.color || "").toLowerCase();
    const map: Record<string, string> = {
      red: "visa_required",
      green: "visa_free",
      blue: "visa_on_arrival",
      yellow: "eta",
    };

    const normalized = {
      passport: passportISO3,
      destination: destinationISO3,
      requirement:
        (map[color] as
          | "visa_required"
          | "visa_free"
          | "visa_on_arrival"
          | "eta"
          | "unknown") || "unknown",
      allowedStay: data?.stay_of || null,
      notes: data?.except_text || null,
      source: RAPID_HOST,
      fetchedAt: new Date().toISOString(),
      _raw: data,
    };

    setCORS(res);
    return res.status(200).json(normalized);
  } catch (e: any) {
    setCORS(res);
    return res
      .status(502)
      .json({ error: true, message: "Upstream call failed", detail: e?.message });
  }
}
