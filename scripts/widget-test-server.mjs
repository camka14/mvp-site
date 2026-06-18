import http from 'node:http';

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = 'localhost';
const DEFAULT_BRACKETIQ_ORIGIN = 'http://localhost:3000';

const parsePort = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
};

const normalizeOrigin = (value) => {
  const trimmed = String(value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return DEFAULT_BRACKETIQ_ORIGIN;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return DEFAULT_BRACKETIQ_ORIGIN;
  }
};

const escapeHtml = (value) => (
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const buildHtml = ({ bracketiqOrigin, port }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BracketIQ Widget Test Host</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f8fb;
        --panel: #ffffff;
        --border: #d8dee8;
        --text: #162033;
        --muted: #5c6678;
        --accent: #0f766e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
      }

      h2 {
        margin: 0;
        font-size: 16px;
      }

      p {
        margin: 6px 0 0;
        color: var(--muted);
        line-height: 1.45;
      }

      label {
        display: grid;
        gap: 6px;
        color: #263247;
        font-size: 13px;
        font-weight: 700;
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        color: var(--text);
        font: inherit;
        font-size: 14px;
      }

      input,
      select {
        height: 40px;
        padding: 0 12px;
      }

      textarea {
        min-height: 160px;
        padding: 12px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        line-height: 1.45;
      }

      button {
        height: 40px;
        border: 1px solid var(--accent);
        border-radius: 8px;
        background: var(--accent);
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 0 14px;
      }

      button.secondary {
        background: #ffffff;
        color: var(--accent);
      }

      .header,
      .panel,
      .preview {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel);
      }

      .header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding: 18px;
      }

      .origin {
        width: min(360px, 100%);
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
        gap: 16px;
        margin-top: 16px;
      }

      .panel {
        padding: 16px;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .preview {
        min-height: 680px;
        overflow: hidden;
      }

      .preview iframe {
        display: block;
        width: 100%;
        min-height: 760px;
        border: 0;
        background: #ffffff;
      }

      .status {
        min-height: 20px;
        color: var(--muted);
        font-size: 13px;
      }

      .warning {
        color: #8a4b00;
      }

      @media (max-width: 900px) {
        .header,
        .grid {
          grid-template-columns: 1fr;
        }

        .header {
          display: grid;
        }

        .row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="header">
        <div>
          <h1>BracketIQ Widget Test Host</h1>
          <p>This page is served from <strong>localhost:${escapeHtml(port)}</strong> so widgets run from a separate embed origin.</p>
          <p class="warning">Paste only snippets you trust. This local tester intentionally executes widget scripts.</p>
        </div>
        <label class="origin">
          BracketIQ app origin
          <input id="origin" value="${escapeHtml(bracketiqOrigin)}" autocomplete="off" />
        </label>
      </section>

      <section class="grid">
        <div class="panel stack">
          <h2>Snippet Builder</h2>
          <div class="row">
            <label>
              Organization slug
              <input id="orgSlug" value="razumly" autocomplete="off" />
            </label>
            <label>
              Widget type
              <select id="kind">
                <option value="registration">Event registration</option>
                <option value="events">Events list</option>
                <option value="teams">Teams</option>
                <option value="standings">Standings</option>
                <option value="brackets">Brackets</option>
                <option value="all">All sections</option>
              </select>
            </label>
          </div>
          <label>
            Event ID
            <input id="eventId" value="035df393-5a97-435e-b144-4c0179dd53d9" autocomplete="off" />
          </label>
          <div class="actions">
            <button type="button" id="buildIframe">Build iframe</button>
            <button type="button" id="buildScript" class="secondary">Build script</button>
            <button type="button" id="render">Render snippet</button>
          </div>
          <label>
            Widget snippet
            <textarea id="snippet" spellcheck="false"></textarea>
          </label>
          <p id="status" class="status"></p>
        </div>

        <div class="preview">
          <iframe id="preview" title="Widget preview"></iframe>
        </div>
      </section>
    </main>

    <script>
      const originInput = document.getElementById('origin');
      const orgSlugInput = document.getElementById('orgSlug');
      const kindInput = document.getElementById('kind');
      const eventIdInput = document.getElementById('eventId');
      const snippetInput = document.getElementById('snippet');
      const preview = document.getElementById('preview');
      const status = document.getElementById('status');

      const normalizeOrigin = () => originInput.value.trim().replace(/\\/+$/, '') || '${escapeHtml(bracketiqOrigin)}';
      const normalizeOrgSlug = () => orgSlugInput.value.trim().toLowerCase();
      const normalizeEventId = () => eventIdInput.value.trim();

      const buildWidgetPath = () => {
        const orgSlug = encodeURIComponent(normalizeOrgSlug());
        const kind = kindInput.value;
        if (kind === 'registration') {
          return '/embed/' + orgSlug + '/registration/' + encodeURIComponent(normalizeEventId());
        }
        return '/embed/' + orgSlug + '/' + encodeURIComponent(kind);
      };

      const buildIframeSnippet = () => {
        snippetInput.value = '<iframe src="' + normalizeOrigin() + buildWidgetPath() + '" title="BracketIQ widget" width="100%" height="760" style="border:0;max-width:100%;" loading="lazy"></iframe>';
      };

      const buildScriptSnippet = () => {
        const kind = kindInput.value;
        const attrs = [
          'data-bracketiq-widget',
          'data-org="' + normalizeOrgSlug() + '"',
          'data-kind="' + kind + '"',
          kind === 'registration' ? 'data-event-id="' + normalizeEventId() + '"' : ''
        ].filter(Boolean).join(' ');
        snippetInput.value = '<div ' + attrs + '></div>\\n<script async src="' + normalizeOrigin() + '/embed.js"><\\/script>';
      };

      const renderSnippet = () => {
        const snippet = snippetInput.value.trim();
        if (!snippet) {
          status.textContent = 'Add an iframe or script snippet first.';
          return;
        }
        preview.srcdoc = [
          '<!doctype html>',
          '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
          '<style>body{margin:0;padding:16px;background:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.host-note{font-size:12px;color:#5c6678;margin:0 0 12px}</style>',
          '</head><body>',
          '<p class="host-note">External host: ' + window.location.origin + '</p>',
          snippet,
          '</body></html>'
        ].join('\\n');
        status.textContent = 'Rendered from ' + window.location.origin + ' at ' + new Date().toLocaleTimeString() + '.';
      };

      document.getElementById('buildIframe').addEventListener('click', () => {
        buildIframeSnippet();
        renderSnippet();
      });
      document.getElementById('buildScript').addEventListener('click', () => {
        buildScriptSnippet();
        renderSnippet();
      });
      document.getElementById('render').addEventListener('click', renderSnippet);

      buildScriptSnippet();
    </script>
  </body>
</html>`;

const port = parsePort(process.env.WIDGET_TEST_PORT ?? process.env.PORT);
const host = String(process.env.WIDGET_TEST_HOST ?? process.env.HOST ?? DEFAULT_HOST);
const bracketiqOrigin = normalizeOrigin(process.env.BRACKETIQ_ORIGIN);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, port, bracketiqOrigin }));
    return;
  }

  if (url.pathname !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(buildHtml({ bracketiqOrigin, port }));
});

server.listen(port, host, () => {
  console.log(`[widget-test] ready on http://${host}:${port}`);
  console.log(`[widget-test] BracketIQ origin: ${bracketiqOrigin}`);
});
