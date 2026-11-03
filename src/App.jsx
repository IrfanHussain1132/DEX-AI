import { useState, useEffect, useRef } from 'react';
import {
  Database,
  Sparkles,
  Send,
  Copy,
  Check,
  Clock,
  Table,
  Download,
  Search,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Layers,
  Terminal,
  Zap,
  Cpu,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import {
  askDatabase,
  fetchSchema,
  fetchHealth,
  fetchSampleQueries,
  readableApiError
} from './services/api';

// Syntax highlighter helper for SQL keywords
function highlightSql(sql) {
  if (!sql) return null;
  const tokens = sql.split(
    /(\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AS|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT|HAVING|CASE|WHEN|THEN|ELSE|END)\b|\b\d+(?:\.\d+)?\b|'[^']*')/gi
  );

  return tokens.map((part, index) => {
    if (!part) return null;
    const isKeyword = /^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AS|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|DESC|ASC|COUNT|AVG|SUM|MIN|MAX|DISTINCT|HAVING|CASE|WHEN|THEN|ELSE|END)$/i.test(part);
    const isLiteral = /^\d/.test(part) || /^'/.test(part);

    if (isKeyword) {
      return <span key={index} className="sql-keyword">{part}</span>;
    }
    if (isLiteral) {
      return <span key={index} className="sql-literal">{part}</span>;
    }
    return <span key={index}>{part}</span>;
  });
}

// Download CSV utility
function downloadCsv(columns, rows, filename = 'query_results.csv') {
  if (!rows || rows.length === 0) return;
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        let val = row[col];
        if (val === null || val === undefined) return '""';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(',')
  );
  const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...lines].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function App() {
  const [health, setHealth] = useState({
    status: 'checking',
    database_connected: false,
    database_name: 'company_analytics',
    model: 'Loading...',
    provider: 'Groq LPU',
  });
  const [schema, setSchema] = useState({});
  const [sampleCategories, setSampleCategories] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableSearch, setTableSearch] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Load initial backend health, database schema, and sample questions
  useEffect(() => {
    checkHealthAndSchema();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function checkHealthAndSchema() {
    try {
      const healthData = await fetchHealth();
      setHealth(healthData);
    } catch {
      setHealth((prev) => ({
        ...prev,
        status: 'offline',
        database_connected: false,
      }));
    }

    try {
      const schemaData = await fetchSchema();
      if (schemaData.success) {
        setSchema(schemaData.schema || {});
        const tableNames = Object.keys(schemaData.schema || {});
        if (tableNames.length > 0) setSelectedTable(tableNames[0]);
      }
    } catch {
      // Schema endpoint might be pending or DB down
    }

    try {
      const samples = await fetchSampleQueries();
      if (samples?.categories) {
        setSampleCategories(samples.categories);
      }
    } catch {
      // Default fallbacks
      setSampleCategories([
        {
          category: 'Employees & Salaries',
          questions: [
            'Show all employees.',
            'Show the average salary of each department.',
            'Find the department with the highest average salary.',
            'Show employees earning more than 50000.',
            'Count employees in each department.',
            'Find the top 5 highest-paid employees.',
          ],
        },
      ]);
    }
  }

  async function handleSend(queryText = input) {
    const text = (queryText || '').trim();
    if (!text || loading) return;

    const messageId = Date.now().toString();
    const newMsg = {
      id: messageId,
      question: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      pending: true,
      result: null,
      error: null,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await askDatabase(text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pending: false,
                result: response,
                error: response.success ? null : response.error,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pending: false,
                error: readableApiError(err),
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleClearChat() {
    setMessages([]);
    setInput('');
  }

  const tableNames = Object.keys(schema);

  return (
    <div className="dex-layout">
      {/* ── Left Navigation / Sidebar ────────────────────────────── */}
      <aside className="dex-sidebar">
        <div className="sidebar-header">
          <div className="brand-logo">
            <div className="logo-badge">
              <Zap size={18} className="logo-icon" />
            </div>
            <div>
              <h1 className="brand-title">DEX <span>AI</span></h1>
              <span className="brand-tagline">Text-to-SQL Agent</span>
            </div>
          </div>
          <button
            className="action-icon-btn"
            title="Refresh Schema & Health"
            onClick={checkHealthAndSchema}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Model & System Telemetry Card */}
        <div className="system-card">
          <div className="system-row">
            <span className="system-label"><Cpu size={13} /> Active Model</span>
            <span className="model-chip" title={health.model}>
              {health.model.includes('/') ? health.model.split('/')[1] : health.model}
            </span>
          </div>
          <div className="system-row">
            <span className="system-label"><Database size={13} /> MySQL DB</span>
            <span className="db-chip">
              <span
                className={`status-indicator ${
                  health.database_connected ? 'online' : 'offline'
                }`}
              />
              {health.database_name || 'MySQL'}
            </span>
          </div>
          <div className="system-row">
            <span className="system-label"><ShieldCheck size={13} /> Mode</span>
            <span className="badge-readonly">Read-Only (Safe)</span>
          </div>
        </div>

        {/* Quick Schema Browser */}
        <div className="sidebar-section">
          <div className="section-header">
            <span><Layers size={14} /> Database Schema</span>
            <span className="table-count-badge">{tableNames.length} tables</span>
          </div>
          <div className="tables-list">
            {tableNames.length === 0 ? (
              <div className="empty-subtext">No tables introspected yet.</div>
            ) : (
              tableNames.map((tbl) => (
                <div
                  key={tbl}
                  className={`table-item ${selectedTable === tbl ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTable(tbl);
                    setShowSchemaDrawer(true);
                  }}
                >
                  <div className="table-name-wrap">
                    <Table size={13} className="tbl-icon" />
                    <span className="tbl-title">{tbl}</span>
                  </div>
                  <span className="col-count">
                    {schema[tbl]?.columns?.length || 0} cols
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Session Query History */}
        <div className="sidebar-section history-section">
          <div className="section-header">
            <span>Query History</span>
            {messages.length > 0 && (
              <button
                className="clear-btn"
                onClick={handleClearChat}
                title="Clear current session queries"
              >
                Clear
              </button>
            )}
          </div>
          <div className="history-list">
            {messages.length === 0 ? (
              <div className="empty-subtext">Recent queries will appear here.</div>
            ) : (
              messages.map((m) => (
                <button
                  key={m.id}
                  className="history-item"
                  onClick={() => handleSend(m.question)}
                >
                  <span className="history-text">{m.question}</span>
                  <span className="history-time">{m.timestamp}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="secondary-btn w-full"
            onClick={() => setShowSchemaDrawer(!showSchemaDrawer)}
          >
            <Layers size={14} />
            {showSchemaDrawer ? 'Hide Schema Drawer' : 'Inspect Full Schema'}
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ────────────────────────────────────────── */}
      <main className="dex-main">
        {/* Top Navbar */}
        <header className="dex-topbar">
          <div className="topbar-left">
            <span className="workspace-badge">Agentic Workspace</span>
            <ChevronRight size={14} className="crumb-sep" />
            <span className="current-view">Natural Language SQL Generator</span>
          </div>
          <div className="topbar-right">
            <div className="engine-status">
              <span className="pulse-dot" />
              <span>Groq LPU Acceleration</span>
            </div>
            {messages.length > 0 && (
              <button className="new-query-btn" onClick={handleClearChat}>
                <RotateCcw size={13} /> New Conversation
              </button>
            )}
          </div>
        </header>

        {/* Conversation / Query Timeline */}
        <div className="dex-feed">
          {messages.length === 0 ? (
            <div className="empty-hero">
              <div className="hero-badge">
                <Sparkles size={16} /> AI-POWERED DATABASE INTELLIGENCE
              </div>
              <h2 className="hero-title">
                Ask your database in <span>plain English.</span>
              </h2>
              <p className="hero-desc">
                DEX AI dynamically converts natural language questions into valid, optimized MySQL
                queries using Groq-accelerated models, executes them safely in read-only mode, and
                returns formatted results instantly.
              </p>

              {/* Sample Queries Grid */}
              <div className="sample-categories">
                {sampleCategories.map((cat, idx) => (
                  <div key={idx} className="sample-category-box">
                    <h3 className="category-title">{cat.category}</h3>
                    <div className="sample-chips">
                      {cat.questions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          className="query-chip"
                          onClick={() => handleSend(q)}
                        >
                          <ChevronRight size={13} className="chip-arrow" />
                          <span>{q}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-stream">
              {messages.map((msg) => (
                <div key={msg.id} className="message-block">
                  {/* User Question */}
                  <div className="user-row">
                    <div className="avatar user-avatar">U</div>
                    <div className="user-body">
                      <div className="meta-line">
                        <span className="author-name">You</span>
                        <span className="time-tag">{msg.timestamp}</span>
                      </div>
                      <p className="question-text">{msg.question}</p>
                    </div>
                  </div>

                  {/* Agent Response */}
                  <div className="agent-row">
                    <div className="avatar agent-avatar">
                      <Sparkles size={15} />
                    </div>
                    <div className="agent-body">
                      <div className="meta-line">
                        <span className="author-name">DEX AI</span>
                        <span className="agent-tag">MySQL Engine</span>
                        {msg.result?.execution_time_ms != null && (
                          <span className="runtime-tag">
                            <Clock size={11} />
                            {msg.result.execution_time_ms} ms
                          </span>
                        )}
                      </div>

                      {/* Loading State */}
                      {msg.pending && (
                        <div className="loading-card">
                          <RefreshCw size={16} className="spin-icon" />
                          <span>Generating SQL & querying MySQL via Groq LPU...</span>
                        </div>
                      )}

                      {/* Error State */}
                      {msg.error && (
                        <div className="error-card">
                          <AlertCircle size={18} className="err-icon" />
                          <div>
                            <strong>Query Failed</strong>
                            <p>{msg.error}</p>
                          </div>
                        </div>
                      )}

                      {/* Success Results */}
                      {msg.result?.success && (
                        <div className="result-container">
                          {/* Generated SQL Code Block */}
                          {msg.result.sql && (
                            <div className="sql-box">
                              <div className="sql-box-header">
                                <div className="sql-header-title">
                                  <Terminal size={14} />
                                  <span>Generated MySQL Query</span>
                                </div>
                                <div className="sql-header-actions">
                                  <span className="safe-pill">
                                    <ShieldCheck size={12} /> Read-Only Verified
                                  </span>
                                  <button
                                    className="copy-sql-btn"
                                    onClick={() => copyToClipboard(msg.result.sql, msg.id)}
                                  >
                                    {copiedId === msg.id ? (
                                      <>
                                        <Check size={12} /> Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={12} /> Copy SQL
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <pre className="sql-code">
                                <code>{highlightSql(msg.result.sql)}</code>
                              </pre>
                            </div>
                          )}

                          {/* Data Results Table */}
                          {msg.result.columns && msg.result.rows && (
                            <div className="table-card">
                              <div className="table-card-header">
                                <div className="table-meta">
                                  <Table size={14} />
                                  <span>Query Results</span>
                                  <span className="record-count">
                                    {msg.result.count}{' '}
                                    {msg.result.count === 1 ? 'row' : 'rows'} returned
                                  </span>
                                </div>
                                <div className="table-actions">
                                  <div className="table-search-wrap">
                                    <Search size={12} className="search-icon" />
                                    <input
                                      type="text"
                                      placeholder="Filter records..."
                                      className="table-search-input"
                                      value={tableSearch[msg.id] || ''}
                                      onChange={(e) =>
                                        setTableSearch({
                                          ...tableSearch,
                                          [msg.id]: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <button
                                    className="export-btn"
                                    onClick={() =>
                                      downloadCsv(
                                        msg.result.columns,
                                        msg.result.rows,
                                        `dex_query_${msg.id}.csv`
                                      )
                                    }
                                  >
                                    <Download size={13} /> Export CSV
                                  </button>
                                </div>
                              </div>

                              {/* Table Scroll Area */}
                              <div className="table-scroll-wrap">
                                {(() => {
                                  const term = (tableSearch[msg.id] || '').toLowerCase();
                                  const filteredRows = term
                                    ? msg.result.rows.filter((r) =>
                                        Object.values(r).some((v) =>
                                          String(v || '').toLowerCase().includes(term)
                                        )
                                      )
                                    : msg.result.rows;

                                  if (filteredRows.length === 0) {
                                    return (
                                      <div className="empty-results-message">
                                        No records match your filter criteria.
                                      </div>
                                    );
                                  }

                                  return (
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          {msg.result.columns.map((col) => (
                                            <th key={col}>{col}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {filteredRows.map((row, rIdx) => (
                                          <tr key={rIdx}>
                                            {msg.result.columns.map((col) => {
                                              const val = row[col];
                                              return (
                                                <td key={col}>
                                                  {val === null || val === undefined ? (
                                                    <span className="null-indicator">—</span>
                                                  ) : (
                                                    String(val)
                                                  )}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom Input Composer ──────────────────────────────── */}
        <div className="dex-composer-area">
          <div className="composer-container">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              placeholder="Ask a question about employees, salaries, departments, or sales..."
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="composer-textarea"
            />
            <div className="composer-toolbar">
              <div className="composer-hint">
                <span className="kbd">↵ Enter</span> to run query &nbsp;•&nbsp;{' '}
                <span className="kbd">Shift + Enter</span> for new line
              </div>
              <button
                className="send-query-btn"
                disabled={!input.trim() || loading}
                onClick={() => handleSend()}
              >
                {loading ? <RefreshCw size={15} className="spin-icon" /> : <Send size={15} />}
                <span>{loading ? 'Executing...' : 'Ask Database'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Schema Explorer Drawer (Right Side) ──────────────────── */}
      {showSchemaDrawer && (
        <aside className="dex-drawer">
          <div className="drawer-header">
            <div>
              <h3 className="drawer-title">Database Schema</h3>
              <span className="drawer-subtitle">
                {health.database_name} ({tableNames.length} tables)
              </span>
            </div>
            <button className="close-drawer-btn" onClick={() => setShowSchemaDrawer(false)}>
              ✕
            </button>
          </div>

          <div className="drawer-table-selector">
            {tableNames.map((tbl) => (
              <button
                key={tbl}
                className={`drawer-tab-btn ${selectedTable === tbl ? 'active' : ''}`}
                onClick={() => setSelectedTable(tbl)}
              >
                {tbl}
              </button>
            ))}
          </div>

          {selectedTable && schema[selectedTable] && (
            <div className="drawer-table-content">
              <div className="table-detail-header">
                <h4>Table: <code>{selectedTable}</code></h4>
                <button
                  className="quick-sample-query-btn"
                  onClick={() => {
                    handleSend(`Show the first 10 records from the ${selectedTable} table.`);
                    setShowSchemaDrawer(false);
                  }}
                >
                  Query Table
                </button>
              </div>

              <div className="columns-spec-list">
                <div className="col-spec-header">
                  <span>Column Name</span>
                  <span>Data Type</span>
                  <span>Constraint</span>
                </div>
                {schema[selectedTable]?.columns?.map((c) => {
                  const isPk = schema[selectedTable]?.primary_keys?.includes(c.name);
                  return (
                    <div key={c.name} className="col-spec-row">
                      <span className="col-name">
                        {c.name}
                        {isPk && <span className="pk-tag">PK</span>}
                      </span>
                      <span className="col-type">{c.type}</span>
                      <span className="col-nullable">
                        {c.nullable ? 'NULL' : 'NOT NULL'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {schema[selectedTable]?.foreign_keys?.length > 0 && (
                <div className="fks-section">
                  <h5>Foreign Keys</h5>
                  {schema[selectedTable].foreign_keys.map((fk, idx) => (
                    <div key={idx} className="fk-item">
                      <code>{(fk.constrained_columns || []).join(', ')}</code>
                      <span>→</span>
                      <code>
                        {fk.referred_table}.{(fk.referred_columns || []).join(', ')}
                      </code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
