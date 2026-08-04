export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { amount, orderId, description, payCurrency, userId, tgId, name, handle, type, items } = req.body;
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

    /* Enregistrer le paiement en attente CÔTÉ SERVEUR, avant même de répondre au
       client — sinon si le client ferme l'app juste après avoir reçu l'adresse de
       paiement (très courant, il va payer depuis son wallet crypto), l'écriture
       côté client pouvait ne jamais se terminer, laissant le webhook incapable
       d'identifier qui créditer ("Paiement reçu non identifié"). Fait ici, il n'y
       a plus aucune fenêtre de risque : c'est écrit avant même que le client sache
       que le paiement existe. */
    if (data && data.payment_id && userId) {
      const DBKEY = process.env.FIREBASE_SECRET;
      const DBURL = "https://johndoshop-default-rtdb.europe-west1.firebasedatabase.app";
      try {
        await fetch(`${DBURL}/pending_payments/${data.payment_id}.json?auth=${DBKEY}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId, tgId: tgId || null, name: name || "Client", handle: handle || "",
            amount, type: type || "purchase", items: items || null,
            status: "pending", createdAt: Date.now()
          })
        });
      } catch (e) {
        console.error("pending_payments write failed:", e.message);
      }
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
