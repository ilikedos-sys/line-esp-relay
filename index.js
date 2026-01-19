import express from "express";
import fetch from "node-fetch";

const app = express();

const LINE_TOKEN = process.env.LINE_TOKEN;
const USER_ID = process.env.USER_ID;

app.get("/ingest", async (req, res) => {
  const { msg = "ESP8266 data", ...params } = req.query;

  let text = "📡 ESP8266 通知\n";
  const taiwanTime = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  text += `🕒 ${taiwanTime}\n`;
  //text += `🕒 ${new Date().toLocaleString("zh-TW")}\n`;
  if (msg) text += `\n${msg}\n`;
  for (const [k, v] of Object.entries(params)) {
    text += `• ${k} = ${v}\n`;
  }

  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: USER_ID,
        messages: [{ type: "text", text }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ ok: false, line_status: r.status, line_error: t });
    }

    res.json({ ok: true, sent: text });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/", (req, res) => res.send("OK"));

app.listen(process.env.PORT || 3000, () => console.log("Server started"));
