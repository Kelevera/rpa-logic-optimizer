import { useState, useEffect, useRef } from "react";

// ─── Example Input ────────────────────────────────────────────────────────────

const EXAMPLE_INPUT = `// UiPath Workflow: Insurance Claim Auto-Processor
// Process: Read Excel → Validate → Query SAP → Send Outlook email

Sequence "ProcessInsuranceClaims":
  1. Excel Application Scope: "claims_q4.xlsx"
     - Read Range → DataTable "ClaimsTable"

  2. ForEach row In ClaimsTable:
     a. Assign: claimId = row("ClaimID").ToString
     b. If NOT Regex.IsMatch(claimId, "CLM-\\d{8}"):
        - Log "Invalid format: " + claimId
        - Continue
     c. Click SAP button "btnSearchClaims"
     d. TypeInto SAP field "#claimSearch" → claimId
     e. WaitForElement SAP "#statusResult" timeout:5000ms
     f. GetText SAP "#statusResult" → statusText
     g. If statusText = "APPROVED":
        - SendEmail via Outlook:
            to: row("AdjusterEmail")
            subject: "Claim " + claimId + " Approved"
            body: "Please process payment for " + claimId
        - Excel: Write "SENT" → row("Status")
     h. Else If statusText = "REJECTED":
        - AppendLine "rejected_log.txt": claimId + "," + Now.ToString

  3. Excel: Save Workbook
  // Known issue: SAP screen takes 3–8s to respond, causes timeout errors`;

// ─── Static Sidebar Cards ─────────────────────────────────────────────────────

const STATIC_BOTTLENECKS = [
  { problem: "Selector fragility — UI element IDs change after SAP upgrades", fix: "Replace with LangChain semantic agent + self-healing selectors", severity: "high" },
  { problem: "Hardcoded sleep/wait — brittle timing causes random failures", fix: "Event-driven async patterns with LangGraph stateful workflows", severity: "high" },
  { problem: "Long-running loops block the RPA bot thread", fix: "Async Celery workers + Claude tool-calling for parallel processing", severity: "medium" },
  { problem: "No retry logic — single failure aborts entire batch", fix: "LangGraph retry nodes with exponential backoff + dead-letter queue", severity: "medium" },
  { problem: "Excel as data source — not scalable beyond ~10k rows", fix: "Migrate to pandas + SQLAlchemy with streaming reads", severity: "low" },
];

// ─── Package Map for requirements.txt ────────────────────────────────────────

const PACKAGE_MAP = {
  langchain_anthropic: "langchain-anthropic>=0.3.0",
  langchain_core: "langchain-core>=0.3.0",
  langchain_community: "langchain-community>=0.3.0",
  langchain_openai: "langchain-openai>=0.2.0",
  langgraph: "langgraph>=0.2.0",
  anthropic: "anthropic>=0.40.0",
  openai: "openai>=1.50.0",
  pandas: "pandas>=2.2.0",
  openpyxl: "openpyxl>=3.1.0",
  httpx: "httpx>=0.27.0",
  aiohttp: "aiohttp>=3.9.0",
  pydantic: "pydantic>=2.0.0",
  celery: "celery>=5.4.0",
  redis: "redis>=5.0.0",
  sqlalchemy: "sqlalchemy>=2.0.0",
  dotenv: "python-dotenv>=1.0.0",
  typing_extensions: "typing-extensions>=4.12.0",
  tenacity: "tenacity>=8.2.0",
  structlog: "structlog>=24.0.0",
  requests: "requests>=2.32.0",
};

const STDLIB = new Set([
  "asyncio","os","sys","re","json","logging","datetime","pathlib","typing",
  "time","math","io","abc","copy","functools","itertools","collections",
  "contextlib","dataclasses","enum","hashlib","uuid","base64","urllib",
  "http","email","smtplib","socket","threading","subprocess","shutil",
  "tempfile","traceback","warnings","inspect","operator","string","csv","random",
]);

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: { display:"flex", flexDirection:"column", height:"100vh", background:"#0d1117", color:"#cdd6f4", fontFamily:'"Outfit","Segoe UI",system-ui,sans-serif', overflow:"hidden" },
  nav: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", height:50, background:"#0d1117", borderBottom:"1px solid #21262d", flexShrink:0 },
  navLeft: { display:"flex", alignItems:"center", gap:16 },
  navRight: { display:"flex", alignItems:"center", gap:8 },
  logoBadge: { background:"linear-gradient(135deg,#22d3ee 0%,#8b5cf6 100%)", padding:"3px 10px", borderRadius:5, fontSize:11, fontWeight:700, color:"#fff", letterSpacing:"0.5px" },
  logoText: { fontSize:14, fontWeight:600, color:"#f0f6fc", letterSpacing:"-0.3px" },
  tagline: { fontSize:10, color:"#30363d", fontStyle:"italic" },
  freeBadge: { display:"flex", alignItems:"center", gap:4, padding:"4px 10px", background:"#161b22", border:"1px solid #21262d", borderRadius:20, fontSize:11 },
  btnNav: (v) => ({ padding:"5px 13px", fontSize:11, fontWeight:v==="pro"?600:500, background:v==="pro"?"linear-gradient(135deg,#0c1520,#1a0d2e)":"#161b22", border:v==="pro"?"1px solid #6d28d960":"1px solid #21262d", borderRadius:6, color:v==="pro"?"#a78bfa":"#8b949e", cursor:"pointer", fontFamily:'"Outfit",sans-serif' }),
  main: { display:"flex", flex:1, overflow:"hidden" },
  pane: { display:"flex", flexDirection:"column", flex:1, minWidth:0, borderRight:"1px solid #21262d" },
  paneHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", height:36, background:"#161b22", borderBottom:"1px solid #21262d", flexShrink:0 },
  paneTitle: { display:"flex", alignItems:"center", gap:8, fontSize:10, fontWeight:600, color:"#8b949e", letterSpacing:"0.8px", textTransform:"uppercase" },
  dot: (c) => ({ width:6, height:6, borderRadius:"50%", background:c, boxShadow:`0 0 6px ${c}`, flexShrink:0 }),
  paneSubtitle: { fontSize:10, color:"#30363d" },
  editorArea: { flex:1, position:"relative", overflow:"hidden" },
  monacoContainer: { position:"absolute", inset:0 },
  fallbackTA: { width:"100%", height:"100%", background:"#0d1117", border:"none", outline:"none", color:"#cdd6f4", resize:"none", fontFamily:'"JetBrains Mono","Fira Code",monospace', fontSize:13, lineHeight:"1.6", padding:16, boxSizing:"border-box" },
  centerCol: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, width:66, flexShrink:0, background:"#0d1117", borderRight:"1px solid #21262d" },
  btnConvert: (loading, disabled) => ({ writingMode:"vertical-lr", transform:"rotate(180deg)", padding:"20px 10px", background:loading?"linear-gradient(180deg,#0891b2,#06b6d4)":"linear-gradient(180deg,#22d3ee,#0891b2)", border:"none", borderRadius:8, color:"#0d1117", fontWeight:700, fontSize:10, letterSpacing:"2px", textTransform:"uppercase", cursor:disabled?"not-allowed":"pointer", fontFamily:'"Outfit",sans-serif', opacity:disabled?0.65:1, whiteSpace:"nowrap", transition:"all 0.2s", boxShadow:loading?"0 0 24px #22d3ee50":"0 0 12px #22d3ee25" }),
  btnExample: { writingMode:"vertical-lr", transform:"rotate(180deg)", padding:"9px 7px", background:"transparent", border:"1px solid #21262d", borderRadius:5, color:"#30363d", fontSize:9, fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", cursor:"pointer", fontFamily:'"Outfit",sans-serif', whiteSpace:"nowrap" },
  btnCopy: { padding:"3px 9px", fontSize:10, fontWeight:500, background:"#0d1117", border:"1px solid #21262d", borderRadius:4, color:"#8b949e", cursor:"pointer", fontFamily:'"Outfit",sans-serif', letterSpacing:"0.3px" },
  btnAction: (active, color) => ({ padding:"3px 9px", fontSize:10, fontWeight:600, background:active?`linear-gradient(135deg,${color}15,${color}08)`:"#0d1117", border:active?`1px solid ${color}40`:"1px solid #21262d", borderRadius:4, color:active?color:"#30363d", cursor:"pointer", fontFamily:'"Outfit",sans-serif' }),
  sidebar: { width:272, flexShrink:0, background:"#0d1117", borderLeft:"1px solid #21262d", display:"flex", flexDirection:"column", overflow:"hidden" },
  sidebarHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", borderBottom:"1px solid #21262d", flexShrink:0 },
  sidebarTitle: { fontSize:9, fontWeight:600, color:"#30363d", letterSpacing:"1.5px", textTransform:"uppercase" },
  sidebarClose: { background:"none", border:"none", color:"#30363d", cursor:"pointer", fontSize:17, lineHeight:1, padding:"0 2px" },
  sidebarBody: { flex:1, overflowY:"auto", padding:10 },
  sidebarReopenBtn: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", width:22, flexShrink:0, background:"#0d1117", borderLeft:"1px solid #21262d", cursor:"pointer", border:"none", color:"#30363d", fontSize:9, padding:0, fontFamily:'"Outfit",sans-serif' },
  emptyState: { textAlign:"center", padding:"32px 12px" },
  emptyText: { fontSize:11, color:"#30363d", lineHeight:"1.7" },
  summaryCard: { marginBottom:10, padding:"9px 11px", background:"#0c1a2e", border:"1px solid #1d4ed830", borderRadius:7, fontSize:11, color:"#60a5fa", lineHeight:"1.5" },
  insightCard: { marginBottom:7, borderRadius:7, overflow:"hidden", border:"1px solid #21262d" },
  insightProblem: { padding:"9px 11px", background:"#160d0d", borderBottom:"1px solid #2d1515" },
  insightFix: { padding:"9px 11px", background:"#0a160d" },
  insightLabel: (c) => ({ color:c, fontSize:9, fontWeight:700, marginBottom:5, display:"block", letterSpacing:"1px", textTransform:"uppercase" }),
  insightText: (c) => ({ fontSize:11, color:c, lineHeight:"1.55", userSelect:"text" }),
  severityBadge: (s) => { const m={high:{bg:"#450a0a",color:"#f87171"},medium:{bg:"#451a03",color:"#fb923c"},low:{bg:"#052e16",color:"#4ade80"}}; const t=m[s]||m.low; return { marginLeft:6, padding:"1px 5px", borderRadius:3, background:t.bg, color:t.color, fontSize:8, fontWeight:700, letterSpacing:"0.5px", textTransform:"uppercase" }; },
  staticLabel: { fontSize:9, color:"#21262d", letterSpacing:"1px", textTransform:"uppercase", textAlign:"center", padding:"6px 0 4px", borderBottom:"1px solid #161b22", marginBottom:8 },
  statusBar: { height:24, background:"#080b10", borderTop:"1px solid #21262d", display:"flex", alignItems:"center", gap:16, padding:"0 14px", flexShrink:0 },
  statusItem: { fontSize:10, color:"#30363d", display:"flex", alignItems:"center", gap:5, letterSpacing:"0.2px" },
  statusDot: { width:5, height:5, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 4px #22c55e", flexShrink:0 },
  toast: (t) => ({ position:"fixed", bottom:36, left:"50%", transform:"translateX(-50%)", padding:"9px 18px", borderRadius:8, fontSize:12, fontWeight:500, zIndex:9999, fontFamily:'"Outfit",sans-serif', display:"flex", alignItems:"center", gap:7, whiteSpace:"nowrap", background:t==="ok"?"#0a160d":"#160d0d", border:`1px solid ${t==="ok"?"#22c55e":"#ef4444"}`, color:t==="ok"?"#4ade80":"#f87171" }),
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [summary, setSummary] = useState("");
  const [toast, setToast] = useState(null);
  const [freeLeft, setFreeLeft] = useState(3);
  const [monacoReady, setMonacoReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hasConverted, setHasConverted] = useState(false);

  const inputContainerRef = useRef(null);
  const outputContainerRef = useRef(null);
  const inputEditorRef = useRef(null);
  const outputEditorRef = useRef(null);

  // Load Google Fonts
  useEffect(() => {
    if (document.getElementById("rpa-gfonts")) return;
    const link = document.createElement("link");
    link.id = "rpa-gfonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);

  // Load Monaco
  useEffect(() => {
    if (window.monaco) { setMonacoReady(true); return; }
    if (document.getElementById("monaco-loader")) return;
    const s = document.createElement("script");
    s.id = "monaco-loader";
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js";
    s.onload = () => {
      window.require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
      window.require(["vs/editor/editor.main"], () => setMonacoReady(true));
    };
    document.head.appendChild(s);
  }, []);

  // Init Monaco editors
  useEffect(() => {
    if (!monacoReady || !inputContainerRef.current || !outputContainerRef.current || inputEditorRef.current) return;
    const monaco = window.monaco;
    monaco.editor.defineTheme("rpa-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "keyword", foreground: "22d3ee", fontStyle: "bold" },
        { token: "string", foreground: "a78bfa" },
        { token: "comment", foreground: "34d399", fontStyle: "italic" },
        { token: "number", foreground: "fbbf24" },
        { token: "type", foreground: "60a5fa" },
        { token: "function", foreground: "f472b6" },
        { token: "decorator", foreground: "fb923c" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#cdd6f4",
        "editorLineNumber.foreground": "#30363d",
        "editorLineNumber.activeForeground": "#8b949e",
        "editorCursor.foreground": "#22d3ee",
        "editor.selectionBackground": "#264f7880",
        "editor.lineHighlightBackground": "#161b22",
        "editorGutter.background": "#0d1117",
        "scrollbarSlider.background": "#21262d80",
        "editorBracketMatch.background": "#22d3ee20",
        "editorBracketMatch.border": "#22d3ee",
      },
    });
    const commonOpts = { theme:"rpa-dark", fontSize:13, fontFamily:'"JetBrains Mono","Fira Code",monospace', fontLigatures:true, minimap:{enabled:false}, lineNumbers:"on", scrollBeyondLastLine:false, wordWrap:"on", padding:{top:16,bottom:16}, renderLineHighlight:"line", smoothScrolling:true, cursorBlinking:"smooth", automaticLayout:true };
    inputEditorRef.current = monaco.editor.create(inputContainerRef.current, { ...commonOpts, language:"plaintext", value:"" });
    outputEditorRef.current = monaco.editor.create(outputContainerRef.current, { ...commonOpts, language:"python", value:"# ⚡ Optimized LangChain agent will appear here after conversion...\n#\n# Hit 'Load Example' then 'Magic Convert' to get started.", readOnly:true });
    inputEditorRef.current.onDidChangeModelContent(() => setInput(inputEditorRef.current.getValue()));
    return () => {
      inputEditorRef.current?.dispose();
      outputEditorRef.current?.dispose();
      inputEditorRef.current = null;
      outputEditorRef.current = null;
    };
  }, [monacoReady]);

  useEffect(() => {
    if (outputEditorRef.current && output) outputEditorRef.current.setValue(output);
  }, [output]);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const loadExample = () => {
    if (inputEditorRef.current) inputEditorRef.current.setValue(EXAMPLE_INPUT);
    else setInput(EXAMPLE_INPUT);
    showToast("Example loaded — hit Magic Convert", "ok");
  };

  // ── Conversion — calls /api/convert serverless function ──
  const convert = async () => {
    const code = inputEditorRef.current?.getValue() || input;
    if (!code.trim()) { showToast("Paste RPA logic first", "err"); return; }
    if (freeLeft <= 0) { showToast("Daily limit reached — upgrade to Pro", "err"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.error) { showToast(`Error: ${data.error}`, "err"); return; }

      setOutput(data.code || "# No code returned");
      setBottlenecks(data.bottlenecks || []);
      setSummary(data.summary || "");
      setFreeLeft((p) => p - 1);
      setHasConverted(true);
      if (!sidebarOpen) setSidebarOpen(true);
      showToast("Conversion complete!", "ok");
    } catch (e) {
      showToast(`Error: ${e.message || "network failure"}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    const code = outputEditorRef.current?.getValue() || output;
    if (!code || code.startsWith("#")) { showToast("Nothing to copy yet", "err"); return; }
    try { await navigator.clipboard.writeText(code); showToast("Copied to clipboard!", "ok"); }
    catch { showToast("Copy failed", "err"); }
  };

  const downloadAsPy = () => {
    const code = outputEditorRef.current?.getValue() || output;
    if (!code || code.startsWith("#")) { showToast("Nothing to download yet", "err"); return; }
    const slug = summary ? summary.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,40) : `langchain_agent_${new Date().toISOString().slice(0,10)}`;
    const header = [`# Generated by RPA Logic Optimizer — The Career Builder`,`# Date: ${new Date().toISOString().slice(0,19).replace("T"," ")} UTC`,summary?`# Summary: ${summary}`:"",`# Stack: LangChain v0.2+ · LangGraph · Anthropic Claude`,``,""].filter(Boolean).join("\n");
    const blob = new Blob([header + code], { type:"text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}.py`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${slug}.py`, "ok");
  };

  const downloadRequirements = () => {
    const code = outputEditorRef.current?.getValue() || output;
    if (!code || code.startsWith("#")) { showToast("Nothing to analyse yet", "err"); return; }
    const importLines = code.match(/^(?:import|from)\s+[\w.]+/gm) || [];
    const detected = new Set();
    importLines.forEach((line) => {
      const root = line.replace(/^(?:import|from)\s+/,"").split(".")[0].trim();
      if (!STDLIB.has(root)) detected.add(root);
    });
    const resolved = [], unresolved = [];
    detected.forEach((pkg) => { PACKAGE_MAP[pkg] ? resolved.push(PACKAGE_MAP[pkg]) : unresolved.push(`# TODO: verify '${pkg}'`); });
    if (!resolved.some((r) => r.startsWith("anthropic"))) resolved.unshift("anthropic>=0.40.0");
    resolved.sort();
    const content = [`# requirements.txt — Generated by RPA Logic Optimizer`,`# Date: ${new Date().toISOString().slice(0,10)}`,`# Run:  pip install -r requirements.txt`,``,...resolved,...(unresolved.length?["","# Unresolved — verify manually:",...unresolved]:[]),``].join("\n");
    const blob = new Blob([content], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "requirements.txt";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded requirements.txt (${resolved.length} packages)`, "ok");
  };

  const hasOutput = output && !output.startsWith("#");

  return (
    <div style={S.root}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={S.logoBadge}>RPA → AI</span>
            <span style={S.logoText}>Logic Optimizer</span>
          </div>
          <span style={S.tagline}>Built for RPA Engineers transitioning to AI · The Career Builder</span>
        </div>
        <div style={S.navRight}>
          <div style={S.freeBadge}>
            <span style={{ color:"#22d3ee", fontWeight:700 }}>{freeLeft}</span>
            <span style={{ color:"#485768" }}>/3 free today</span>
          </div>
          <button style={S.btnNav("save")}>Save to Library</button>
          <button style={S.btnNav("pro")}>✦ Get Pro</button>
        </div>
      </nav>

      {/* Main */}
      <div style={S.main}>
        {/* Left Pane */}
        <div style={S.pane}>
          <div style={S.paneHeader}>
            <div style={S.paneTitle}><div style={S.dot("#22d3ee")} />Legacy RPA Logic / Pseudocode</div>
            <span style={S.paneSubtitle}>UiPath · Automation Anywhere · Blue Prism · XAML</span>
          </div>
          <div style={S.editorArea}>
            {monacoReady
              ? <div ref={inputContainerRef} style={S.monacoContainer} />
              : <textarea style={S.fallbackTA} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste UiPath workflow description, XAML snippet, or pseudocode here..." />}
          </div>
        </div>

        {/* Center */}
        <div style={S.centerCol}>
          <button onClick={convert} disabled={loading || freeLeft <= 0} style={S.btnConvert(loading, loading || freeLeft <= 0)}>
            {loading ? "Converting..." : "⚡ Magic Convert"}
          </button>
          <button onClick={loadExample} style={S.btnExample}>Load Example</button>
        </div>

        {/* Right Pane */}
        <div style={{ ...S.pane, borderRight:"none" }}>
          <div style={S.paneHeader}>
            <div style={S.paneTitle}><div style={S.dot("#a78bfa")} />Optimized Python + LangChain</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={copy} style={S.btnCopy} title="Copy to clipboard">⎘ Copy</button>
              <button onClick={downloadAsPy} style={S.btnAction(hasOutput, "#22d3ee")} title="Download .py — ready to run">↓ .py</button>
              <button onClick={downloadRequirements} style={S.btnAction(hasOutput, "#a78bfa")} title="Download requirements.txt">↓ reqs</button>
            </div>
          </div>
          <div style={S.editorArea}>
            {monacoReady
              ? <div ref={outputContainerRef} style={S.monacoContainer} />
              : <textarea style={{ ...S.fallbackTA, color:output?"#cdd6f4":"#30363d" }} value={output || "# ⚡ Optimized LangChain agent will appear here after conversion..."} readOnly />}
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen ? (
          <div style={S.sidebar}>
            <div style={S.sidebarHeader}>
              <span style={S.sidebarTitle}>Optimization Insights</span>
              <button onClick={() => setSidebarOpen(false)} style={S.sidebarClose}>×</button>
            </div>
            <div style={S.sidebarBody}>
              {hasConverted ? (
                <>
                  {summary && <div style={S.summaryCard}>✦ {summary}</div>}
                  {bottlenecks.map((b, i) => (
                    <div key={i} style={S.insightCard}>
                      <div style={S.insightProblem}>
                        <span style={S.insightLabel("#f87171")}>⚠ Bottleneck {i + 1}<span style={S.severityBadge(b.severity)}>{b.severity}</span></span>
                        <span style={S.insightText("#fca5a5")}>{b.problem}</span>
                      </div>
                      <div style={S.insightFix}>
                        <span style={S.insightLabel("#4ade80")}>✓ AI Fix</span>
                        <span style={S.insightText("#86efac")}>{b.fix}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize:9, color:"#21262d", textAlign:"center", marginTop:12, letterSpacing:"0.5px" }}>POWERED BY CLAUDE HAIKU 4.5</div>
                </>
              ) : (
                <>
                  <div style={S.emptyState}>
                    <div style={{ fontSize:24, marginBottom:10, opacity:0.3 }}>⚡</div>
                    <div style={S.emptyText}>Paste RPA logic and hit <strong style={{ color:"#22d3ee" }}>Magic Convert</strong> to see AI-detected bottlenecks.</div>
                  </div>
                  <div style={S.staticLabel}>Common RPA Bottlenecks</div>
                  {STATIC_BOTTLENECKS.map((b, i) => (
                    <div key={i} style={S.insightCard}>
                      <div style={S.insightProblem}>
                        <span style={S.insightLabel("#f87171")}>⚠ Pattern {i + 1}<span style={S.severityBadge(b.severity)}>{b.severity}</span></span>
                        <span style={S.insightText("#fca5a5")}>{b.problem}</span>
                      </div>
                      <div style={S.insightFix}>
                        <span style={S.insightLabel("#4ade80")}>✓ AI Fix</span>
                        <span style={S.insightText("#86efac")}>{b.fix}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setSidebarOpen(true)} style={S.sidebarReopenBtn}>
            <span style={{ fontSize:12 }}>‹</span>
            {"Insights".split("").map((c, i) => <span key={i} style={{ fontSize:9 }}>{c}</span>)}
          </button>
        )}
      </div>

      {/* Status Bar */}
      <div style={S.statusBar}>
        <span style={S.statusItem}><div style={S.statusDot} />Claude Haiku 4.5</span>
        <span style={S.statusItem}>UiPath 2024.10 · 14yr Insurance Domain</span>
        <span style={S.statusItem}>{loading ? "⟳ Converting..." : "Ready"}</span>
        <span style={{ ...S.statusItem, marginLeft:"auto" }}>{monacoReady ? "Monaco Editor v0.44" : "Loading editor..."}</span>
      </div>

      {toast && (
        <div style={S.toast(toast.type)}>
          <span>{toast.type === "ok" ? "✓" : "✗"}</span>{toast.msg}
        </div>
      )}
    </div>
  );
}
