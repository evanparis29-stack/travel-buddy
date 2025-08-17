// api/visa.ts — robust version that tries ISO3 and country names
// Uses built-in fetch (Node 18+ on Vercel), no extra deps.

type ProviderResult = any;

function titleCaseName(n: string) {
  return n.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

// Minimal ISO3 → common name map for fallback.
// Add more as needed; we also try RestCountries live lookup below.
const ISO3_TO_NAME: Record<string, string> = {
  FRA: "France",
  JPN: "Japan",
  USA: "United States",
  UZB: "Uzbekistan",
  KAZ: "Kazakhstan",
  GBR: "United Kingdom",
  DEU: "Germany",
  ESP: "Spain",
  ITA: "Italy",
  CAN: "Canada",
  AUS: "Australia",
};

async function iso3ToName(iso3: string): Promise<string | null> {
  const code = (iso3 || "").toUpperCase();
  if (ISO3_TO_NAME[code]) return ISO3_TO_NAME[code];
  try {
    const r = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    if (!r.ok) return null;
    const data = await r.json();
    const name = data?.[0]?.name?.common as string | undefined;
    return name ?? null;
  } catch {
    return null;
  }
}

async function callProvider(passportField: string, destinationField: string) {
  const url = "https://visa-requirement.p.rapidapi.com/map";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
      "x-rapidapi-key": process.env.VISA_API_KEY || "",
    },
    body: new URLSearchParams({
      passport: passportField,
      destination: destinationField,
    }),
    cache: "no-store",
  });
  let data: ProviderResult;
  try {
    data = await r.json();
  } catch {
    data = { error: true, message: "Bad JSON from provider" };
  }
  return { ok: r.ok, data };
}

export default async function handler(req: any, res: any) {
  const passportRaw = String(req.query.passport || "").trim();
  const destinationRaw = String(req.query.destination || "").trim();

  if (!passportRaw || !destinationRaw) {
    return res.status(400).json({ error: true, message: "Missing required parameters: passport and destination" });
  }
  if (!process.env.VISA_API_KEY) {
    return res.status(500).json({ error: true, message: "VISA_API_KEY not set in Vercel env" });
  }

  // 1) Try straight ISO3 (what your app sends)
  let attempt = await callProvider(passportRaw.toUpperCase(), destinationRaw.toUpperCase());

  // Some provider responses signal no data without HTTP error
  const noData =
    attempt.data?.error ||
    /no visa information found/i.test(String(attempt.data?.message)) ||
    attempt.data?.status === "error";

  if (!noData && attempt.data && !attempt.data.error) {
    return res.status(200).json({
      passport: passportRaw.toUpperCase(),
      destination: destinationRaw.toUpperCase(),
      fetchedAt: new Date().toISOString(),
      _raw: attempt.data,
    });
  }

  // 2) Fallback: map ISO3 → country names and retry
  const passName = (await iso3ToName(passportRaw)) || titleCaseName(passportRaw);
  const destName = (await iso3ToName(destinationRaw)) || titleCaseName(destinationRaw);

  const attempt2 = await callProvider(passName, destName);

  // Return normalized best-effort response
  const pick = !attempt2.data?.error ? attempt2 : attempt; // prefer successful attempt
  return res.status(200).json({
    passport: passName,
    destination: destName,
    fetchedAt: new Date().toISOString(),
    _raw: pick.data,
  });
}
