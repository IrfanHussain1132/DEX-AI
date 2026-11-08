import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUp, BarChart3, Check, ChevronDown,
  CircleHelp, Clock3, Copy, Database, FileText, LoaderCircle,
  Menu, MessageSquare, MoreHorizontal, Paperclip, Plus, Settings2,
  ShieldCheck, Sparkles, Table2, UploadCloud, Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { askDatabase, askDocument, readableApiError, uploadDocument } from './services/api';

/* ── Suggestion cards ───────────────────────────────────────────────────── */
const suggestions = [
  { icon: BarChart3,  title: 'Average salary by department',  prompt: 'Show average salary by department.' },
  { icon: Activity,   title: 'Top 5 highest-paid employees',  prompt: 'Find the top 5 highest-paid employees.' },
  { icon: Database,   title: 'Count employees per department', prompt: 'Count employees in each department.' },
];

/* ── Response field helpers ─────────────────────────────────────────────── */
function getSql(r)         { return r?.sql || r?.query || r?.generated_sql || r?.data?.sql || ''; }
function getRows(r)        { return r?.rows || r?.results || r?.data?.rows || []; }
function getColumns(r, rows){ return r?.columns || r?.data?.columns || (rows[0] ? Object.keys(rows[0]) : []); }
function getError(r)       { return r?.error || r?.detail || r?.message || r?.data?.error; }
function getTime(r)        { return r?.execution_time ?? r?.executionTime ?? r?.duration_ms; }

/* ── SQL syntax highlighter ─────────────────────────────────────────────── */
const SQL_KW = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AS|AND|OR|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT|HAVING)\b/gi;

function SqlBlock({ sql }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }
  const parts = sql.split(/((?:\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AS|AND|OR|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT|HAVING)\b)|\b\d+(?:\.\d+)?\b|'[^']*')/gi);
  return (
    <div className="sql-card">
      <div className="sql-head">
        <div>
          <span className="sql-dot"/>
          <span>Generated SQL</span>
          <span className="readonly"><ShieldCheck size={12}/> Read only</span>
        </div>
        <button className="copy-btn" onClick={copy}>
          {copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy SQL'}
        </button>
      </div>
      <pre><code>
        {parts.map((p, i) =>
          SQL_KW.test(p)         ? <span className="sql-key"   key={i}>{p}</span>
          : /^\d/.test(p) || /^'/.test(p) ? <span className="sql-value" key={i}>{p}</span>
          : p
        )}
      </code></pre>
    </div>
  );
}

/* ── Results table ──────────────────────────────────────────────────────── */
function ResultsTable({ rows, columns, count }) {
  if (!rows.length)
    return <div className="empty-result"><Table2 size={18}/><span>Query completed — no matching records.</span></div>;
  return (
    <div className="results-wrap">
      <div className="table-caption">
        <span><Table2 size={14}/> Results</span>
        <span>{count ?? rows.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c}>
                    {row?.[c] == null
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

/* ── Answer renderer ────────────────────────────────────────────────────── */
function Answer({ message }) {
  const result  = message.result || {};
  const rows    = getRows(result);
  const columns = getColumns(result, rows);
  const sql     = getSql(result);
  const error   = message.error || (!result.success && getError(result));
  const ms      = getTime(result);

  return (
    <div className="answer-content">
      {error
        ? <div className="response-error"><CircleHelp size={16}/><span>{error}</span></div>
        : <>
            {(result.answer || result.response || result.data?.answer) &&
              <p className="answer-text">{result.answer || result.response || result.data?.answer}</p>}
            {sql && <SqlBlock sql={sql}/>}
            {sql && (
              <div className="query-meta">
                <span><span className="status-dot"/> Query executed</span>
                {ms != null && <span><Clock3 size={13}/>{typeof ms === 'number' ? `${ms} ms` : ms}</span>}
              </div>
            )}
            {Array.isArray(rows) && (sql || rows.length > 0) &&
              <ResultsTable rows={rows} columns={columns} count={result.count ?? result.total ?? rows.length}/>}
            {!sql && !rows.length && !(result.answer || result.response || result.data?.answer) &&
              <p className="answer-text">The request completed, but the API returned no data to display.</p>}
          </>}
    </div>
  );
}

/* ── DB Status badge (polls /api/health on mount) ───────────────────────── */
function DbStatus() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'ok' | 'error'
  const [info, setInfo]     = useState(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    fetch(`${base}/api/health`)
      .then(r => r.json())
      .then(d => { setStatus(d.database?.connected ? 'ok' : 'error'); setInfo(d); })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'checking') return <span style={{display:'flex',alignItems:'center',gap:6,fontSize:9}}><LoaderCircle size={12} className="spin"/> Connecting…</span>;
  if (status === 'error')    return <span style={{display:'flex',alignItems:'center',gap:6,fontSize:9,color:'#ff7272'}}><WifiOff size={12}/> DB offline</span>;
  return (
    <span style={{display:'flex',alignItems:'center',gap:6,fontSize:9,color:'#57d29a'}}>
      <Wifi size={12}/> {info?.database?.name || 'MySQL'} · {info?.database?.table_count ?? '?'} tables
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   App
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [mode,        setMode]        = useState('database');
  const [documents,   setDocuments]   = useState([]);
  const [dragging,    setDragging]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeDoc,   setActiveDoc]   = useState(null);
  const fileInput = useRef(null);
  const bottomRef = useRef(null);

  /* Auto-scroll to latest message */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function newChat() {
    setMessages([]); setInput(''); setMode('database');
    setActiveDoc(null); setSidebarOpen(false);
  }

  async function submit(question = input, selectedMode = mode) {
    const text = question.trim();
    if (!text || busy) return;
    const id = `${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, { id, question: text, mode: selectedMode, pending: true }]);
    setInput('');
    setBusy(true);
    try {
      const result = selectedMode === 'documents'
        ? await askDocument(text, activeDoc?.id || activeDoc?.document_id || activeDoc?.name)
        : await askDatabase(text);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, pending: false, result } : m));
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, pending: false, error: readableApiError(error) } : m));
    } finally { setBusy(false); }
  }

  async function addFiles(files) {
    for (const file of Array.from(files || [])) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue;
      const entry = { name: file.name, status: 'Uploading', id: `${Date.now()}-${file.name}` };
      setDocuments(prev => [entry, ...prev]);
      try {
        const data = await uploadDocument(file);
        const doc  = { ...data, id: data.id || data.document_id || entry.id, name: data.filename || data.name || file.name, status: 'Ready' };
        setDocuments(prev => prev.map(m => m.id === entry.id ? doc : m));
        setActiveDoc(doc);
      } catch (error) {
        setDocuments(prev => prev.map(m => m.id === entry.id ? { ...m, status: 'Failed', error: readableApiError(error) } : m));
      }
    }
  }

  /* ── Shared composer ────────────────────────────────────────────────────── */
  function Composer({ mini = false }) {
    return (
      <div className="composer" style={mini ? { marginTop: 'auto' } : {}}>
        <textarea
          rows={mini ? 1 : 2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={mode === 'documents' ? (mini ? 'Ask a follow-up…' : 'Ask about your documents…') : (mini ? 'Ask a follow-up…' : 'Ask anything about your data…')}
          style={mini ? { minHeight: 48, maxHeight: 150, paddingTop: 14 } : {}}
        />
        <div className="composer-footer">
          <button className="attach-btn" onClick={() => fileInput.current?.click()} title="Upload PDF">
            <Paperclip size={mini ? 15 : 16}/><span>Attach</span>
          </button>
          <div className="composer-right">
            <span className="mode-chip">
              <Database size={13}/>{mode === 'database' ? 'Database' : activeDoc?.name || 'Documents'}
            </span>
            <button
              className="send-button"
              disabled={!input.trim() || busy}
              onClick={() => submit()}
              aria-label="Send question"
            >
              {busy ? <LoaderCircle size={17} className="spin"/> : <ArrowUp size={18}/>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="app-shell">
      {/* Sidebar scrim (mobile) */}
      {sidebarOpen && <button aria-label="Close sidebar" className="sidebar-scrim" onClick={() => setSidebarOpen(false)}/>}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span/><span/><span/><span/></div>
          <div className="brand-name">DEX<span>AI</span><small>ENTERPRISE INTELLIGENCE</small></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18}/></button>
        </div>

        <button className="new-chat" onClick={newChat}>
          <Plus size={17}/>New chat<span className="shortcut">⌘ K</span>
        </button>

        <div className="side-section">
          <div className="side-label">WORKSPACE</div>
          <button className={`nav-item ${mode === 'database'  ? 'active' : ''}`} onClick={() => setMode('database')}>
            <Database size={16}/>Database query<ChevronDown className="nav-chevron" size={14}/>
          </button>
          <button className={`nav-item ${mode === 'documents' ? 'active' : ''}`} onClick={() => setMode('documents')}>
            <FileText size={16}/>Document intelligence<ChevronDown className="nav-chevron" size={14}/>
          </button>
        </div>

        <div className="side-section history-section">
          <div className="side-label history-label">RECENT CHATS <MoreHorizontal size={16}/></div>
          {messages.length
            ? <button className="history-link"><MessageSquare size={14}/>{messages[messages.length - 1].question}</button>
            : <div className="history-empty">Your recent conversations will appear here.</div>}
        </div>

        <div className="side-section docs-side">
          <div className="side-label docs-label">
            YOUR DOCUMENTS
            <button aria-label="Upload PDF" onClick={() => fileInput.current?.click()}><Plus size={14}/></button>
          </div>
          {documents.length
            ? documents.map(doc => (
                <button
                  className={`doc-link ${activeDoc?.id === doc.id ? 'doc-active' : ''}`}
                  key={doc.id}
                  onClick={() => { setActiveDoc(doc); setMode('documents'); }}
                >
                  <FileText size={14}/><span>{doc.name}</span>
                  <i className={`doc-status ${doc.status === 'Ready' ? 'ready' : doc.status === 'Failed' ? 'failed' : ''}`}/>
                </button>
              ))
            : <div className="history-empty">No PDFs uploaded yet.</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Zap size={15}/></div>
            <div><b>DEX AI Workspace</b><span>Groq · Llama 4 Scout</span></div>
            <span className="connected-pill">LIVE</span>
          </div>
          <button className="nav-item settings-item"><Settings2 size={16}/>Settings</button>
          <div className="profile">
            <div className="avatar">D</div>
            <div><b>Data workspace</b><span>Enterprise plan</span></div>
            <MoreHorizontal size={17}/>
          </div>
        </div>

        <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => addFiles(e.target.files)}/>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <main
        className="main-area"
        onDragOver={e  => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e      => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        {/* Topbar */}
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button>
          <div className="breadcrumb">
            <span>Workspace</span><span className="crumb-sep">/</span>
            <b>{mode === 'database' ? 'Database query' : 'Document intelligence'}</b>
          </div>
          <div className="topbar-right">
            <span className="secure-label"><ShieldCheck size={14}/> Secure workspace</span>
            <button className="top-icon"><CircleHelp size={17}/></button>
            <div className="avatar top-avatar">D</div>
          </div>
        </header>

        {/* Content */}
        <div className="content-scroll">
          {messages.length === 0
            /* ── Welcome / home screen ──────────────────────────────────── */
            ? <section className="welcome-wrap">
                <div className="welcome-inner">
                  <div className="eyebrow">
                    <span className="eyebrow-line"/> INTELLIGENCE, UNLOCKED <span className="eyebrow-line"/>
                  </div>
                  <div className="welcome-icon">
                    <div className="welcome-glow"/>
                    <Sparkles size={25}/>
                  </div>
                  <h1>Welcome to <span>DEX AI.</span></h1>
                  <p className="welcome-subtitle">What would you like to know about your business?</p>

                  <Composer/>

                  <div className="suggestion-label">GET STARTED WITH A QUESTION</div>
                  <div className="suggestions">
                    {suggestions.map(({ icon: Icon, title, prompt }) => (
                      <button className="suggestion-card" key={title} onClick={() => { setMode('database'); submit(prompt, 'database'); }}>
                        <span className="suggestion-icon"><Icon size={16}/></span>
                        <span>{title}</span>
                        <ArrowRight className="suggestion-arrow" size={15}/>
                      </button>
                    ))}
                  </div>
                  <div className="welcome-foot"><ShieldCheck size={13}/> Your business data stays private and secure</div>
                </div>
              </section>

            /* ── Conversation view ──────────────────────────────────────── */
            : <section className="conversation">
                <div className="conversation-heading">
                  <div>
                    <div className="eyebrow left-eyebrow">{mode === 'database' ? 'DATABASE QUERY' : 'DOCUMENT INTELLIGENCE'}</div>
                    <h2>Ask. Query. <span>Discover.</span></h2>
                  </div>
                  <button className="new-convo-btn" onClick={newChat}><Plus size={15}/>New chat</button>
                </div>

                {messages.map(msg => (
                  <article className="message-pair" key={msg.id}>
                    <div className="user-question">
                      <div className="avatar user-avatar">D</div>
                      <div>
                        <div className="msg-author">You <span>· Just now</span></div>
                        <p>{msg.question}</p>
                      </div>
                    </div>
                    <div className="ai-answer">
                      <div className="ai-avatar"><Sparkles size={15}/></div>
                      <div className="answer-main">
                        <div className="msg-author">
                          DEX AI <span className="ai-badge">{msg.mode === 'database' ? 'DATA ASSISTANT' : 'DOCUMENT AI'}</span>
                        </div>
                        {msg.pending
                          ? <div className="loading-state"><LoaderCircle size={16} className="spin"/>Analyzing your question<span className="loading-dots">•••</span></div>
                          : <Answer message={msg}/>}
                      </div>
                    </div>
                  </article>
                ))}

                {/* Scroll anchor */}
                <div ref={bottomRef}/>

                {/* Bottom composer */}
                <div className="bottom-composer">
                  <Composer mini/>
                  <div className="composer-hint">DEX AI can make mistakes. Verify important results.</div>
                </div>
              </section>}
        </div>

        {/* Drop overlay */}
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-card">
              <UploadCloud size={31}/>
              <b>Drop your PDF here</b>
              <span>We'll add it to your document library</span>
            </div>
          </div>
        )}

        {/* Statusbar with live DB status */}
        <div className="statusbar">
          <span><span className="status-dot"/> <DbStatus/></span>
          <span>DEX AI <b>·</b> Ask. Query. Discover.</span>
        </div>
      </main>
    </div>
  );
}
