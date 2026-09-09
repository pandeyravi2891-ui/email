/**
 * ThreadPulse AI — Email Thread Detector & Analytics Dashboard
 * Frontend Engine & State Manager
 */

const API_BASE = ""; // Same origin (Flask serves both frontend and /api endpoints)

// --- State Management ---
let sessionState = {
  history: [],
  kpis: {
    total: 0,
    threads: 0,
    standalone: 0,
    confidenceSum: 0,
  },
  activeFilter: "all",
  searchQuery: "",
};

// Preset Sample Datasets for 1-Click Testing
const SAMPLES = {
  "reply-full": {
    subject: "Re: Q3 Product Roadmap & Scope Clarification",
    body: "Thanks for the quick response, John!\n\nI reviewed your updated notes and agree with the proposed phase 1 deliverables. Let's schedule the kick-off call for Thursday at 10:00 AM as discussed.\n\nBest,\nElena",
    inReplyTo: "<orig-scope-20260901@acme.corp>",
    references: "<thread-init-001@acme.corp> <orig-scope-20260901@acme.corp>",
  },
  "quote-body": {
    subject: "Feedback on proposed design wireframes",
    body: "Here are my revisions for the mobile checkout mockup.\n\nOn Tue, Sep 8, Sarah Jenkins wrote:\n> Can everyone please check the checkout button contrast ratio?\n> We need to finalize before tomorrow's staging freeze.\n\nYes, I bumped the button contrast to WCAG AAA compliance.",
    inReplyTo: "",
    references: "",
  },
  "standalone-sales": {
    subject: "Introducing Scalable Cloud Infrastructure for Enterprise Teams",
    body: "Dear Engineering Leadership,\n\nI hope this email finds you well. I noticed your recent expansion into multi-region clusters. Our platform helps engineering organizations cut cloud compute bills by 35% with automated spot instance optimization.\n\nWould you have 15 minutes next Tuesday for a brief introductory call?\n\nBest regards,\nDavid Miller | CloudScale Inc.",
    inReplyTo: "",
    references: "",
  },
  "fwd-approval": {
    subject: "Fwd: Urgent: Executive Approval Needed for Server Fleet Expansion",
    body: "Forwarding this for your immediate review and sign-off.\n\n---------- Forwarded message ---------\nFrom: Marcus Vance <m.vance@infra.corp>\nDate: Mon, Sep 7, 2026 at 4:15 PM\nSubject: Urgent: Executive Approval Needed for Server Fleet Expansion\nTo: DevOps Leads <leads@infra.corp>\n\nTeam, we need approval on the attached purchase requisition before Friday close of business.",
    inReplyTo: "",
    references: "",
  },
};

// Sample batch payload
const SAMPLE_BATCH = [
  {
    id: "msg-101",
    sender: "Sarah (Product)",
    subject: "Sprint 24 Architecture Proposal",
    body: "Hi team, attached is the architectural proposal for the streaming pipeline. Please review the database schema section.",
    headers: {}
  },
  {
    id: "msg-102",
    sender: "Liam (Eng Lead)",
    subject: "Re: Sprint 24 Architecture Proposal",
    body: "Thanks Sarah. The schema looks solid, but I suggest indexing user_id on the telemetry table to prevent bottlenecking.",
    headers: { "In-Reply-To": "<sprint24-init@domain.com>" }
  },
  {
    id: "msg-103",
    sender: "Outreach Bot",
    subject: "Supercharge your sales with LeadStream AI",
    body: "Hello, discover how LeadStream AI generates 3x more qualified leads for B2B enterprises. Book a free 10-minute demo today.",
    headers: {}
  },
  {
    id: "msg-104",
    sender: "Sarah (Product)",
    subject: "Re: Sprint 24 Architecture Proposal",
    body: "Good catch Liam! On Mon, Liam wrote: > I suggest indexing user_id\n\nI have updated the migration script with the composite index.",
    headers: { "In-Reply-To": "<sprint24-reply1@domain.com>", "References": "<sprint24-init@domain.com>" }
  }
];

// --- DOM Elements ---
const dom = {
  // Navigation
  tabs: document.querySelectorAll(".nav-tab"),
  views: document.querySelectorAll(".view-panel"),
  navHistoryCount: document.getElementById("nav-history-count"),
  serverStatus: document.getElementById("server-status"),
  statusLabel: document.getElementById("status-label"),

  // KPIs
  kpiTotal: document.getElementById("kpi-total"),
  kpiThreads: document.getElementById("kpi-threads"),
  kpiThreadPct: document.getElementById("kpi-thread-pct"),
  kpiThreadBar: document.getElementById("kpi-thread-bar"),
  kpiStandalone: document.getElementById("kpi-standalone"),
  kpiStandalonePct: document.getElementById("kpi-standalone-pct"),
  kpiStandaloneBar: document.getElementById("kpi-standalone-bar"),
  kpiConfidence: document.getElementById("kpi-confidence"),
  kpiConfidenceBar: document.getElementById("kpi-confidence-bar"),

  // Studio Inputs
  subject: document.getElementById("subject"),
  clearSubject: document.getElementById("clear-subject"),
  body: document.getElementById("body"),
  charCount: document.getElementById("char-count"),
  wordCount: document.getElementById("word-count"),
  inReplyTo: document.getElementById("in-reply-to"),
  references: document.getElementById("references"),
  analyzeBtn: document.getElementById("analyze-btn"),
  resetBtn: document.getElementById("reset-btn"),
  statusMessage: document.getElementById("status-message"),
  sampleChips: document.querySelectorAll(".sample-chip"),

  // Results Hub
  resultEmpty: document.getElementById("result-empty"),
  resultActive: document.getElementById("result-active"),
  verdictBanner: document.getElementById("verdict-banner"),
  verdictIcon: document.getElementById("verdict-icon"),
  verdictBadge: document.getElementById("verdict-badge"),
  verdictTitle: document.getElementById("verdict-title"),
  verdictSubtitle: document.getElementById("verdict-subtitle"),
  verdictScore: document.getElementById("verdict-score"),

  // Thread Chain Flow
  chainStatusBadge: document.getElementById("chain-status-badge"),
  nodePrevious: document.getElementById("node-previous"),
  nodePrevSnippet: document.getElementById("node-prev-snippet"),
  threadConnector: document.getElementById("thread-connector"),
  nodeCurrent: document.getElementById("node-current"),
  nodeCurrentSeq: document.getElementById("node-current-seq"),
  nodeCurrentSubject: document.getElementById("node-current-subject"),
  nodeCurrentSnippet: document.getElementById("node-current-snippet"),

  // Signal Matrix
  sigModelStatus: document.getElementById("sig-model-status"),
  sigModelBar: document.getElementById("sig-model-bar"),
  sigSubjectStatus: document.getElementById("sig-subject-status"),
  sigSubjectClean: document.getElementById("sig-subject-clean"),
  sigHeadersStatus: document.getElementById("sig-headers-status"),
  sigHeadersSub: document.getElementById("sig-headers-sub"),
  sigQuotesStatus: document.getElementById("sig-quotes-status"),
  sigQuotesSub: document.getElementById("sig-quotes-sub"),

  // Clues & Quoted text
  reasonsList: document.getElementById("reasons-list"),
  quotedSnippetBox: document.getElementById("quoted-snippet-box"),
  snippetQuoteText: document.getElementById("snippet-quote-text"),

  // Probabilities
  probReplyVal: document.getElementById("prob-reply-val"),
  probReplyBar: document.getElementById("prob-reply-bar"),
  probNewVal: document.getElementById("prob-new-val"),
  probNewBar: document.getElementById("prob-new-bar"),

  // Batch Scanner
  batchJsonInput: document.getElementById("batch-json-input"),
  btnLoadSampleBatch: document.getElementById("btn-load-sample-batch"),
  btnRunBatch: document.getElementById("btn-run-batch"),
  batchEmpty: document.getElementById("batch-empty"),
  batchSummary: document.getElementById("batch-summary"),
  batchClustersCount: document.getElementById("batch-clusters-count"),
  batchThreadCount: document.getElementById("batch-thread-count"),
  batchStandaloneCount: document.getElementById("batch-standalone-count"),
  clustersContainer: document.getElementById("clusters-container"),

  // History & Logs
  historyTbody: document.getElementById("history-tbody"),
  countAll: document.getElementById("count-all"),
  countThreads: document.getElementById("count-threads"),
  countNew: document.getElementById("count-new"),
  filterPills: document.querySelectorAll(".filter-pill"),
  historySearch: document.getElementById("history-search"),
  btnExportHistory: document.getElementById("btn-export-history"),
  btnClearHistory: document.getElementById("btn-clear-history"),

  // Raw EML Modal
  rawModal: document.getElementById("raw-modal"),
  btnRawModalOpen: document.getElementById("btn-raw-modal-open"),
  btnRawModalClose: document.getElementById("btn-raw-modal-close"),
  btnRawCancel: document.getElementById("btn-raw-cancel"),
  btnRawParse: document.getElementById("btn-raw-parse"),
  rawEmailInput: document.getElementById("raw-email-input"),
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  loadSavedHistory();
  bindEvents();
  checkBackendHealth();
  updateKPIs();
  renderHistoryTable();

  // Populate Batch input with default sample
  dom.batchJsonInput.value = JSON.stringify({ emails: SAMPLE_BATCH }, null, 2);
});

// --- Event Listeners ---
function bindEvents() {
  // Tab Switching
  dom.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.target;
      dom.tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      dom.views.forEach((view) => {
        if (view.id === targetId) {
          view.hidden = false;
          view.classList.add("active");
        } else {
          view.hidden = true;
          view.classList.remove("active");
        }
      });
    });
  });

  // Sample Chips
  dom.sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.sample;
      if (SAMPLES[key]) {
        loadPresetSample(SAMPLES[key]);
      }
    });
  });

  // Body Input Live Counters
  dom.body.addEventListener("input", updateTextStats);

  // Subject clear button visibility
  dom.subject.addEventListener("input", () => {
    dom.clearSubject.hidden = !dom.subject.value;
  });
  dom.clearSubject.addEventListener("click", () => {
    dom.subject.value = "";
    dom.clearSubject.hidden = true;
    dom.subject.focus();
  });

  // Analyze Button & Keyboard Shortcut
  dom.analyzeBtn.addEventListener("click", handleAnalyze);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleAnalyze();
    }
  });

  // Reset Button
  dom.resetBtn.addEventListener("click", resetStudioForm);

  // Raw Email Modal
  dom.btnRawModalOpen.addEventListener("click", () => { dom.rawModal.hidden = false; });
  dom.btnRawModalClose.addEventListener("click", () => { dom.rawModal.hidden = true; });
  dom.btnRawCancel.addEventListener("click", () => { dom.rawModal.hidden = true; });
  dom.btnRawParse.addEventListener("click", parseRawEmail);

  // Batch Scanner
  dom.btnLoadSampleBatch.addEventListener("click", () => {
    dom.batchJsonInput.value = JSON.stringify({ emails: SAMPLE_BATCH }, null, 2);
  });
  dom.btnRunBatch.addEventListener("click", handleBatchScan);

  // History Filtering & Search
  dom.filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      dom.filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      sessionState.activeFilter = pill.dataset.filter;
      renderHistoryTable();
    });
  });

  dom.historySearch.addEventListener("input", (e) => {
    sessionState.searchQuery = e.target.value.toLowerCase().trim();
    renderHistoryTable();
  });

  dom.btnExportHistory.addEventListener("click", exportHistoryJSON);
  dom.btnClearHistory.addEventListener("click", clearHistory);
}

// --- Check Backend Health ---
async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("Health check returned error");
    const data = await res.json();
    if (data.status === "ok") {
      dom.statusLabel.textContent = "Model Service: Connected";
      dom.serverStatus.classList.remove("offline");
    }
  } catch (err) {
    dom.statusLabel.textContent = "Model Service: Reconnecting...";
  }
}

// --- Word & Character Counters ---
function updateTextStats() {
  const text = dom.body.value;
  dom.charCount.textContent = `${text.length} chars`;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCount.textContent = `${words} words`;
}

// --- Load Preset Sample ---
function loadPresetSample(sample) {
  dom.subject.value = sample.subject;
  dom.body.value = sample.body;
  dom.inReplyTo.value = sample.inReplyTo || "";
  dom.references.value = sample.references || "";
  dom.clearSubject.hidden = false;
  updateTextStats();

  const accordion = document.getElementById("headers-accordion");
  if (sample.inReplyTo || sample.references) {
    accordion.open = true;
  }

  dom.statusMessage.textContent = "Scenario loaded. Click 'Analyze Thread' or press Ctrl+Enter.";
  dom.statusMessage.className = "form-status";
}

// --- Parse Raw RFC822 / EML Email Text ---
function parseRawEmail() {
  const raw = dom.rawEmailInput.value;
  if (!raw.trim()) {
    alert("Please paste raw email headers and body first.");
    return;
  }

  let subject = "";
  let inReplyTo = "";
  let references = "";
  let bodyLines = [];
  let inHeaders = true;

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inHeaders) {
      if (line.trim() === "") {
        inHeaders = false;
        continue;
      }
      const matchSub = line.match(/^Subject:\s*(.*)$/i);
      const matchInReply = line.match(/^In-Reply-To:\s*(.*)$/i);
      const matchRef = line.match(/^References:\s*(.*)$/i);

      if (matchSub) subject = matchSub[1].trim();
      else if (matchInReply) inReplyTo = matchInReply[1].trim();
      else if (matchRef) references = matchRef[1].trim();
    } else {
      bodyLines.push(line);
    }
  }

  const bodyText = inHeaders ? raw : bodyLines.join("\n").trim();

  dom.subject.value = subject || dom.subject.value;
  dom.body.value = bodyText || raw;
  dom.inReplyTo.value = inReplyTo || dom.inReplyTo.value;
  dom.references.value = references || dom.references.value;
  dom.clearSubject.hidden = !dom.subject.value;
  updateTextStats();

  if (inReplyTo || references) {
    document.getElementById("headers-accordion").open = true;
  }

  dom.rawModal.hidden = true;
  dom.statusMessage.textContent = "Raw email parsed and loaded successfully!";
  dom.statusMessage.className = "form-status";
}

// --- Reset Studio Form ---
function resetStudioForm() {
  dom.subject.value = "";
  dom.body.value = "";
  dom.inReplyTo.value = "";
  dom.references.value = "";
  dom.clearSubject.hidden = true;
  updateTextStats();
  dom.statusMessage.textContent = "";
  dom.resultActive.hidden = true;
  dom.resultEmpty.hidden = false;
}

// --- Analyze Single Email ---
async function handleAnalyze() {
  const subject = dom.subject.value.trim();
  const body = dom.body.value.trim();
  const inReplyTo = dom.inReplyTo.value.trim();
  const references = dom.references.value.trim();

  if (!subject && !body) {
    dom.statusMessage.textContent = "Please provide an email subject or message body to analyze.";
    dom.statusMessage.className = "form-status error";
    dom.subject.focus();
    return;
  }

  dom.analyzeBtn.disabled = true;
  dom.analyzeBtn.querySelector(".btn-text").textContent = "Analyzing...";
  dom.statusMessage.textContent = "Evaluating sequence patterns and RFC headers...";
  dom.statusMessage.className = "form-status";

  const payload = {
    subject,
    body,
    headers: {
      "In-Reply-To": inReplyTo,
      "References": references,
    },
  };

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analysis failed.");

    renderAnalysisResult(data, subject, body);
    recordToHistory(data, subject, body);
    dom.statusMessage.textContent = "Analysis complete!";
    dom.statusMessage.className = "form-status";
  } catch (err) {
    dom.statusMessage.textContent = `Error: ${err.message}`;
    dom.statusMessage.className = "form-status error";
  } finally {
    dom.analyzeBtn.disabled = false;
    dom.analyzeBtn.querySelector(".btn-text").textContent = "Analyze Thread";
  }
}

// --- Render Analysis Result in Right Panel ---
function renderAnalysisResult(data, subject, body) {
  dom.resultEmpty.hidden = true;
  dom.resultActive.hidden = false;

  const isThread = data.is_thread;
  const confidencePct = Math.round((data.confidence_score || data.model_confidence) * 100);
  const sig = data.structural_signals || {};

  // 1. Verdict Banner
  dom.verdictBanner.className = `verdict-banner ${isThread ? "thread" : "new"}`;
  const SVG_THREAD = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>`;
  const SVG_STANDALONE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
  dom.verdictIcon.innerHTML = isThread ? SVG_THREAD : SVG_STANDALONE;
  dom.verdictBadge.textContent = isThread ? "THREAD DETECTED" : "STANDALONE EMAIL";
  dom.verdictTitle.textContent = isThread
    ? "Part of an Active Conversation Thread"
    : "New Standalone Email Conversation";
  dom.verdictSubtitle.textContent = isThread
    ? "This message connects to an ongoing email conversation chain."
    : "This email starts a fresh, independent inquiry with no prior chain.";
  dom.verdictScore.textContent = `${confidencePct}%`;

  // 2. Thread Chain Flow Visualizer
  if (isThread) {
    dom.chainStatusBadge.textContent = "Multi-Turn Thread Chain";
    dom.chainStatusBadge.className = "chain-status-badge";
    dom.nodePrevious.hidden = false;
    dom.threadConnector.hidden = false;

    // Prior message snippet
    if (sig.quoted_snippet) {
      dom.nodePrevSnippet.textContent = sig.quoted_snippet;
    } else if (dom.inReplyTo.value) {
      dom.nodePrevSnippet.textContent = `Referenced Message-ID: ${dom.inReplyTo.value}`;
    } else {
      dom.nodePrevSnippet.textContent = `Original conversation regarding "${sig.normalized_subject || 'this topic'}"`;
    }

    dom.nodeCurrentSeq.textContent = "Incoming Reply";
    dom.nodeCurrent.className = "thread-node node-current";
  } else {
    dom.chainStatusBadge.textContent = "Initial Standalone Message";
    dom.chainStatusBadge.className = "chain-status-badge standalone";
    dom.nodePrevious.hidden = true;
    dom.threadConnector.hidden = true;
    dom.nodeCurrentSeq.textContent = "Turn 1 (Thread Starter)";
    dom.nodeCurrent.className = "thread-node node-current standalone";
  }

  dom.nodeCurrentSubject.textContent = subject || "No Subject Specified";
  dom.nodeCurrentSnippet.textContent = body ? body.slice(0, 140) + "..." : "(No body provided)";

  // 3. 4-Pillars Signal Matrix
  // Pillar 1: Model
  const modelReplyPct = Math.round(((data.probabilities && data.probabilities.THREAD_REPLY) || 0) * 100);
  dom.sigModelStatus.textContent = data.model_prediction === "THREAD_REPLY" ? `Thread Reply (${modelReplyPct}%)` : `New Email (${100 - modelReplyPct}%)`;
  dom.sigModelBar.style.width = `${modelReplyPct}%`;
  dom.sigModelBar.style.background = data.model_prediction === "THREAD_REPLY" ? "var(--emerald)" : "var(--cyan)";

  // Pillar 2: Subject
  if (sig.has_re_fwd_subject) {
    dom.sigSubjectStatus.textContent = "Prefix Detected";
    dom.sigSubjectClean.textContent = `Topic: "${sig.normalized_subject}"`;
    dom.sigSubjectStatus.style.color = "var(--emerald)";
  } else {
    dom.sigSubjectStatus.textContent = "Clean Subject";
    dom.sigSubjectClean.textContent = "No Re: or Fwd: tag";
    dom.sigSubjectStatus.style.color = "var(--text-muted)";
  }

  // Pillar 3: Headers
  if (sig.has_in_reply_to || sig.has_references) {
    dom.sigHeadersStatus.textContent = "RFC Trace Found";
    dom.sigHeadersSub.textContent = sig.has_in_reply_to ? "In-Reply-To present" : "References present";
    dom.sigHeadersStatus.style.color = "var(--emerald)";
  } else {
    dom.sigHeadersStatus.textContent = "No Thread Headers";
    dom.sigHeadersSub.textContent = "Standard message";
    dom.sigHeadersStatus.style.color = "var(--text-muted)";
  }

  // Pillar 4: Quotes
  if (sig.has_quoted_history) {
    dom.sigQuotesStatus.textContent = "Quoted History Found";
    dom.sigQuotesSub.textContent = "Previous quote block in body";
    dom.sigQuotesStatus.style.color = "var(--emerald)";
  } else {
    dom.sigQuotesStatus.textContent = "No Quoted Quotes";
    dom.sigQuotesSub.textContent = "Original body text";
    dom.sigQuotesStatus.style.color = "var(--text-muted)";
  }

  // 4. Clues & Reasons List
  dom.reasonsList.innerHTML = "";
  (data.detection_reasons || []).forEach((reason) => {
    const li = document.createElement("li");
    const bullet = document.createElement("span");
    bullet.className = `reason-bullet ${isThread ? "" : "neutral"}`;
    bullet.textContent = isThread ? "✓" : "—";
    const text = document.createElement("span");
    text.textContent = reason;
    li.appendChild(bullet);
    li.appendChild(text);
    dom.reasonsList.appendChild(li);
  });

  // 5. Extracted Quoted Snippet Box
  if (sig.quoted_snippet) {
    dom.quotedSnippetBox.hidden = false;
    dom.snippetQuoteText.textContent = sig.quoted_snippet;
  } else {
    dom.quotedSnippetBox.hidden = true;
  }

  // 6. Probabilities Bar
  const probs = data.probabilities || {};
  const replyPct = Math.round((probs.THREAD_REPLY || 0) * 100);
  const newPct = Math.round((probs.NEW_EMAIL || 0) * 100);
  dom.probReplyVal.textContent = `${replyPct}%`;
  dom.probReplyBar.style.width = `${replyPct}%`;
  dom.probNewVal.textContent = `${newPct}%`;
  dom.probNewBar.style.width = `${newPct}%`;
}

// --- History & KPIs State Update ---
function recordToHistory(data, subject, body) {
  const item = {
    id: "scan-" + Date.now(),
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    subject: subject || "(No Subject)",
    body: body,
    headers: {
      inReplyTo: dom.inReplyTo.value,
      references: dom.references.value,
    },
    isThread: data.is_thread,
    confidence: data.confidence_score || data.model_confidence,
    signals: data.structural_signals,
    data: data,
  };

  sessionState.history.unshift(item);
  saveHistory();

  // Update session KPIs
  sessionState.kpis.total += 1;
  if (item.isThread) {
    sessionState.kpis.threads += 1;
  } else {
    sessionState.kpis.standalone += 1;
  }
  sessionState.kpis.confidenceSum += item.confidence;

  updateKPIs();
  renderHistoryTable();
}

function updateKPIs() {
  const { total, threads, standalone, confidenceSum } = sessionState.kpis;
  dom.kpiTotal.textContent = total;
  dom.kpiThreads.textContent = threads;
  dom.kpiStandalone.textContent = standalone;

  const threadPct = total > 0 ? Math.round((threads / total) * 100) : 0;
  const standalonePct = total > 0 ? Math.round((standalone / total) * 100) : 0;
  const avgConfidence = total > 0 ? ((confidenceSum / total) * 100).toFixed(1) : "0.0";

  dom.kpiThreadPct.textContent = `${threadPct}%`;
  dom.kpiThreadBar.style.width = `${threadPct}%`;

  dom.kpiStandalonePct.textContent = `${standalonePct}%`;
  dom.kpiStandaloneBar.style.width = `${standalonePct}%`;

  dom.kpiConfidence.textContent = `${avgConfidence}%`;
  dom.kpiConfidenceBar.style.width = `${avgConfidence}%`;

  dom.navHistoryCount.textContent = sessionState.history.length;
}

// --- Render History Table ---
function renderHistoryTable() {
  const history = sessionState.history;
  dom.countAll.textContent = history.length;
  dom.countThreads.textContent = history.filter((h) => h.isThread).length;
  dom.countNew.textContent = history.filter((h) => !h.isThread).length;

  let filtered = history;
  if (sessionState.activeFilter === "thread") {
    filtered = filtered.filter((h) => h.isThread);
  } else if (sessionState.activeFilter === "new") {
    filtered = filtered.filter((h) => !h.isThread);
  }

  if (sessionState.searchQuery) {
    filtered = filtered.filter(
      (h) =>
        h.subject.toLowerCase().includes(sessionState.searchQuery) ||
        h.body.toLowerCase().includes(sessionState.searchQuery)
    );
  }

  dom.historyTbody.innerHTML = "";

  if (filtered.length === 0) {
    dom.historyTbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">
          ${history.length === 0 ? "No scan records in this session yet. Run an analysis above!" : "No records match your filter/search criteria."}
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((item) => {
    const tr = document.createElement("tr");

    const confPct = Math.round(item.confidence * 100);
    const signalPills = [];
    if (item.signals && item.signals.has_re_fwd_subject) signalPills.push("Re:/Fwd:");
    if (item.signals && item.signals.has_in_reply_to) signalPills.push("In-Reply-To");
    if (item.signals && item.signals.has_quoted_history) signalPills.push("Quoted Block");
    if (signalPills.length === 0) signalPills.push("NLP Tone");

    tr.innerHTML = `
      <td class="mono-font">${item.timestamp}</td>
      <td style="font-weight: 500;">${escapeHtml(item.subject)}</td>
      <td>
        <span class="table-badge ${item.isThread ? "thread" : "new"}">
          ${item.isThread ? "Thread Reply" : "Standalone"}
        </span>
      </td>
      <td><strong>${confPct}%</strong></td>
      <td><span style="font-size: 0.75rem; color: var(--text-muted);">${signalPills.join(", ")}</span></td>
      <td>
        <button class="btn-inspect-row" data-id="${item.id}">Reload</button>
      </td>
    `;

    tr.querySelector(".btn-inspect-row").addEventListener("click", () => {
      loadHistoryItem(item);
    });

    dom.historyTbody.appendChild(tr);
  });
}

function loadHistoryItem(item) {
  dom.subject.value = item.subject;
  dom.body.value = item.body;
  dom.inReplyTo.value = (item.headers && item.headers.inReplyTo) || "";
  dom.references.value = (item.headers && item.headers.references) || "";
  dom.clearSubject.hidden = false;
  updateTextStats();

  // Switch to analyzer tab
  document.getElementById("tab-analyzer").click();
  renderAnalysisResult(item.data, item.subject, item.body);
  dom.statusMessage.textContent = "Restored scan result from history.";
}

// --- Batch Scanner Execution ---
async function handleBatchScan() {
  let parsed;
  try {
    parsed = JSON.parse(dom.batchJsonInput.value);
  } catch (e) {
    alert("Invalid JSON payload in Batch input. Please check formatting.");
    return;
  }

  dom.btnRunBatch.disabled = true;
  dom.btnRunBatch.innerHTML = '<span class="btn-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span> Scanning...';

  try {
    const res = await fetch(`${API_BASE}/api/batch-predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Batch scan failed.");

    renderBatchResults(data);
  } catch (err) {
    alert("Batch Error: " + err.message);
  } finally {
    dom.btnRunBatch.disabled = false;
    dom.btnRunBatch.innerHTML = '<span class="btn-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></span> Execute Batch Scan';
  }
}

function renderBatchResults(data) {
  dom.batchEmpty.hidden = true;
  dom.batchSummary.hidden = false;

  dom.batchClustersCount.textContent = (data.thread_clusters || []).length;
  dom.batchThreadCount.textContent = data.threads_detected || 0;
  dom.batchStandaloneCount.textContent = data.standalone_emails || 0;

  dom.clustersContainer.innerHTML = "";

  (data.thread_clusters || []).forEach((cluster) => {
    const card = document.createElement("div");
    card.className = `cluster-card ${cluster.is_thread ? "is-thread" : "is-standalone"}`;

    const relatedEmails = (data.emails || []).filter((e) => cluster.message_ids.includes(e.id));

    let msgsHtml = "";
    relatedEmails.forEach((email) => {
      msgsHtml += `
        <div class="cluster-msg-item">
          <div>
            <span style="font-weight: 600; color: var(--text-pure);">${escapeHtml(email.sender || "User")}:</span>
            <span style="color: var(--text-main); margin-left: 6px;">${escapeHtml(email.subject)}</span>
          </div>
          <span class="table-badge ${email.is_thread ? "thread" : "new"}">
            ${email.is_thread ? "Reply" : "New"}
          </span>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="cluster-topic-header">
        <span class="cluster-title">Topic: "${escapeHtml(cluster.topic)}"</span>
        <span class="cluster-badge ${cluster.is_thread ? "kpi-emerald-chip" : "kpi-cyan-chip"}">
          ${cluster.is_thread ? `Thread (${cluster.message_ids.length} messages)` : "Standalone (1 message)"}
        </span>
      </div>
      <div class="cluster-msgs-list">
        ${msgsHtml}
      </div>
    `;

    dom.clustersContainer.appendChild(card);
  });
}

// --- Persistence & Export ---
function saveHistory() {
  try {
    localStorage.setItem("threadpulse_history", JSON.stringify(sessionState.history.slice(0, 50)));
  } catch (e) {}
}

function loadSavedHistory() {
  try {
    const saved = localStorage.getItem("threadpulse_history");
    if (saved) {
      sessionState.history = JSON.parse(saved);
      // Recalculate KPIs
      sessionState.kpis = {
        total: sessionState.history.length,
        threads: sessionState.history.filter((h) => h.isThread).length,
        standalone: sessionState.history.filter((h) => !h.isThread).length,
        confidenceSum: sessionState.history.reduce((sum, h) => sum + (h.confidence || 0.95), 0),
      };
    }
  } catch (e) {}
}

function clearHistory() {
  if (confirm("Are you sure you want to clear the scan history?")) {
    sessionState.history = [];
    sessionState.kpis = { total: 0, threads: 0, standalone: 0, confidenceSum: 0 };
    saveHistory();
    updateKPIs();
    renderHistoryTable();
  }
}

function exportHistoryJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionState.history, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `threadpulse_scan_log_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
