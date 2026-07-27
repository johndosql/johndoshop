export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = req.body;
  const status = body.payment_status;
  const orderId = body.order_id || "";
  const priceAmount = parseFloat(body.price_amount || 0);

  console.log("[webhook] status:", status, "| order:", orderId);

  if (status !== "confirmed" && status !== "finished") {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const BOT = process.env.BOT_TOKEN;
  const DB_URL = "https://johndoshop-default-rtdb.europe-west1.firebasedatabase.app";
  const DB_KEY = process.env.FIREBASE_SECRET; // à ajouter dans Vercel

  function fmt(n) { return Number(n).toFixed(2).replace(".", ",") + "\u20ac"; }

  async function dbGet(path) {
    const r = await fetch(`${DB_URL}/${path}.json?auth=${DB_KEY}`);
    return r.json();
  }
  async function dbSet(path, value) {
    await fetch(`${DB_URL}/${path}.json?auth=${DB_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
  }
  async function tg(chatId, text) {
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
    });
  }

  try {
    /* ── DÉPÔT: dep_u{userId}_{ts} ── */
    if (orderId.startsWith("dep_")) {
      const userId = orderId.split("_")[1];
      if (!userId || !userId.startsWith("u")) {
        return res.status(200).json({ ok: false, msg: "bad userId" });
      }

      const userData = (await dbGet("users/" + userId)) || {};
      const currentBal = parseFloat(userData.balance || 0);
      const newBal = parseFloat((currentBal + priceAmount).toFixed(2));

      await dbSet("users/" + userId + "/balance", newBal);
      console.log("[webhook] Crédité:", userId, "+", priceAmount, "→", newBal);

      /* Notif client */
      if (userData.tgId) {
        await tg(userData.tgId,
          "\uD83D\uDCB0 <b>ACCESMAIL \u2014 Solde recharg\u00e9 !</b>\n\n" +
          "Bonjour <b>" + (userData.name || "Client") + "</b>,\n\n" +
          "Ton solde a \u00e9t\u00e9 cr\u00e9dit\u00e9 de <b>" + fmt(priceAmount) + "</b>\n" +
          "Nouveau solde\u00a0: <b>" + fmt(newBal) + "</b>\n\n" +
          "Ouvre la boutique pour acheter tes acc\u00e8s \uD83D\uDC47"
        );
      }

      /* Notif admin */
      await tg(1363470410,
        "\uD83D\uDCB8 <b>D\u00e9p\u00f4t confirm\u00e9 \u2014 WEBHOOK</b>\n\n" +
        "Client\u00a0: <b>" + (userData.name || userId) + "</b>\n" +
        "Montant\u00a0: <b>" + fmt(priceAmount) + "</b>\n" +
        "Nouveau solde\u00a0: <b>" + fmt(newBal) + "</b>"
      );

      return res.status(200).json({ ok: true, newBalance: newBal });
    }

    /* ── ACHAT panier: acm_{ts} ── */
    if (orderId.startsWith("acm_")) {
      await tg(1363470410,
        "\uD83D\uDED2 <b>Achat confirm\u00e9 \u2014 WEBHOOK</b>\n" +
        "Montant\u00a0: <b>" + fmt(priceAmount) + "</b>\n" +
        "Order\u00a0: <code>" + orderId + "</code>"
      );
      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    res.status(500).json({ error: err.message });
  }
}
