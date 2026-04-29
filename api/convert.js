// api/convert.js — Vercel Serverless Function
// Proxies Anthropic API. Key stays server-side, never exposed to browser.

const SYSTEM_PROMPT = `You are an expert RPA-to-AI conversion specialist with deep knowledge of UiPath, Automation Anywhere, Blue Prism, LangChain v0.2+, LangGraph, and Anthropic Claude API.

Convert the user's RPA workflow into production-ready Python using LangChain v0.2+.

RESPOND USING EXACTLY THIS FORMAT (XML tags):

<code>
Complete Python code here. Use proper indentation. Include imports, async patterns, error handling, and a __main__ block.
</code>

<bottleneck severity="high">
<problem>Describe a specific bottleneck detected in the input</problem>
<fix>Concrete LangChain/AI solution for this bottleneck</fix>
</bottleneck>

<bottleneck severity="medium">
<problem>Another bottleneck</problem>
<fix>Its fix</fix>
</bottleneck>

<summary>One sentence describing what was converted and why the new version is better.</summary>

RULES:
- Always use langchain_core, langchain_anthropic imports
- Replace UI automation (clicks, selectors, waits) with async API calls
- Replace sleep/wait with event-driven patterns
- Add structured logging and error handling
- Include at least 2 bottleneck tags
- Output ONLY the XML tags above, nothing else`;

function extractTag(text, tag) {
  const regex = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractBottlenecks(text) {
  const bottlenecks = [];
  const regex = /<bottleneck\s+severity="(\w+)">\s*<problem>([\s\S]*?)<\/problem>\s*<fix>([\s\S]*?)<\/fix>\s*<\/bottleneck>/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    bottlenecks.push({
      severity: match[1].toLowerCase(),
      problem: match[2].trim(),
      fix: match[3].trim(),
    });
  }
  return bottlenecks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body || {};

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'No code provided' });
  }

  if (code.length > 8000) {
    return res.status(400).json({ error: 'Input too large (max 8000 chars)' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: 'Convert this RPA workflow to production-ready LangChain Python:\n\n' + code,
          },
        ],
      }),
    });

    const data = await upstream.json();

    if (data.error) {
      return res.status(502).json({ error: data.error.message || data.error.type });
    }

    const raw = (data.content && data.content[0] && data.content[0].text) || '';
    if (!raw) {
      return res.status(502).json({ error: 'Empty response from model' });
    }

    var extractedCode = extractTag(raw, 'code');
    var bottlenecks = extractBottlenecks(raw);
    var summary = extractTag(raw, 'summary');

    return res.json({
      code: extractedCode || raw,
      bottlenecks: bottlenecks.length > 0 ? bottlenecks : [],
      summary: summary || (extractedCode ? 'Conversion complete.' : 'Raw output shown.'),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
