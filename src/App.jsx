import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUp, BarChart3, Check, ChevronDown,
  CircleHelp, Clock3, Copy, Database, FileText, LoaderCircle,
  Menu, MessageSquare, MoreHorizontal, Paperclip, Plus, Settings2,
  ShieldCheck, Sparkles, Table2, UploadCloud, Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { askDatabase, askDocument, readableApiError, uploadDocument } from './services/api';

/* ─── Suggestion prompts ──────────────────────────────────────────────────── */
const SUGGESTIONS = [
  { icon: BarChart3, title: 'Average salary by department',   prompt: 'Show average salary by department.' },
  { icon: Activity,  title: 'Top 5 highest-paid employees',   prompt: 'Find the top 5 highest-paid employees.' },
  { icon: Database,  title: 'Count employees per department',  prompt: 'Count employees in each department.' },
];

/* ─── Response field helpers ──────────────────────────────────────────────── */
const getSql     = r => r?.sql     || r?.query        || r?.generated_sql   || r?.data?.sql     || '';
const getRows    = r => r?.rows    || r?.results      || r?.data?.rows       || [];
const getCols    = (r, rows) => r?.columns || r?.data?.columns || (rows[0] ? Object.keys(rows[0]) : []);
const getError   = r => r?.error   || r?.detail       || r?.message         || r?.data?.error;
const getTime    = r => r?.execution_time ?? r?.executionTime ?? r?.duration_ms;

/* ─── SQL keyword highlighter ─────────────────────────────────────────────── */
const KW_RE = /(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|HAVING|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AS|AND|OR|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT)/i;

function highlight(sql) {
  return sql.split(/(\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|HAVING|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AS|AND|OR|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT)\b|\b\d+(?:\.\d+)?\b|'[^']*')/gi)
    .map((p, i) => {
      if (KW_RE.test(p))             return <span key={i} className="sql-key">{p}</span>;
      if (/^\d/.test(p) || /^'/.test(p)) return <span key={i} className="sql-value">{p}</span>;
      return p;
    });
}

/* ─── SqlBlock ────────────────────────────────────────────────────────────── */
function SqlBlock({ sql }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }
  return (
    <div className="sql-card">
      <div className="sql-head">
        <div>
          <span className="sql-dot" />
          <span>Generated SQL</span>
          <span className="readonly"><ShieldCheck size={12} /> Read only</span>
        </div>
        <button className="copy-btn" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy SQL'}
        </button>
      </div>
      <pre><code>{highlight(sql)}</code></pre>
    </div>
  );
}

/* ─── ResultsTable ────────────────────────────────────────────────────────── */
function ResultsTable({ rows, columns, count }) {
  if (!rows.length)
    return (
      <div className="empty-result">
        <Table2 size={18} /><span>Query completed — no matching records.</span>
      </div>
    );
  return (
    <div className="results-wrap">
      <div className="table-caption">
        <span><Table2 size={14} /> Results</span>
        <span>{count ?? rows.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c}>
                    {row[c] == null
                      ? <span className="null-value">—</span>
                      : typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Answer ──────────────────────────────────────────────────────────────── */
function Answer({ message }) {
  const result  = message.result || {};
  const rows    = getRows(result);
  const columns = getCols(result, rows);
  const sql     = getSql(result);
  const error   = message.error || (!result.success && getError(result));
  const ms      = getTime(result);

  if (error) return (
    <div className="response-error"><CircleHelp size={16} /><span>{error}</span></div>
  );

  return (
    <div className="answer-content">
      {(result.answer || result.response) &&
        <p className="answer-text">{result.answer || result.response}</p>}

      {sql && <SqlBlock sql={sql} />}

      {sql && (
        <div className="query-meta">
          <span><span className="status-dot" /> Query executed</span>
          {ms != null && <span><Clock3 size={13} />{typeof ms === 'number' ? `${ms} ms` : ms}</span>}
        </div>
      )}

      {Array.isArray(rows) && (sql || rows.length > 0) &&
        <ResultsTable rows={rows} columns={columns} count={result.count ?? rows.length} />}

      {!sql && !rows.length && !result.answer && !result.response &&
        <p className="answer-text">Request completed but no data was returned.</p>}
    </div>
  );
}

/* ─── DbStatus ────────────────────────────────────────────────────────────── */
function DbStatus() {
  const [state, setState] = useState('checking'); // 'checking' | 'ok' | 'error'
  const [info,  setInfo]  = useState(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    fetch(`${base}/api/health`)
      .then(r => r.json())
      .then(d => { setState(d.database?.connected ? 'ok' : 'error'); setInfo(d); })
      .catch(() => setState('error'));
  }, []);

  if (state === 'checking')
    return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9 }}><LoaderCircle size={11} className="spin" /> Connecting…</span>;

  if (state === 'error')
    return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#ff7272' }}><WifiOff size={11} /> DB offline</span>;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#57d29a' }}>
      <Wifi size={11} /> {info?.database?.name || 'MySQL'} · {info?.database?.table_count ?? '?'} tables
    </span>
  );
}

/* ─── Composer — defined OUTSIDE App so it's a stable component reference ── */
function Composer({ input, setInput, onSubmit, busy, mode, activeDoc, onAttach, mini }) {
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  }
  const placeholder = mode === 'documents'
    ? (mini ? 'Ask a follow-up about your documents…' : 'Ask about your documents…')
    : (mini ? 'Ask a follow-up question…' : 'Ask anything about your data…');

  return (
    <div className="composer">
      <textarea
        rows={mini ? 1 : 2}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={mini ? { minHeight: 48, maxHeight: 150, paddingTop: 14 } : {}}
      />
      <div className="composer-footer">
        <button className="attach-btn" onClick={onAttach} title="Upload PDF">
          <Paperclip size={mini ? 15 : 16} /><span>Attach</span>
        </button>
        <div className="composer-right">
          <span className="mode-chip">
            <Database size={13} />
            {mode === 'database' ? 'Database' : activeDoc?.name || 'Documents'}
          </span>
          <button
            className="send-button"
            disabled={!input.trim() || busy}
            onClick={onSubmit}
            aria-label="Send"
          >
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   App — root component
══════════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [mode,        setMode]        = useState('database');
  const [documents,   setDocuments]   = useState([]);
  const [dragging,    setDragging]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeDoc,   setActiveDoc]   = useState(null);
  const fileRef   = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function newChat() {
    setMessages([]); setInput(''); setMode('database');
    setActiveDoc(null); setSidebarOpen(false);
  }

  async function submit(question, selectedMode) {
    const q = (question ?? input).trim();
    const m = selectedMode ?? mode;
    if (!q || busy) return;

    const id = `${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, { id, question: q, mode: m, pending: true }]);
    setInput('');
    setBusy(true);

    try {
      const result = m === 'documents'
        ? await askDocument(q, activeDoc?.id || activeDoc?.name)
        : await askDatabase(q);
      setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, pending: false, result } : msg));
    } catch (err) {
      setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, pending: false, error: readableApiError(err) } : msg));
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files) {
    for (const file of Array.from(files || [])) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue;
      const entry = { name: file.name, status: 'Uploading', id: `${Date.now()}-${file.name}` };
      setDocuments(prev => [entry, ...prev]);
      try {
        const data = await uploadDocument(file);
        const doc  = { ...data, id: data.id || data.document_id || entry.id, name: data.filename || data.name || file.name, status: 'Ready' };
        setDocuments(prev => prev.map(d => d.id === entry.id ? doc : d));
        setActiveDoc(doc);
      } catch (err) {
        setDocuments(prev => prev.map(d => d.id === entry.id ? { ...d, status: 'Failed', error: readableApiError(err) } : d));
      }
    }
  }

  /* shared composer props */
  const composerProps = { input, setInput, busy, mode, activeDoc, onAttach: () => fileRef.current?.click() };

  return (
    <div className="app-shell">
      {/* ── Sidebar scrim (mobile) ─────────────────────────────────────── */}
      {sidebarOpen && (
        <button aria-label="Close sidebar" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <div className="brand-name">DEX<span>AI</span><small>ENTERPRISE INTELLIGENCE</small></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <button className="new-chat" onClick={newChat}>
          <Plus size={17} />New chat<span className="shortcut">⌘ K</span>
        </button>

        <div className="side-section">
          <div className="side-label">WORKSPACE</div>
          <button className={`nav-item ${mode === 'database'  ? 'active' : ''}`} onClick={() => setMode('database')}>
            <Database size={16} />Database query<ChevronDown className="nav-chevron" size={14} />
          </button>
          <button className={`nav-item ${mode === 'documents' ? 'active' : ''}`} onClick={() => setMode('documents')}>
            <FileText size={16} />Document intelligence<ChevronDown className="nav-chevron" size={14} />
          </button>
        </div>

        <div className="side-section history-section">
          <div className="side-label history-label">RECENT CHATS <MoreHorizontal size={16} /></div>
          {messages.length
            ? <button className="history-link"><MessageSquare size={14} />{messages[messages.length - 1].question}</button>
            : <div className="history-empty">Your recent conversations will appear here.</div>}
        </div>

        <div className="side-section docs-side">
          <div className="side-label docs-label">
            YOUR DOCUMENTS
            <button aria-label="Upload PDF" onClick={() => fileRef.current?.click()}><Plus size={14} /></button>
          </div>
          {documents.length
            ? documents.map(doc => (
                <button
                  key={doc.id}
                  className={`doc-link ${activeDoc?.id === doc.id ? 'doc-active' : ''}`}
                  onClick={() => { setActiveDoc(doc); setMode('documents'); }}
                >
                  <FileText size={14} /><span>{doc.name}</span>
                  <i className={`doc-status ${doc.status === 'Ready' ? 'ready' : doc.status === 'Failed' ? 'failed' : ''}`} />
                </button>
              ))
            : <div className="history-empty">No PDFs uploaded yet.</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Zap size={15} /></div>
            <div><b>DEX AI Workspace</b><span>Groq · Llama 4 Scout</span></div>
            <span className="connected-pill">LIVE</span>
          </div>
          <button className="nav-item settings-item"><Settings2 size={16} />Settings</button>
          <div className="profile">
            <div className="avatar">D</div>
            <div><b>Data workspace</b><span>Enterprise plan</span></div>
            <MoreHorizontal size={17} />
          </div>
        </div>

        <input ref={fileRef} type="file" accept=".pdf" multiple hidden onChange={e => addFiles(e.target.files)} />
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <main
        className="main-area"
        onDragOver={e  => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e      => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        {/* Topbar */}
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb">
            <span>Workspace</span><span className="crumb-sep">/</span>
            <b>{mode === 'database' ? 'Database query' : 'Document intelligence'}</b>
          </div>
          <div className="topbar-right">
            <span className="secure-label"><ShieldCheck size={14} /> Secure workspace</span>
            <button className="top-icon"><CircleHelp size={17} /></button>
            <div className="avatar top-avatar">D</div>
          </div>
        </header>

        {/* Content scroll area */}
        <div className="content-scroll">

          {/* ── Welcome screen ──────────────────────────────────────────── */}
          {messages.length === 0 ? (
            <section className="welcome-wrap">
              <div className="welcome-inner">
                <div className="eyebrow">
                  <span className="eyebrow-line" /> INTELLIGENCE, UNLOCKED <span className="eyebrow-line" />
                </div>
                <div className="welcome-icon">
                  <div className="welcome-glow" />
                  <Sparkles size={25} />
                </div>
                <h1>Welcome to <span>DEX AI.</span></h1>
                <p className="welcome-subtitle">What would you like to know about your business?</p>

                <Composer {...composerProps} onSubmit={() => submit()} />

                <div className="suggestion-label">GET STARTED WITH A QUESTION</div>
                <div className="suggestions">
                  {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
                    <button
                      key={title}
                      className="suggestion-card"
                      onClick={() => { setMode('database'); submit(prompt, 'database'); }}
                    >
                      <span className="suggestion-icon"><Icon size={16} /></span>
                      <span>{title}</span>
                      <ArrowRight className="suggestion-arrow" size={15} />
                    </button>
                  ))}
                </div>
                <div className="welcome-foot">
                  <ShieldCheck size={13} /> Your business data stays private and secure
                </div>
              </div>
            </section>

          /* ── Conversation view ───────────────────────────────────────── */
          ) : (
            <section className="conversation">
              <div className="conversation-heading">
                <div>
                  <div className="eyebrow left-eyebrow">
                    {mode === 'database' ? 'DATABASE QUERY' : 'DOCUMENT INTELLIGENCE'}
                  </div>
                  <h2>Ask. Query. <span>Discover.</span></h2>
                </div>
                <button className="new-convo-btn" onClick={newChat}><Plus size={15} />New chat</button>
              </div>

              {messages.map(msg => (
                <article className="message-pair" key={msg.id}>
                  {/* User question */}
                  <div className="user-question">
                    <div className="avatar user-avatar">D</div>
                    <div>
                      <div className="msg-author">You <span>· Just now</span></div>
                      <p>{msg.question}</p>
                    </div>
                  </div>
                  {/* AI answer */}
                  <div className="ai-answer">
                    <div className="ai-avatar"><Sparkles size={15} /></div>
                    <div className="answer-main">
                      <div className="msg-author">
                        DEX AI{' '}
                        <span className="ai-badge">
                          {msg.mode === 'database' ? 'DATA ASSISTANT' : 'DOCUMENT AI'}
                        </span>
                      </div>
                      {msg.pending
                        ? <div className="loading-state">
                            <LoaderCircle size={16} className="spin" />
                            Analyzing your question
                            <span className="loading-dots">•••</span>
                          </div>
                        : <Answer message={msg} />}
                    </div>
                  </div>
                </article>
              ))}

              <div ref={bottomRef} />

              {/* Bottom follow-up composer */}
              <div className="bottom-composer">
                <Composer {...composerProps} onSubmit={() => submit()} mini />
                <div className="composer-hint">DEX AI can make mistakes. Verify important results.</div>
              </div>
            </section>
          )}
        </div>

        {/* Drop overlay */}
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-card">
              <UploadCloud size={31} />
              <b>Drop your PDF here</b>
              <span>We'll add it to your document library</span>
            </div>
          </div>
        )}

        {/* Statusbar */}
        <div className="statusbar">
          <span><span className="status-dot" /> <DbStatus /></span>
          <span>DEX AI <b>·</b> Ask. Query. Discover.</span>
        </div>
      </main>
    </div>
  );
}
