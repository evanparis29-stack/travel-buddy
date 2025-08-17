import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { passport, destination } = req.query;

  if (!passport || !destination) {
    return res.status(400).json({ error: "Missing passport or destination" });
  }

  try {
    const apiRes = await fetch("https://visa-requirement.p.rapidapi.com/map", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": process.env.VISA_API_KEY || ""
      },
      body: new URLSearchParams({
        passport: String(passport),
        destination: String(destination)
      })
    });

    const data = await apiRes.json();
    return res.status(200).json({
      passport,
      destination,
      ...data
    });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: err.message });
  }
}
