import { NextRequest, NextResponse } from 'next/server';
import { formatStandingsDelta, formatStandingsPoints } from '@/lib/standingsDisplay';
import {
  getPublicBracketWidgetPage,
  getPublicOrganizationCatalog,
  getPublicStandingsWidgetPage,
  formatPublicEventTypeLabel,
  normalizePublicEventTypes,
  PUBLIC_EVENT_TYPES,
  type PublicBracketWidgetPage,
  type PublicEventDateRule,
  type PublicOrganizationCatalog,
  type PublicOrganizationEventCard,
  type PublicProductPurchaseMode,
  type PublicPaginationInfo,
  type PublicStandingsWidgetPage,
  type PublicWidgetKind,
} from '@/server/publicOrganizationCatalog';

export const dynamic = 'force-dynamic';

const WIDGET_KINDS = new Set<PublicWidgetKind>(['all', 'events', 'teams', 'rentals', 'products', 'standings', 'brackets']);
const DATE_RULES = new Set<PublicEventDateRule>(['all', 'upcoming', 'today', 'week', 'month']);
const PRODUCT_PURCHASE_MODES = new Set<PublicProductPurchaseMode>(['all', 'single', 'subscription']);

type WidgetRenderOptions = {
  showDateFilter: boolean;
  showEventTypeFilter: boolean;
  dateRule: PublicEventDateRule;
  dateFrom: string | null;
  dateTo: string | null;
  eventTypes: string[];
  includeChildWeeklyEvents: boolean;
  teamOpenRegistrationOnly: boolean;
  productPurchaseMode: PublicProductPurchaseMode;
  eventIds: string[];
  divisionId: string | null;
  limit: number;
  page: number;
};

type PublicBracketLane = NonNullable<PublicBracketWidgetPage['winnersLane']>;
const BRACKET_CONNECTOR_COLOR = '#aeb9c7';

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

const getTeamCapacityLabel = (team: PublicOrganizationCatalog['teams'][number]): string => (
  team.teamSize > 0
    ? `${team.currentSize}/${team.teamSize} full`
    : `${team.currentSize} members`
);

const getTeamCapacityFill = (team: PublicOrganizationCatalog['teams'][number]): number => (
  team.teamSize > 0
    ? Math.max(0, Math.min(100, Math.round((team.currentSize / team.teamSize) * 100)))
    : 0
);

const parseBooleanParam = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseOptionalBooleanParam = (value: string | null, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return fallback;
};

const parseDateRule = (value: string | null): PublicEventDateRule => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return DATE_RULES.has(normalized as PublicEventDateRule)
    ? normalized as PublicEventDateRule
    : 'all';
};

const parsePositiveIntegerParam = (value: string | null, fallback: number, max?: number): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.max(1, Math.trunc(parsed));
  return typeof max === 'number' ? Math.min(normalized, max) : normalized;
};

const parseProductPurchaseMode = (value: string | null): PublicProductPurchaseMode => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PRODUCT_PURCHASE_MODES.has(normalized as PublicProductPurchaseMode)
    ? normalized as PublicProductPurchaseMode
    : 'all';
};

const parseIdList = (value: string | null): string[] => (
  Array.from(new Set(
    String(value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  ))
);

const getWidgetRenderOptions = (req: NextRequest): WidgetRenderOptions => ({
  showDateFilter: parseBooleanParam(req.nextUrl.searchParams.get('showDateFilter')),
  showEventTypeFilter: parseBooleanParam(req.nextUrl.searchParams.get('showEventTypeFilter')),
  dateRule: parseDateRule(req.nextUrl.searchParams.get('dateRule')),
  dateFrom: req.nextUrl.searchParams.get('dateFrom'),
  dateTo: req.nextUrl.searchParams.get('dateTo'),
  eventTypes: normalizePublicEventTypes(req.nextUrl.searchParams.get('eventTypes')),
  includeChildWeeklyEvents: parseOptionalBooleanParam(req.nextUrl.searchParams.get('includeChildWeeklyEvents'), true),
  teamOpenRegistrationOnly: parseBooleanParam(req.nextUrl.searchParams.get('teamOpenRegistrationOnly')),
  productPurchaseMode: parseProductPurchaseMode(req.nextUrl.searchParams.get('productPurchaseMode')),
  eventIds: parseIdList(req.nextUrl.searchParams.get('eventIds')),
  divisionId: req.nextUrl.searchParams.get('divisionId'),
  limit: parsePositiveIntegerParam(req.nextUrl.searchParams.get('limit'), 6, 24),
  page: parsePositiveIntegerParam(req.nextUrl.searchParams.get('page'), 1),
});

const sectionEnabled = (requested: PublicWidgetKind, section: Exclude<PublicWidgetKind, 'all'>): boolean => (
  requested === 'all' || requested === section
);

const getFilterEventTypes = (
  events: PublicOrganizationEventCard[],
  lockedEventTypes: string[],
): string[] => {
  const eventTypes = Array.from(new Set([
    ...PUBLIC_EVENT_TYPES,
    ...lockedEventTypes,
    ...events
      .map((event) => event.eventType.trim().toUpperCase())
      .filter(Boolean),
  ]));
  return eventTypes.length ? eventTypes : [...PUBLIC_EVENT_TYPES];
};

const renderEventFilters = (
  catalog: PublicOrganizationCatalog,
  options: WidgetRenderOptions,
): string => {
  if (!options.showDateFilter && !options.showEventTypeFilter) {
    return '';
  }

  const dateFilters = options.showDateFilter
    ? `
      <fieldset class="filter-group" data-filter-group="date">
        <legend>Date</legend>
        ${[
        ['all', 'All dates'],
        ['upcoming', 'Upcoming'],
        ['today', 'Today'],
        ['week', 'This week'],
        ['month', 'This month'],
      ].map(([value, label]) => `
          <label class="filter-option">
            <input type="radio" name="dateFilter" value="${escapeHtml(value)}" ${value === options.dateRule ? 'checked' : ''} />
            <span>${escapeHtml(label)}</span>
          </label>
        `).join('')}
      </fieldset>
    `
    : '';

  const eventTypeFilters = options.showEventTypeFilter
    ? `
      <fieldset class="filter-group" data-filter-group="event-type">
        <legend>Event type</legend>
        ${getFilterEventTypes(catalog.events, options.eventTypes).map((eventType) => {
          const checked = options.eventTypes.length === 0 || options.eventTypes.includes(eventType);
          return `
          <label class="filter-option">
            <input type="checkbox" name="eventTypeFilter" value="${escapeHtml(eventType)}" ${checked ? 'checked' : ''} />
            <span>${escapeHtml(formatPublicEventTypeLabel(eventType))}</span>
          </label>
        `;
        }).join('')}
      </fieldset>
    `
    : '';

  return `<aside class="filters" aria-label="Event filters">${dateFilters}${eventTypeFilters}</aside>`;
};

const renderEventPagination = (pageInfo: PublicPaginationInfo | undefined): string => {
  if (!pageInfo || (!pageInfo.hasPrevious && !pageInfo.hasNext)) {
    return '';
  }

  return `
    <nav class="widget-pagination" aria-label="Event pages">
      <button type="button" data-widget-page="${Math.max(1, pageInfo.page - 1)}" ${pageInfo.hasPrevious ? '' : 'disabled'}>
        Previous
      </button>
      <span>Page ${escapeHtml(pageInfo.page)}</span>
      <button type="button" data-widget-page="${pageInfo.page + 1}" ${pageInfo.hasNext ? '' : 'disabled'}>
        Next
      </button>
    </nav>
  `;
};

const renderEvents = (catalog: PublicOrganizationCatalog, options: WidgetRenderOptions): string => {
  const filters = renderEventFilters(catalog, options);
  const pagination = renderEventPagination(catalog.eventPageInfo);
  if (!catalog.events.length) {
    return `
      <div class="${filters ? 'event-layout' : ''}">
        ${filters}
        <div>
          <p class="empty">${filters ? 'No events match these filters.' : 'No public events are open right now.'}</p>
          ${pagination}
        </div>
      </div>
    `;
  }

  const cards = catalog.events.map((event) => {
    const eventType = event.eventType.trim().toUpperCase();
    return `
      <a
        class="card media-card event-card"
        href="${escapeHtml(event.detailsUrl)}"
        target="_top"
        rel="noopener"
        data-event-card
        data-event-type="${escapeHtml(eventType)}"
        data-event-start="${escapeHtml(event.start)}"
      >
        <img src="${escapeHtml(event.imageUrl)}" alt="" class="media" />
        <span class="label">${escapeHtml(event.eventTypeLabel || formatPublicEventTypeLabel(eventType))}</span>
        <h3>${escapeHtml(event.name)}</h3>
        <p>${escapeHtml(formatDate(event.start))} - ${escapeHtml(event.location)}</p>
        <p>${escapeHtml(event.sportName ?? 'Sport TBD')} - ${escapeHtml(formatPrice(event.priceCents))}</p>
        <strong>Register</strong>
      </a>
    `;
  }).join('');

  return `
    <div class="${filters ? 'event-layout' : ''}">
      ${filters}
      <div>
        <div class="grid event-grid" data-events-grid>${cards}</div>
        <p class="empty" data-events-empty hidden>No events match these filters.</p>
        ${pagination}
      </div>
    </div>
  `;
};

const renderTeams = (catalog: PublicOrganizationCatalog, options: WidgetRenderOptions): string => {
  if (!catalog.teams.length) {
    return `<p class="empty">${
      options.teamOpenRegistrationOnly
        ? 'No teams with open registration are listed yet.'
        : 'No public teams are listed yet.'
    }</p>`;
  }
  return catalog.teams.map((team) => {
    const capacityLabel = getTeamCapacityLabel(team);
    const capacityFill = getTeamCapacityFill(team);
    const cardBody = `
      <img src="${escapeHtml(team.imageUrl)}" alt="" class="media" />
      <span class="label">${escapeHtml(team.sport ?? 'Team')}</span>
      <h3>${escapeHtml(team.name)}</h3>
      <p>${escapeHtml(team.division ?? 'Open')}</p>
      <div class="team-capacity" aria-label="${escapeHtml(capacityLabel)}">
        <span class="team-capacity-text">${escapeHtml(capacityLabel)}</span>
        ${team.teamSize > 0 ? `
          <span class="team-capacity-track" aria-hidden="true">
            <span class="team-capacity-fill" style="width: ${capacityFill}%"></span>
          </span>
        ` : ''}
      </div>
      <p>${
        team.openRegistration
          ? `Open registration - ${escapeHtml(formatPrice(team.registrationPriceCents))}`
          : 'Registration closed'
      }</p>
      ${
        team.registrationUrl
          ? '<span class="card-action-link">Join team</span>'
          : team.openRegistration && team.isFull
            ? '<button type="button" class="card-action-button" disabled>Team full</button>'
            : ''
      }
    `;
    return team.registrationUrl
      ? `
        <a class="card media-card" href="${escapeHtml(team.registrationUrl)}" target="_top" rel="noopener">
          ${cardBody}
        </a>
      `
      : `
        <article class="card media-card">
          ${cardBody}
        </article>
      `;
  }).join('');
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
      <p>${escapeHtml(formatDate(rental.start))} - ${escapeHtml(formatPrice(rental.priceCents))}</p>
      <strong>Book rental</strong>
    </a>
  `).join('');
};

const formatProductPeriodLabel = (period: string): string => (
  String(period).trim().toLowerCase() === 'single'
    ? 'Single purchase'
    : 'Subscription'
);

const renderProducts = (catalog: PublicOrganizationCatalog): string => {
  if (!catalog.products.length) {
    return '<p class="empty">No public products are listed yet.</p>';
  }
  return catalog.products.map((product) => `
    <a class="card" href="${escapeHtml(product.detailsUrl)}" target="_top" rel="noopener">
      <span class="label">${escapeHtml(formatProductPeriodLabel(product.period))}</span>
      <h3>${escapeHtml(product.name)}</h3>
      ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ''}
      <p>${escapeHtml(formatPrice(product.priceCents))}</p>
      <strong>Buy now</strong>
    </a>
  `).join('');
};

const renderSection = (title: string, body: string): string => `
  <section>
    <div class="section-heading">
      <h2>${escapeHtml(title)}</h2>
    </div>
    ${body.includes('data-events-grid') || body.includes('event-layout') ? body : `<div class="grid">${body}</div>`}
  </section>
`;

const renderWidgetPagination = (
  pageInfo: PublicPaginationInfo,
  label: string,
): string => {
  if (!pageInfo.hasPrevious && !pageInfo.hasNext) {
    return '';
  }

  return `
    <nav class="widget-pagination" aria-label="${escapeHtml(label)} pages">
      <button type="button" data-widget-page="${Math.max(1, pageInfo.page - 1)}" ${pageInfo.hasPrevious ? '' : 'disabled'}>
        &larr; Previous
      </button>
      <span>Page ${escapeHtml(pageInfo.page)}</span>
      <button type="button" data-widget-page="${pageInfo.page + 1}" ${pageInfo.hasNext ? '' : 'disabled'}>
        Next &rarr;
      </button>
    </nav>
  `;
};

const renderWidgetDateFilters = (options: WidgetRenderOptions): string => {
  if (!options.showDateFilter || options.eventIds.length > 0) {
    return '';
  }

  const selectedRule = options.dateRule === 'upcoming' ? 'upcoming' : 'all';
  return `
    <fieldset class="widget-filter-group" data-filter-group="date">
      <legend>Events</legend>
      ${[
        ['upcoming', 'Upcoming'],
        ['all', 'All'],
      ].map(([value, label]) => `
        <label class="filter-option">
          <input type="radio" name="dateFilter" value="${escapeHtml(value)}" ${value === selectedRule ? 'checked' : ''} />
          <span>${escapeHtml(label)}</span>
        </label>
      `).join('')}
    </fieldset>
  `;
};

const renderDivisionSelect = (
  divisionOptions: Array<{ value: string; label: string }>,
  selectedDivisionId: string | null,
): string => {
  if (divisionOptions.length <= 1) {
    return '';
  }

  return `
    <label class="widget-select-group">
      <span>Division</span>
      <select data-widget-division class="widget-select">
        ${divisionOptions.map((option) => `
          <option value="${escapeHtml(option.value)}" ${option.value === selectedDivisionId ? 'selected' : ''}>
            ${escapeHtml(option.label)}
          </option>
        `).join('')}
      </select>
    </label>
  `;
};

const renderStandingsTable = (
  page: PublicStandingsWidgetPage & { options: WidgetRenderOptions },
): string => {
  if (!page.currentEvent) {
    return '<p class="empty">No public league standings are available right now.</p>';
  }

  const controls = [
    renderWidgetDateFilters(page.options),
    renderDivisionSelect(page.divisionOptions, page.selectedDivisionId),
    renderWidgetPagination(page.eventPageInfo, 'Standings events'),
  ].filter(Boolean).join('');

  if (!page.division || page.division.standings.length === 0) {
    return `
      <section>
        <div class="widget-detail-header">
          <div>
            <span class="label">League standings</span>
            <h2>${escapeHtml(page.currentEvent.name)}</h2>
            <p class="widget-subtitle">${escapeHtml(page.selectedDivisionName ?? 'Division TBD')}</p>
          </div>
          <div class="widget-detail-controls">${controls}</div>
        </div>
        <p class="empty">No standings are available for this division yet.</p>
      </section>
    `;
  }

  return `
    <section>
      <div class="widget-detail-header">
        <div>
          <span class="label">League standings</span>
          <h2>${escapeHtml(page.currentEvent.name)}</h2>
          <p class="widget-subtitle">${escapeHtml(page.selectedDivisionName ?? page.division.divisionName)}</p>
        </div>
        <div class="widget-detail-controls">${controls}</div>
      </div>
      <div class="standings-table-wrap">
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Final Pts</th>
            </tr>
          </thead>
          <tbody>
            ${page.division.standings.map((row) => `
              <tr>
                <td>${escapeHtml(row.position)}</td>
                <td>${escapeHtml(row.teamName)}</td>
                <td>${escapeHtml(row.wins)}</td>
                <td>${escapeHtml(row.losses)}</td>
                <td>${escapeHtml(row.draws)}</td>
                <td class="points-cell">
                  <strong>${escapeHtml(formatStandingsPoints(row.finalPoints))}</strong>
                  <span>${escapeHtml(formatStandingsDelta(row.pointsDelta))}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
};

const renderPublicBracketCard = (
  card: PublicBracketLane['cardsById'][string],
  options: { losersBracket: boolean },
): string => {
  const matchLabel = typeof card.matchId === 'number' ? `Match #${card.matchId}` : 'Match';
  const team1Score = card.team1Points.length ? card.team1Points.join(' - ') : '-';
  const team2Score = card.team2Points.length ? card.team2Points.join(' - ') : '-';
  const className = `public-bracket-card public-bracket-card-shell ${options.losersBracket ? 'is-losers' : ''}`.trim();

  return `
    <article
      class="${className}"
      data-public-bracket-card="${escapeHtml(card.id)}"
    >
      <div class="public-bracket-time-badge">${escapeHtml(card.startLabel)}</div>
      <div class="public-bracket-card-inner">
        <div class="public-bracket-card-header">
          <span class="public-bracket-match-label">${escapeHtml(matchLabel)}</span>
          <span class="public-bracket-field-label">${escapeHtml(card.fieldLabel)}</span>
        </div>
        <div class="public-bracket-team-list">
          <div class="public-bracket-team-row">
            <span class="public-bracket-team-name">${escapeHtml(card.team1Name)}</span>
            <strong class="public-bracket-team-score">${escapeHtml(team1Score)}</strong>
          </div>
          <div class="public-bracket-team-row">
            <span class="public-bracket-team-name">${escapeHtml(card.team2Name)}</span>
            <strong class="public-bracket-team-score">${escapeHtml(team2Score)}</strong>
          </div>
        </div>
      </div>
    </article>
  `;
};

const renderBracketCanvasMarkup = (
  lane: PublicBracketLane,
  options: {
    markerId: string;
    losersBracket: boolean;
  },
): string => {
  if (!lane.matchIds.length) {
    return '<p class="empty">No bracket rounds are available yet.</p>';
  }

  const cards = lane.matchIds
    .filter((matchId) => Boolean(lane.positionById[matchId] && lane.cardsById[matchId]))
    .map((matchId) => {
      const position = lane.positionById[matchId];
      const card = lane.cardsById[matchId];
      return `
        <div
          class="absolute bracket-card-slot"
          style="position:absolute;left:${lane.metrics.paddingLeft + position.x}px;top:${lane.metrics.paddingTop + position.y}px;width:${lane.metrics.cardWidth}px;height:${lane.metrics.cardHeight}px;"
          data-bracket-match-id="${escapeHtml(matchId)}"
        >
          ${renderPublicBracketCard(card, { losersBracket: options.losersBracket })}
        </div>
      `;
    }).join('');

  const paths = lane.connections.map((connection) => {
    const midX = (connection.x1 + connection.x2) / 2;
    const d = `M ${connection.x1} ${connection.y1} L ${midX} ${connection.y1} L ${midX} ${connection.y2} L ${connection.x2} ${connection.y2}`;
    return `
      <path
        d="${escapeHtml(d)}"
        stroke="${BRACKET_CONNECTOR_COLOR}"
        stroke-width="2"
        fill="none"
        stroke-linecap="square"
        marker-end="url(#${escapeHtml(options.markerId)})"
      ></path>
    `;
  }).join('');

  return `
    <div
      class="bracket-canvas"
      style="position:relative;display:inline-block;width:${lane.contentSize.width}px;height:${lane.contentSize.height}px;"
    >
      ${cards}
      <svg
        class="bracket-canvas-svg"
        width="100%"
        height="100%"
        style="position:absolute;inset:0;pointer-events:none"
        aria-hidden="true"
      >
        <defs>
          <marker id="${escapeHtml(options.markerId)}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${BRACKET_CONNECTOR_COLOR}"></polygon>
          </marker>
        </defs>
        ${paths}
      </svg>
    </div>
  `;
};

const renderBracketLane = (
  lane: PublicBracketLane,
  options: {
    title: string;
    markerId: string;
    losersBracket: boolean;
  },
): string => {
  return `
    <div class="bracket-lane">
      <h3>${escapeHtml(options.title)}</h3>
      <div class="bracket-scroll">${renderBracketCanvasMarkup(lane, options)}</div>
    </div>
  `;
};

const renderBracketWidget = (
  page: PublicBracketWidgetPage & { options: WidgetRenderOptions },
): string => {
  if (!page.currentEvent) {
    return '<p class="empty">No public bracket events are available right now.</p>';
  }

  const controls = [
    renderWidgetDateFilters(page.options),
    renderDivisionSelect(page.divisionOptions, page.selectedDivisionId),
    renderWidgetPagination(page.eventPageInfo, 'Bracket events'),
  ].filter(Boolean).join('');

  const hasWinnersLane = Boolean(page.winnersLane?.matchIds.length);
  const hasLosersLane = Boolean(page.losersLane?.matchIds.length);
  if (!hasWinnersLane && !hasLosersLane) {
    return `
      <section>
        <div class="widget-detail-header">
          <div>
            <span class="label">Bracket view</span>
            <h2>${escapeHtml(page.currentEvent.name)}</h2>
            <p class="widget-subtitle">${escapeHtml(page.selectedDivisionName ?? 'Division TBD')}</p>
          </div>
          <div class="widget-detail-controls">${controls}</div>
        </div>
        <p class="empty">No bracket has been generated for this division yet.</p>
      </section>
    `;
  }

  return `
    <section>
      <div class="widget-detail-header">
        <div>
          <span class="label">Bracket view</span>
          <h2>${escapeHtml(page.currentEvent.name)}</h2>
          <p class="widget-subtitle">${escapeHtml(page.selectedDivisionName ?? 'Division TBD')}</p>
        </div>
        <div class="widget-detail-controls">${controls}</div>
      </div>
      ${page.winnersLane ? renderBracketLane(page.winnersLane, {
        title: 'Winners Bracket',
        markerId: 'public-bracket-winners-arrowhead',
        losersBracket: false,
      }) : ''}
      ${page.hasLosersBracket && page.losersLane ? renderBracketLane(page.losersLane, {
        title: 'Losers Bracket',
        markerId: 'public-bracket-losers-arrowhead',
        losersBracket: true,
      }) : ''}
    </section>
  `;
};

const renderCatalogSections = (
  catalog: PublicOrganizationCatalog,
  kind: PublicWidgetKind,
  options: WidgetRenderOptions,
): string => ([
  sectionEnabled(kind, 'events') ? renderSection('Events', renderEvents(catalog, options)) : '',
  sectionEnabled(kind, 'teams') ? renderSection('Teams', renderTeams(catalog, options)) : '',
  sectionEnabled(kind, 'rentals') ? renderSection('Rentals', renderRentals(catalog)) : '',
  sectionEnabled(kind, 'products') ? renderSection('Products', renderProducts(catalog)) : '',
].filter(Boolean).join(''));

const renderWidgetDocument = (
  organization: PublicOrganizationCatalog['organization'],
  body: string,
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base target="_top" />
  <title>${escapeHtml(organization.name)} on BracketIQ</title>
  <style>
    :root { --primary: ${escapeHtml(organization.brandPrimaryColor)}; --accent: ${escapeHtml(organization.brandAccentColor)}; --bracket-connector: ${BRACKET_CONNECTOR_COLOR}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211d; background: #f7faf8; }
    .wrap { padding: 18px; }
    section { padding: 18px 0; border-top: 1px solid #dbe6df; }
    section:first-child { padding-top: 0; border-top: 0; }
    .section-heading { margin-bottom: 12px; }
    h2 { margin: 0; font-size: 1.1rem; letter-spacing: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .event-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 500px)); justify-content: start; align-items: stretch; }
    .event-layout { display: grid; grid-template-columns: minmax(150px, 190px) minmax(0, 1fr); gap: 14px; align-items: start; }
    .filters { display: grid; gap: 12px; padding: 12px; border: 1px solid #d7e3dd; border-radius: 8px; background: white; }
    .filter-group { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
    .filter-group legend { margin-bottom: 2px; color: #17211d; font-size: 0.82rem; font-weight: 800; }
    .filter-option { display: flex; align-items: center; gap: 8px; color: #53645d; font-size: 0.86rem; line-height: 1.35; }
    .filter-option input { width: 16px; height: 16px; accent-color: var(--primary); }
    .widget-pagination { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 14px; }
    .widget-pagination button { min-height: 38px; border: 1px solid #c8d8d0; border-radius: 8px; padding: 0 14px; background: white; color: #17211d; font: inherit; font-weight: 700; cursor: pointer; }
    .widget-pagination button:not(:disabled):hover { border-color: var(--primary); color: var(--primary); }
    .widget-pagination button:disabled { cursor: not-allowed; opacity: 0.5; }
    .widget-pagination span { color: #53645d; font-size: 0.9rem; font-weight: 700; }
    .card { display: flex; min-height: 100%; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid #d7e3dd; border-radius: 8px; background: white; color: inherit; text-decoration: none; }
    .card[hidden] { display: none; }
    .media-card { padding: 0; overflow: hidden; }
    .media-card > :not(.media) { margin-left: 14px; margin-right: 14px; }
    .media-card strong { margin-bottom: 14px; }
    .media { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #e8f0ec; }
    .label { width: fit-content; border-radius: 8px; padding: 3px 8px; background: color-mix(in srgb, var(--primary) 12%, white); color: var(--primary); font-size: 0.76rem; font-weight: 800; }
    h3 { margin: 0; font-size: 1rem; line-height: 1.25; letter-spacing: 0; }
    p { margin: 0; color: #53645d; line-height: 1.45; }
    strong { margin-top: auto; color: var(--primary); }
    .team-capacity { display: grid; gap: 6px; }
    .team-capacity-text { color: #53645d; font-size: 0.84rem; font-weight: 700; }
    .team-capacity-track { height: 8px; overflow: hidden; border-radius: 999px; background: #dbe6df; }
    .team-capacity-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--accent) 42%, var(--primary))); }
    .card-action-link { margin-top: auto; color: var(--primary); font-weight: 800; }
    .card-action-button { margin-top: auto; align-self: flex-start; border: 0; border-radius: 999px; padding: 8px 12px; background: #e6ece9; color: #73847c; font: inherit; font-weight: 800; }
    .card-action-button:disabled { cursor: not-allowed; }
    .empty { grid-column: 1 / -1; }
    .empty[hidden] { display: none; }
    .widget-detail-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
    .widget-subtitle { margin-top: 6px; color: #53645d; font-size: 0.95rem; font-weight: 600; }
    .widget-detail-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: flex-end; gap: 12px; }
    .widget-filter-group { display: grid; gap: 8px; min-width: 180px; margin: 0; padding: 0; border: 0; }
    .widget-filter-group legend { margin-bottom: 2px; color: #53645d; font-size: 0.76rem; font-weight: 800; text-transform: uppercase; }
    .widget-select-group { display: grid; gap: 6px; min-width: 220px; color: #53645d; font-size: 0.76rem; font-weight: 800; text-transform: uppercase; }
    .widget-select { min-height: 40px; border: 1px solid #c8d8d0; border-radius: 8px; padding: 0 12px; background: white; color: #17211d; font: inherit; font-size: 0.92rem; text-transform: none; }
    .standings-table-wrap { overflow-x: auto; }
    .standings-table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d7e3dd; border-radius: 10px; overflow: hidden; }
    .standings-table th, .standings-table td { padding: 12px 14px; border-bottom: 1px solid #e6eeea; text-align: left; }
    .standings-table th { color: #53645d; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    .standings-table td { font-size: 0.92rem; color: #17211d; }
    .standings-table tbody tr:last-child td { border-bottom: 0; }
    .points-cell { text-align: right; white-space: nowrap; }
    .points-cell strong { margin-right: 8px; color: #17211d; }
    .points-cell span { color: #53645d; font-size: 0.82rem; }
    .bracket-lane + .bracket-lane { margin-top: 24px; }
    .bracket-lane h3 { margin: 0 0 12px; font-size: 0.95rem; }
    .bracket-scroll { overflow-x: auto; overflow-y: visible; padding-bottom: 10px; }
    .bracket-canvas { max-width: none; }
    .bracket-canvas-svg { overflow: visible; }
    .bracket-card-slot { display: block; }
    .public-bracket-card { position: relative; width: 100%; height: 100%; }
    .public-bracket-card-shell { width: 100%; height: 100%; }
    .public-bracket-time-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      max-width: calc(100% - 20px);
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 5px 12px;
      background: color-mix(in srgb, var(--primary) 92%, #0f172a);
      color: white;
      font-size: 0.72rem;
      font-weight: 800;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
      z-index: 2;
    }
    .public-bracket-card.is-losers .public-bracket-time-badge {
      background: color-mix(in srgb, #ea580c 88%, #7c2d12);
    }
    .public-bracket-card-inner {
      display: flex;
      height: 100%;
      flex-direction: column;
      gap: 12px;
      border: 2px solid color-mix(in srgb, var(--primary) 22%, #cbd5e1);
      border-radius: 16px;
      background: white;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      padding: 18px 16px 16px;
    }
    .public-bracket-card.is-losers .public-bracket-card-inner {
      border-color: #fdba74;
    }
    .public-bracket-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      color: #53645d;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .public-bracket-match-label { color: #17211d; }
    .public-bracket-field-label {
      max-width: 112px;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .public-bracket-team-list { display: grid; gap: 10px; margin-top: 4px; }
    .public-bracket-team-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 48px;
      border-radius: 10px;
      background: #f7faf8;
      padding: 12px 14px;
    }
    .public-bracket-team-name {
      min-width: 0;
      color: #17211d;
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.25;
    }
    .public-bracket-team-score {
      margin-top: 0;
      flex-shrink: 0;
      color: #17211d;
      font-size: 0.84rem;
      font-weight: 800;
      text-align: right;
      white-space: nowrap;
    }
    .bracket-canvas path { vector-effect: non-scaling-stroke; }
    @media (max-width: 720px) {
      .event-layout { grid-template-columns: 1fr; }
      .event-grid { grid-template-columns: 1fr; }
      .filters { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .widget-detail-header { flex-direction: column; }
      .widget-detail-controls { width: 100%; justify-content: flex-start; }
      .widget-select-group { width: 100%; min-width: 0; }
      .public-bracket-field-label { max-width: 92px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    ${body}
  </main>
  <script>
    const postHeight = () => {
      parent.postMessage({ type: 'bracketiq:widget-height', height: document.documentElement.scrollHeight }, '*');
    };

    const getDateRange = (filterValue) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (filterValue === 'today') {
        return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
      }
      if (filterValue === 'week') {
        return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
      }
      if (filterValue === 'month') {
        return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, start.getDate()) };
      }
      if (filterValue === 'upcoming') {
        return { start, end: null };
      }
      return null;
    };

    const eventMatchesDate = (card, filterValue) => {
      const range = getDateRange(filterValue);
      if (!range) return true;
      const start = new Date(card.dataset.eventStart || '');
      if (Number.isNaN(start.getTime())) return false;
      if (range.start && start < range.start) return false;
      if (range.end && start >= range.end) return false;
      return true;
    };

    const applyEventFilters = () => {
      const cards = Array.from(document.querySelectorAll('[data-event-card]'));
      if (!cards.length) return;
      const selectedDate = document.querySelector('input[name="dateFilter"]:checked')?.value || 'all';
      const checkedTypes = Array.from(document.querySelectorAll('input[name="eventTypeFilter"]:checked'))
        .map((input) => input.value);
      const hasTypeControls = document.querySelectorAll('input[name="eventTypeFilter"]').length > 0;
      let visibleCount = 0;
      cards.forEach((card) => {
        const matchesType = !hasTypeControls || checkedTypes.includes(card.dataset.eventType || '');
        const matchesDate = eventMatchesDate(card, selectedDate);
        const isVisible = matchesType && matchesDate;
        card.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });
      const empty = document.querySelector('[data-events-empty]');
      if (empty) empty.hidden = visibleCount > 0;
      postHeight();
    };

    const refetchEventsFromFilters = () => {
      const url = new URL(window.location.href);
      const selectedDate = document.querySelector('input[name="dateFilter"]:checked')?.value;
      if (selectedDate) {
        url.searchParams.set('dateRule', selectedDate);
        url.searchParams.delete('dateFrom');
        url.searchParams.delete('dateTo');
      }

      const typeControls = Array.from(document.querySelectorAll('input[name="eventTypeFilter"]'));
      if (typeControls.length > 0) {
        const selectedTypes = typeControls
          .filter((input) => input.checked)
          .map((input) => input.value)
          .filter(Boolean);
        if (!selectedTypes.length) {
          applyEventFilters();
          return;
        }
        url.searchParams.set('eventTypes', selectedTypes.join(','));
      }

      url.searchParams.set('page', '1');
      window.location.assign(url.toString());
    };

    document.querySelectorAll('[data-widget-page]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const page = button.getAttribute('data-widget-page');
        if (!page) return;
        const url = new URL(window.location.href);
        url.searchParams.set('page', page);
        window.location.assign(url.toString());
      });
    });

    document.querySelectorAll('[data-widget-division]').forEach((select) => {
      select.addEventListener('change', () => {
        const url = new URL(window.location.href);
        const value = select.value || '';
        if (value) {
          url.searchParams.set('divisionId', value);
        } else {
          url.searchParams.delete('divisionId');
        }
        window.location.assign(url.toString());
      });
    });

    document.querySelectorAll('input[name="dateFilter"], input[name="eventTypeFilter"]').forEach((input) => {
      input.addEventListener('change', refetchEventsFromFilters);
    });
    addEventListener('load', postHeight);
    new ResizeObserver(postHeight).observe(document.body);
    applyEventFilters();
    setTimeout(postHeight, 250);
  </script>
</body>
</html>`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind: rawKind } = await params;
  const kind = rawKind as PublicWidgetKind;
  if (!WIDGET_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const widgetOptions = getWidgetRenderOptions(req);

  if (kind === 'standings') {
    const standingsPage = await getPublicStandingsWidgetPage(slug, {
      page: widgetOptions.page,
      dateRule: widgetOptions.dateRule,
      eventIds: widgetOptions.eventIds,
      divisionId: widgetOptions.divisionId,
    });
    if (!standingsPage) {
      return NextResponse.json({ error: 'Widget not available' }, { status: 404 });
    }

    return new NextResponse(
      renderWidgetDocument(
        standingsPage.organization,
        renderStandingsTable({
          ...standingsPage,
          options: widgetOptions,
        }),
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (kind === 'brackets') {
    const bracketPage = await getPublicBracketWidgetPage(slug, {
      page: widgetOptions.page,
      dateRule: widgetOptions.dateRule,
      eventIds: widgetOptions.eventIds,
      divisionId: widgetOptions.divisionId,
    });
    if (!bracketPage) {
      return NextResponse.json({ error: 'Widget not available' }, { status: 404 });
    }

    return new NextResponse(
      renderWidgetDocument(
        bracketPage.organization,
        renderBracketWidget({
          ...bracketPage,
          options: widgetOptions,
        }),
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const catalog = await getPublicOrganizationCatalog(slug, {
    surface: 'widget',
    limit: widgetOptions.limit,
    eventPage: widgetOptions.page,
    eventTypes: widgetOptions.eventTypes,
    dateRule: widgetOptions.dateRule,
    dateFrom: widgetOptions.dateFrom,
    dateTo: widgetOptions.dateTo,
    includeChildWeeklyEvents: widgetOptions.includeChildWeeklyEvents,
    teamOpenRegistrationOnly: widgetOptions.teamOpenRegistrationOnly,
    productPurchaseMode: widgetOptions.productPurchaseMode,
    eventIds: widgetOptions.eventIds,
  });
  if (!catalog) {
    return NextResponse.json({ error: 'Widget not available' }, { status: 404 });
  }

  return new NextResponse(
    renderWidgetDocument(catalog.organization, renderCatalogSections(catalog, kind, widgetOptions)),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
