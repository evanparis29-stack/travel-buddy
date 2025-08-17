import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { passport, destination } = req.query;

    if (!passport || !destination) {
      return res.status(400).json({
        error: true,
        message: "Missing required parameters: passport and destination",
      });
    }

    const response = await fetch("https://visa-requirement.p.rapidapi.com/map", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": process.env.VISA_API_KEY as string,
      },
      body: new URLSearchParams({
        passport: passport as string,
        destination: destination as string,
      }),
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: true, message: error.message });
  }
}
