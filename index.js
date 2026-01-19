import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();

const LINE_TOKEN = process.env.LINE_TOKEN;
const USER_ID = process.env.USER_ID;

// 同樣訊息在這段時間內不會重複送（毫秒）
const DEDUP_WINDOW_MS = 3000;

let lastHash = "";
let lastTimestamp = 0;

// 不依賴 timeZone 資料庫：用 UTC+8 固定換算台灣時間
function taipeiTimeString(date = new Date()) {
  const t = date.getTime() + 8 * 60 * 60 * 1000; // +08:00
  const d = new Date(t);

  // 用 UTC 的 getter 取值（避免受到伺服器本地時區影響）
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

app.get("/ingest", async (req, res) => {
  try {
    const { msg = "ESP8266 data", ...params } = req.query;

    const twTime = taipeiTimeString(new Date());

    let text = "📡 ESP8266 通知\n";
    text += `🕒 ${twTime} (Taipei)\n`;

    if (msg) text += `\n${msg}\n`;

    for (const [k, v] of Object.entries(params)) {
      text += `• ${k} = ${v}\n`;
    }

    // 去重：同內容短時間內只送一次
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
