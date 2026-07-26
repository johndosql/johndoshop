export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { chatIds, text } = req.body;
  if (!chatIds?.length || !text) {
    res.status(400).json({ error: "Missing fields" }); return;
  }

  let sent = 0, failed = 0;

  for (const chatId of chatIds) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
        }
      );
      const data = await response.json();
      if (data.ok) sent++; else failed++;
    } catch (e) { failed++; }
    // Pause pour éviter le rate-limit Telegram (30 msg/sec max)
    await new Promise(r => setTimeout(r, 50));
  }

  res.status(200).json({ sent, failed, total: chatIds.length });
}
