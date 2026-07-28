export default async function handler(req, res) {
  if (req.method !== "POST") { return res.status(200).json({ ok: true }); }

  const body = req.body;
  const status = body.payment_status;
  const paymentId = String(body.payment_id || "");
  const priceAmount = parseFloat(body.price_amount || 0);

  console.log("[webhook]", status, paymentId, priceAmount);

  if (status !== "confirmed" && status !== "finished") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const BOT   = process.env.BOT_TOKEN;
  const DBKEY = process.env.FIREBASE_SECRET;
  const DBURL = "https://johndoshop-default-rtdb.europe-west1.firebasedatabase.app";
  const ADMIN  = 1363470410;

  const fmt = n => Number(n).toFixed(2).replace(".", ",") + "\u20ac";

  const dbGet = async path => {
    const r = await fetch(`${DBURL}/${path}.json?auth=${DBKEY}`);
    return r.json();
  };
  const dbSet = async (path, value) => {
    await fetch(`${DBURL}/${path}.json?auth=${DBKEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
  };
  const tg = async (chatId, text) => {
    try {
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
      });
    } catch(e) { console.error("tg:", e.message); }
  };

  try {
    const pending = await dbGet("pending_payments/" + paymentId);

    /* Paiement inconnu — notif admin pour créditer manuellement */
    if (!pending || !pending.userId) {
      await tg(ADMIN,
        "\u26A0\uFE0F <b>Paiement re\u00e7u non identifi\u00e9</b>\n\n" +
        "Payment ID : <code>" + paymentId + "</code>\n" +
        "Montant : <b>" + fmt(priceAmount) + "</b>\n\n" +
        "\u2757\uFE0F Cr\u00e9dite manuellement dans Firebase."
      );
      return res.status(200).json({ ok: true });
    }

    /* Anti double-crédit */
    if (pending.status === "credited") {
      return res.status(200).json({ ok: true, msg: "already credited" });
    }

    const { userId, tgId, name, handle, amount, type, items } = pending;
    const creditAmt = amount || priceAmount;
    const displayName = name || "Client";
    const displayHandle = handle ? " (" + handle + ")" : "";

    if (type === "deposit" || pending.orderId?.startsWith("dep_")) {
      /* ── DÉPÔT : créditer le solde ── */
      const userData = (await dbGet("users/" + userId)) || {};
      const currentBal = parseFloat(userData.balance || 0);
      const newBal = parseFloat((currentBal + creditAmt).toFixed(2));
      await dbSet("users/" + userId + "/balance", newBal);
      await dbSet("pending_payments/" + paymentId + "/status", "credited");

      /* Notif client */
      if (tgId) await tg(tgId,
        "\uD83D\uDCB0 <b>ACCESMAIL \u2014 Solde recharg\u00e9 !</b>\n\n" +
        "Bonjour <b>" + displayName + "</b>,\n\n" +
        "Ton solde a \u00e9t\u00e9 cr\u00e9dit\u00e9 de <b>" + fmt(creditAmt) + "</b>\n" +
        "Nouveau solde : <b>" + fmt(newBal) + "</b>\n\n" +
        "Ouvre la boutique pour acheter tes acc\u00e8s \uD83D\uDC47"
      );

      /* Notif admin */
      await tg(ADMIN,
        "\uD83D\uDCB8 <b>D\u00e9p\u00F4t re\u00e7u</b>\n\n" +
        "Client : <b>" + displayName + "</b>" + displayHandle + "\n" +
        "Montant : <b>" + fmt(creditAmt) + "</b>\n" +
        "Nouveau solde : <b>" + fmt(newBal) + "</b>"
      );

    } else {
      /* ── ACHAT PANIER : livraison déjà gérée par client-side poll ── */
      await dbSet("pending_payments/" + paymentId + "/status", "credited");

      /* Notif admin */
      await tg(ADMIN,
        "\uD83D\uDED2 <b>Achat confirm\u00e9</b>\n\n" +
        "Client : <b>" + displayName + "</b>" + displayHandle + "\n" +
        "Montant : <b>" + fmt(creditAmt) + "</b>\n" +
        (items ? "Commande : " + items : "")
      );
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[webhook] error:", err);
    await tg(ADMIN, "\u274C <b>Erreur webhook</b>\nID : <code>" + paymentId + "</code>\n" + err.message).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
