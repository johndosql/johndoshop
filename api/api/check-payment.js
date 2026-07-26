export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { id } = req.query;
  if (!id) { res.status(400).json({ error: "Missing payment id" }); return; }

  try {
    const response = await fetch(`https://api.nowpayments.io/v1/payment/${id}`, {
      headers: { "x-api-key": process.env.NOWPAYMENTS_KEY }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
