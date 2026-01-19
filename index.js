import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();

const LINE_TOKEN = process.env.LINE_TOKEN;
const USER_ID = process.env.USER_ID;

// 同樣內容 3 秒內不重送
const DEDUP_WINDOW_MS = 3000;

let lastHash = "";
let lastTimestamp = 0;

// === 絕對台灣時間（UTC+8）===
function taiwanTime() {
  const nowUtcMs = Date.now();                 // UTC timestamp
  const taiwanMs = nowUtcMs + 8 * 60 * 60 * 1000;
  const d = new Date(taiwanMs);

  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");

  return `${Y}/${M}/${D} ${h}:${m}:${s}`;
}

app.get("/ingest", async (req, res) => {
  try {
    const { msg = "ESP8266 data", ...params } = req.query;

    const timeStr = taiwanTime();

    let text = "📡 ESP8266 通知\n";
    text += `🕒 ${timeStr} (UTC+8 Taiwan)\n\n`;

    if (msg) text += `${msg}\n`;
    for (const [k, v] of Object.entries(params)) {
      text += `• ${k} = ${v}\n`;
    }

    // 去重
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const now = Date.now();
    if (hash === lastHash && now - lastTimestamp < DEDUP_WINDOW_MS) {
      return res.json({ ok: true, dedup: true });
    }
    lastHash = hash;
    lastTimestamp = now;

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
      return res.status(500).json({ ok: false, line_error: t });
    }

    res.json({ ok: true, sent: text });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/", (_, res) => res.send("OK"));

app.listen(process.env.PORT || 3000, () =>
  console.log("Server started")
);
