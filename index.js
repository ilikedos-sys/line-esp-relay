import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();

// 從 Render 環境變數讀取
const LINE_TOKEN = process.env.LINE_TOKEN;
const USER_ID = process.env.USER_ID;

// ===== 設定區 =====
// 同樣訊息在這段時間內不會重複送（毫秒）
const DEDUP_WINDOW_MS = 3000;
// ==================

let lastHash = "";
let lastTimestamp = 0;

app.get("/ingest", async (req, res) => {
  try {
    const { msg = "ESP8266 data", ...params } = req.query;

    // 台灣時間
    const taiwanTime = new Date().toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
    });

    // 組合訊息內容
    let text = "📡 ESP8266 通知\n";
    text += `🕒 ${taiwanTime}\n`;

    if (msg) {
      text += `\n${msg}\n`;
    }

    for (const [k, v] of Object.entries(params)) {
      text += `• ${k} = ${v}\n`;
    }

    // ===== 去重機制 =====
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const now = Date.now();

    if (hash === lastHash && now - lastTimestamp < DEDUP_WINDOW_MS) {
      return res.json({
        ok: true,
        dedup: true,
        note: "Duplicate message ignored",
      });
    }

    lastHash = hash;
    lastTimestamp = now;
    // ====================

    // 推播到 LINE
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
      const errText = await r.text();
      return res.status(500).json({
        ok: false,
        line_status: r.status,
        line_error: errText,
      });
    }

    res.json({
      ok: true,
      sent: text,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String(err),
    });
  }
});

// 健康檢查
app.get("/", (req, res) => {
  res.send("OK");
});

// 啟動伺服器
app.listen(process.env.PORT || 3000, () => {
  console.log("LINE ESP relay server started");
});
