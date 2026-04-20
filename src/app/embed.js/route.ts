import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRIPT = `
(() => {
  const currentScript = document.currentScript;
  const origin = new URL(currentScript && currentScript.src ? currentScript.src : window.location.href).origin;
  const widgets = Array.from(document.querySelectorAll('[data-bracketiq-widget]'));
  const frames = new Map();

  const normalizeKind = (value) => {
    const kind = String(value || 'events').toLowerCase();
    return ['all', 'events', 'teams', 'rentals', 'products'].includes(kind) ? kind : 'events';
  };

  widgets.forEach((target) => {
    if (target.dataset.bracketiqReady === '1') return;
    const org = String(target.dataset.org || '').trim().toLowerCase();
    if (!org) return;
    const kind = normalizeKind(target.dataset.kind);
    const params = new URLSearchParams();
    if (target.dataset.limit) params.set('limit', target.dataset.limit);
    const iframe = document.createElement('iframe');
    iframe.src = origin + '/embed/' + encodeURIComponent(org) + '/' + encodeURIComponent(kind) + (params.toString() ? '?' + params.toString() : '');
    iframe.title = target.dataset.title || 'BracketIQ widget';
    iframe.width = '100%';
    iframe.height = target.dataset.height || '520';
    iframe.loading = 'lazy';
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.maxWidth = '100%';
    iframe.style.display = 'block';
    target.replaceChildren(iframe);
    target.dataset.bracketiqReady = '1';
    frames.set(iframe.contentWindow, iframe);
  });

  window.addEventListener('message', (event) => {
    if (!event || event.origin !== origin) return;
    const iframe = frames.get(event.source);
    if (!iframe) return;
    const data = event.data || {};
    if (data.type !== 'bracketiq:widget-height') return;
    const height = Number(data.height);
    if (!Number.isFinite(height) || height < 120) return;
    iframe.height = String(Math.ceil(height));
  });
})();
`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
