import crypto from "crypto";

/* Vérifie que initData vient vraiment de Telegram, pour cet utilisateur précis —
   impossible à falsifier sans connaître le token du bot (jamais exposé au client).
   Algorithme officiel Telegram : https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return null;

  // Anti-rejeu : refuser une initData vieille de plus de 24h
  const authDate = parseInt(params.get("auth_date") || "0", 10);
  if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null;

  const userStr = params.get("user");
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr);
    return { id: String(user.id), name: [user.first_name, user.last_name].filter(Boolean).join(" "), handle: user.username ? "@" + user.username : "" };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { initData, op, amount, orderId } = req.body;
  if (!initData || !op || amount === undefined) { res.status(400).json({ error: "Missing fields" }); return; }

  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) { res.status(401).json({ error: "initData invalide — requête refusée" }); return; }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "Montant invalide" }); return; }

  const DBKEY = process.env.FIREBASE_SECRET;
  const DBURL = "https://johndoshop-default-rtdb.europe-west1.firebasedatabase.app";
  const uid = "u" + tgUser.id; // même format que me.id côté client — ne jamais changer sans migrer les données existantes

  try {
    // Anti-double-traitement : chaque opération liée à une commande précise ne peut
    // être appliquée qu'une seule fois, même en cas de double-clic ou de retry réseau.
    if (orderId) {
      const dedupKey = `balance_ops/${orderId}`;
      const already = await fetch(`${DBURL}/${dedupKey}.json?auth=${DBKEY}`).then(r => r.json());
      if (already) { res.status(200).json({ ok: true, alreadyProcessed: true }); return; }
      await fetch(`${DBURL}/${dedupKey}.json?auth=${DBKEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, amount: amt, uid, at: Date.now() })
      });
    }

    const balSnap = await fetch(`${DBURL}/users/${uid}/balance.json?auth=${DBKEY}`).then(r => r.json());
    const curBal = parseFloat(balSnap || 0);

    let newBal;
    if (op === "debit") {
      if (curBal < amt) { res.status(400).json({ error: "Solde insuffisant", balance: curBal }); return; }
      newBal = parseFloat((curBal - amt).toFixed(2));
    } else if (op === "credit") {
      newBal = parseFloat((curBal + amt).toFixed(2));
    } else {
      res.status(400).json({ error: "op invalide (attendu: debit ou credit)" }); return;
    }

    await fetch(`${DBURL}/users/${uid}/balance.json?auth=${DBKEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBal)
    });

    // S'assurer que le profil existe (nom/handle) pour un client tout juste vérifié via initData
    await fetch(`${DBURL}/users/${uid}.json?auth=${DBKEY}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tgUser.name, handle: tgUser.handle })
    }).catch(() => {});

    res.status(200).json({ ok: true, balance: newBal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
