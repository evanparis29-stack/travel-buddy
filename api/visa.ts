// api/visa.ts — compatibility version: sends multiple field names to provider
// No extra imports needed; Vercel Node 18+ has global fetch.

export default async function handler(req: any, res: any) {
  const passport = String(req.query.passport || "").toUpperCase();
  const destination = String(req.query.destination || "").toUpperCase();

  if (!passport || !destination) {
    return res.status(400).json({ error: true, message: "Missing passport or destination parameter" });
  }
  if (!process.env.VISA_API_KEY) {
    return res.status(500).json({ error: true, message: "VISA_API_KEY is not set in Vercel env" });
  }

  try {
    const form = new URLSearchParams({
      // send both common variants to be safe
      passport,                 // some providers expect this
      nationality: passport,    // some providers expect this instead
      destination,              // some providers expect this
      country: destination,     // some providers expect this instead
    });

    const r = await fetch("https://visa-requirement.p.rapidapi.com/map", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": process.env.VISA_API_KEY as string,
      },
      body: form,
      cache: "no-store",
    });

    const data = await r.json().catch(() => ({ error: true, message: "Bad JSON from provider" }));

    return res.status(200).json({
      passport,
      destination,
      fetchedAt: new Date().toISOString(),
      _raw: data, // provider’s raw response so we can see what it wants
    });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: err?.message || "Unknown error" });
  }
}
