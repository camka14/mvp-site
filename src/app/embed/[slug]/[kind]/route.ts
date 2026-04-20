import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicOrganizationCatalog,
  type PublicOrganizationCatalog,
  type PublicWidgetKind,
} from '@/server/publicOrganizationCatalog';

export const dynamic = 'force-dynamic';

const WIDGET_KINDS = new Set<PublicWidgetKind>(['all', 'events', 'teams', 'rentals', 'products']);

const escapeHtml = (value: unknown): string => (
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const formatPrice = (cents: number): string => (
  cents > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : 'Free'
);

const formatDate = (value: string | null): string => {
  if (!value) return 'Date TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const sectionEnabled = (requested: PublicWidgetKind, section: Exclude<PublicWidgetKind, 'all'>): boolean => (
  requested === 'all' || requested === section
);

const renderEvents = (catalog: PublicOrganizationCatalog): string => {
  if (!catalog.events.length) {
    return '<p class="empty">No public events are open right now.</p>';
  }
  return catalog.events.map((event) => `
    <a class="card media-card" href="${escapeHtml(event.detailsUrl)}" target="_top" rel="noopener">
      <img src="${escapeHtml(event.imageUrl)}" alt="" class="media" />
      <span class="label">${escapeHtml(event.eventType)}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${escapeHtml(formatDate(event.start))} · ${escapeHtml(event.location)}</p>
      <p>${escapeHtml(event.sportName ?? 'Sport TBD')} · ${escapeHtml(formatPrice(event.priceCents))}</p>
      <strong>Register</strong>
    </a>
  `).join('');
};

const renderTeams = (catalog: PublicOrganizationCatalog): string => {
  if (!catalog.teams.length) {
    return '<p class="empty">No public teams are listed yet.</p>';
  }
  return catalog.teams.map((team) => `
    <article class="card media-card">
      <img src="${escapeHtml(team.imageUrl)}" alt="" class="media" />
      <span class="label">${escapeHtml(team.sport ?? 'Team')}</span>
      <h3>${escapeHtml(team.name)}</h3>
      <p>${escapeHtml(team.division ?? 'Open')}</p>
    </article>
  `).join('');
};

const renderRentals = (catalog: PublicOrganizationCatalog): string => {
  if (!catalog.rentals.length) {
    return '<p class="empty">No public rentals are listed yet.</p>';
  }
  return catalog.rentals.map((rental) => `
    <a class="card" href="${escapeHtml(rental.detailsUrl)}" target="_top" rel="noopener">
      <span class="label">Rental</span>
      <h3>${escapeHtml(rental.fieldName)}</h3>
      <p>${escapeHtml(rental.location ?? 'Location TBD')}</p>
      <p>${escapeHtml(formatDate(rental.start))} · ${escapeHtml(formatPrice(rental.priceCents))}</p>
      <strong>View rentals</strong>
    </a>
  `).join('');
};

const renderProducts = (catalog: PublicOrganizationCatalog): string => {
  if (!catalog.products.length) {
    return '<p class="empty">No public products are listed yet.</p>';
  }
  return catalog.products.map((product) => `
    <a class="card" href="${escapeHtml(product.detailsUrl)}" target="_top" rel="noopener">
      <span class="label">${escapeHtml(product.period.toLowerCase())}</span>
      <h3>${escapeHtml(product.name)}</h3>
      ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ''}
      <p>${escapeHtml(formatPrice(product.priceCents))}</p>
      <strong>View product</strong>
    </a>
  `).join('');
};

const renderSection = (title: string, body: string): string => `
  <section>
    <div class="section-heading">
      <h2>${escapeHtml(title)}</h2>
    </div>
    <div class="grid">${body}</div>
  </section>
`;

const renderWidgetHtml = (catalog: PublicOrganizationCatalog, kind: PublicWidgetKind): string => {
  const { organization } = catalog;
  const sections = [
    sectionEnabled(kind, 'events') ? renderSection('Upcoming events', renderEvents(catalog)) : '',
    sectionEnabled(kind, 'teams') ? renderSection('Teams', renderTeams(catalog)) : '',
    sectionEnabled(kind, 'rentals') ? renderSection('Rentals', renderRentals(catalog)) : '',
    sectionEnabled(kind, 'products') ? renderSection('Products', renderProducts(catalog)) : '',
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base target="_top" />
  <title>${escapeHtml(organization.name)} on BracketIQ</title>
  <style>
    :root { --primary: ${escapeHtml(organization.brandPrimaryColor)}; --accent: ${escapeHtml(organization.brandAccentColor)}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211d; background: #f7faf8; }
    .wrap { padding: 18px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .logo { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; background: white; border: 1px solid #d7e3dd; }
    h1 { margin: 0; font-size: clamp(1.3rem, 4vw, 2rem); line-height: 1.05; letter-spacing: 0; }
    .intro { margin: 4px 0 0; color: #53645d; line-height: 1.45; }
    section { padding: 18px 0; border-top: 1px solid #dbe6df; }
    .section-heading { margin-bottom: 12px; }
    h2 { margin: 0; font-size: 1.1rem; letter-spacing: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { display: flex; min-height: 100%; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid #d7e3dd; border-radius: 8px; background: white; color: inherit; text-decoration: none; }
    .media-card { padding: 0; overflow: hidden; }
    .media-card > :not(.media) { margin-left: 14px; margin-right: 14px; }
    .media-card strong { margin-bottom: 14px; }
    .media { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #e8f0ec; }
    .label { width: fit-content; border-radius: 8px; padding: 3px 8px; background: color-mix(in srgb, var(--primary) 12%, white); color: var(--primary); font-size: 0.76rem; font-weight: 800; }
    h3 { margin: 0; font-size: 1rem; line-height: 1.25; letter-spacing: 0; }
    p { margin: 0; color: #53645d; line-height: 1.45; }
    strong { margin-top: auto; color: var(--primary); }
    .empty { grid-column: 1 / -1; }
    .brand-link { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <img src="${escapeHtml(organization.logoUrl)}" alt="" class="logo" />
      <div>
        <a class="brand-link" href="/o/${escapeHtml(organization.slug)}" target="_top" rel="noopener"><h1>${escapeHtml(organization.name)}</h1></a>
        <p class="intro">${escapeHtml(organization.publicIntroText)}</p>
      </div>
    </header>
    ${sections}
  </main>
  <script>
    const postHeight = () => {
      parent.postMessage({ type: 'bracketiq:widget-height', height: document.documentElement.scrollHeight }, '*');
    };
    addEventListener('load', postHeight);
    new ResizeObserver(postHeight).observe(document.body);
    setTimeout(postHeight, 250);
  </script>
</body>
</html>`;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind: rawKind } = await params;
  const kind = rawKind as PublicWidgetKind;
  if (!WIDGET_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '6');
  const catalog = await getPublicOrganizationCatalog(slug, { surface: 'widget', limit });
  if (!catalog) {
    return NextResponse.json({ error: 'Widget not available' }, { status: 404 });
  }

  return new NextResponse(renderWidgetHtml(catalog, kind), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

