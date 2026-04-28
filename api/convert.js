// api/convert.js — Vercel Serverless Function
// Proxies Anthropic API. Key stays server-side, never exposed to browser.

const SYSTEM_PROMPT = `You are an expert RPA-to-AI conversion specialist with 14 years insurance industry expertise and deep knowledge of UiPath, Automation Anywhere, Blue Prism, and modern agentic AI frameworks: LangChain v0.2+, LangGraph, and Anthropic Claude API tool-calling.

Your job: Convert UiPath workflows, XAML snippets, or pseudocode into production-ready Python using LangChain v0.2+. Include proper imports, async support, error handling, structured logging, and professional inline comments.

CRITICAL: Return ONLY a valid JSON object. No markdown. No backticks. No explanation. No preamble.

JSON schema:
{
  "code": "complete Python string — use \\n for newlines, escape all quotes",
  "bottlenecks": [
    { "problem": "specific detected issue from the input", "fix": "concrete LangChain/AI solution", "severity": "high|medium|low" }
  ],
  "summary": "one concise sentence describing what was converted and why it is better"
}

Rules for generated code:
- Always import from langchain_core, langchain_community, langchain_anthropic
- Prefer async agents with proper exception handling
- Replace SAP/Outlook UI automation with API calls where logical
- Replace sleep/wait with event-driven patterns
- Replace fragile selectors with semantic AI agents
- Add a __main__ block with asyncio.run()`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code } = req.body || {};

  if (!code?.trim()) {
    return res.status(400).json({ error: "No code provided" });
  }

  // Basic abuse guard — cap input size
  if (code.length > 8000) {
    return res.status(400).json({ error: "Input too large (max 8000 chars). Paste a focused snippet." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfigured — ANTHROPIC_API_KEY not set" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Convert this RPA workflow to production-ready LangChain Python:\n\n${code}`,
          },
        ],
      }),
    });

    const data = await upstream.json();

    if (data.error) {
      console.error("Anthropic API error:", data.error);
      return res.status(502).json({ error: data.error.message || data.error.type });
    }

    const raw = data.content?.[0]?.text || "";
    if (!raw) {
      return res.status(502).json({ error: "Empty response from model" });
    }

    // Robust JSON extraction
    let parsed = null;

    try {
      const clean = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    // Last resort: return raw as code block
    if (!parsed) {
      return res.json({
        code: raw,
        bottlenecks: [],
        summary: "Raw output — JSON parsing failed. Code shown as-is.",
      });
    }

    return res.json({
      code: parsed.code || "# Model returned no code field",
      bottlenecks: parsed.bottlenecks || [],
      summary: parsed.summary || "",
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message || "Unexpected server error" });
  }
}
