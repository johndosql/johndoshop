export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(200).json({ ok: true }); return; }

  const body = req.body;
  const status = body.payment_status;
  const paymentId = String(body.payment_id || "");
  const priceAmount = parseFloat(body.price_amount || 0);

  console.log("[webhook]", status, paymentId, priceAmount);

  /* Seulement les paiements finalisés */
  if (status !== "confirmed" && status !== "finished") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const BOT   = process.env.BOT_TOKEN;
  const DBKEY = process.env.FIREBASE_SECRET;
  const DBURL = "https://johndoshop-default-rtdb.europe-west1.firebasedatabase.app";

  function fmt(n) { return Number(n).toFixed(2).replace(".", ",") + "\u20ac"; }

  async function dbGet(path) {
    const r = await fetch(`${DBURL}/${path}.json?auth=${DBKEY}`);
    if (!r.ok) throw new Error("dbGet failed: " + r.status);
    return r.json();
  }
  async function dbSet(path, value) {
    const r = await fetch(`${DBURL}/${path}.json?auth=${DBKEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
    if (!r.ok) throw new Error("dbSet failed: " + r.status);
    return r.json();
  }
  async function tg(chatId, text) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
      });
    } catch(e) { console.error("tg error:", e); }
  }

  try {
    /* ── Lire le paiement en attente depuis Firebase ── */
    const pending = await dbGet("pending_payments/" + paymentId);

    if (!pending || !pending.userId) {
      console.log("[webhook] Paiement inconnu:", paymentId, "— notification admin seulement");
      await tg(1363470410,
        "\u26A0\uFE0F <b>Paiement re\u00e7u non identifi\u00e9</b>\n" +
        "Payment ID\u00a0: <code>" + paymentId + "</code>\n" +
        "Montant\u00a0: <b>" + fmt(priceAmount) + "</b>\n" +
        "V\u00e9rifie manuellement dans Firebase."
      );
      return res.status(200).json({ ok: true, msg: "unknown payment" });
    }

    /* Éviter le double crédit */
    if (pending.status === "credited") {
      console.log("[webhook] D\u00e9j\u00e0 cr\u00e9dit\u00e9:", paymentId);
      return res.status(200).json({ ok: true, msg: "already credited" });
    }

    const { userId, tgId, name, amount } = pending;
    const creditAmt = amount || priceAmount;

    /* Lire le solde actuel */
    const userData = (await dbGet("users/" + userId)) || {};
    const currentBal = parseFloat(userData.balance || 0);
    const newBal = parseFloat((currentBal + creditAmt).toFixed(2));

    /* Créditer */
    await dbSet("users/" + userId + "/balance", newBal);

    /* Marquer comme crédité pour éviter le double */
    await dbSet("pending_payments/" + paymentId + "/status", "credited");

    console.log("[webhook] Cr\u00e9dit\u00e9:", userId, "+", creditAmt, "\u2192", newBal);

    /* Notification client */
    if (tgId) {
      await tg(tgId,
        "\uD83D\uDCB0 <b>ACCESMAIL \u2014 Solde recharg\u00e9 !</b>\n\n" +
        "Bonjour <b>" + (name || "Client") + "</b>,\n\n" +
        "Ton solde a \u00e9t\u00e9 cr\u00e9dit\u00e9 de <b>" + fmt(creditAmt) + "</b>\n" +
        "Nouveau solde\u00a0: <b>" + fmt(newBal) + "</b>\n\n" +
        "Ouvre la boutique pour acheter tes acc\u00e8s. \uD83D\uDC47"
      );
    }

    /* Notification admin */
    await tg(1363470410,
      "\uD83D\uDCB8 <b>D\u00e9p\u00F4t confirm\u00e9 \u2014 WEBHOOK</b>\n\n" +
      "Client\u00a0: <b>" + (name || userId) + "</b>\n" +
      "Montant\u00a0: <b>" + fmt(creditAmt) + "</b>\n" +
      "Nouveau solde\u00a0: <b>" + fmt(newBal) + "</b>\n" +
      "Payment ID\u00a0: <code>" + paymentId + "</code>"
    );

    return res.status(200).json({ ok: true, newBalance: newBal });

  } catch (err) {
    console.error("[webhook] error:", err);
    await tg(1363470410,
      "\u274C <b>Erreur webhook</b>\n" +
      "Payment ID\u00a0: <code>" + paymentId + "</code>\n" +
      "Erreur\u00a0: " + err.message
    ).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
