export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { amount, orderId, description, payCurrency } = req.body;
  if (!amount || !orderId) { res.status(400).json({ error: "Missing fields" }); return; }

  const currency = payCurrency || "usdttrc20";

  try {
    const response = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "eur",
        pay_currency: currency,
        order_id: orderId,
        order_description: description || "ACCESMAIL commande",
        ipn_callback_url: "https://johndoshop.vercel.app/api/nowpayments-webhook"
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
