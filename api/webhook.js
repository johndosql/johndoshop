export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") { res.status(200).json({ ok: true }); return; }

  const update = req.body;
  const BOT = process.env.BOT_TOKEN;

  async function tg(method, body) {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return r.json();
  }

  // ── Commande /start ──────────────────────────────
  if (update.message && update.message.text && update.message.text.startsWith("/start")) {
    const chatId = update.message.chat.id;
    const user   = update.message.from;
    const name   = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Client";
    const handle = user.username ? "@" + user.username : "";
    const uid    = user.id;

    const caption =
      `👋 Bienvenue sur <b>ACCESMAIL</b>, ${name} !\n\n` +
      `Votre ID : <code>${uid}</code>\n\n` +
      `🤖 Bot : @accesmail_bot\n` +
      `💬 Support : @johndosql\n\n` +
      `📧 Accès email disponibles dans + de 50 pays\n` +
      `💳 Paiement en crypto\n` +
      `📦 Livraison instantanée et automatique\n\n` +
      `👇 Clique sur le bouton <b>ACCESMAIL</b> en bas à gauche pour ouvrir la boutique !\n\n` +
      `<i>Développé par @johndosql</i>`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: "🛍 Ouvrir la boutique",
          web_app: { url: "https://johndosql.github.io/johndoshop/" }
        }
      ]]
    };

    // Si tu as une image logo hébergée — remplace l'URL ci-dessous
    // Sinon on envoie juste le message texte
    const LOGO_URL = process.env.LOGO_URL || "";

    if (LOGO_URL) {
      await tg("sendPhoto", {
        chat_id: chatId,
        photo: LOGO_URL,
        caption,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    } else {
      await tg("sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    }

    // Sauvegarder l'utilisateur dans Firebase si besoin (optionnel)
  }

  res.status(200).json({ ok: true });
}
