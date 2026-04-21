import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getPublicOrganizationCatalog,
  type PublicOrganizationEventCard,
  type PublicOrganizationRentalCard,
  type PublicOrganizationTeamCard,
} from '@/server/publicOrganizationCatalog';
import PublicProductGrid from './PublicProductGrid';
import styles from './PublicOrganizationPage.module.css';

export const dynamic = 'force-dynamic';

const formatPrice = (cents: number): string => (
  cents > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : 'Free'
);

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'Date TBD';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date TBD';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

function EventItem({ event }: { event: PublicOrganizationEventCard }) {
  return (
    <Link href={event.detailsUrl} className={styles.item}>
      <Image src={event.imageUrl} alt="" width={640} height={360} className={styles.itemImage} unoptimized />
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{event.name}</h3>
        <p className={styles.itemMeta}>{formatDate(event.start)} · {event.location}</p>
        <p className={styles.itemMeta}>{event.sportName ?? event.eventType} · {formatPrice(event.priceCents)}</p>
        <span className={styles.itemAction}>Register</span>
      </div>
    </Link>
  );
}

function TeamItem({ team }: { team: PublicOrganizationTeamCard }) {
  return (
    <div className={styles.item}>
      <Image src={team.imageUrl} alt="" width={640} height={360} className={styles.itemImage} unoptimized />
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{team.name}</h3>
        <p className={styles.itemMeta}>{team.sport ?? 'Sport TBD'} · {team.division ?? 'Open'}</p>
      </div>
    </div>
  );
}

function RentalItem({ rental }: { rental: PublicOrganizationRentalCard }) {
  return (
    <a href={rental.detailsUrl} className={styles.item}>
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{rental.fieldName}</h3>
        <p className={styles.itemMeta}>{rental.location ?? 'Location TBD'}</p>
        <p className={styles.itemMeta}>{formatDate(rental.start)} · {formatPrice(rental.priceCents)}</p>
        <span className={styles.itemAction}>Book rental</span>
      </div>
    </a>
  );
}

export default async function PublicOrganizationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getPublicOrganizationCatalog(slug, { surface: 'page', limit: 8 });
  if (!catalog) {
    notFound();
  }

  const { organization, events, teams, rentals, products } = catalog;
  const pageStyle = {
    '--org-primary': organization.brandPrimaryColor,
    '--org-accent': organization.brandAccentColor,
  } as CSSProperties;

  return (
    <main className={styles.page} style={pageStyle}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.brandRow}>
            <Image src={organization.logoUrl} alt="" width={76} height={76} className={styles.logo} unoptimized />
            <div>
              <p className={styles.eyebrow}>BracketIQ</p>
              <p className={styles.orgName}>{organization.name}</p>
            </div>
          </div>
          <h1 className={styles.headline}>{organization.publicHeadline}</h1>
          <p className={styles.intro}>{organization.publicIntroText}</p>
          <div className={styles.heroActions}>
            <a href="#events" className={styles.button}>Find events</a>
            <a href="#rentals" className={styles.buttonSecondary}>Book rentals</a>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        <section id="events" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Upcoming events</h2>
              <p className={styles.sectionText}>Leagues, tournaments, weekly sessions, and open events.</p>
            </div>
          </div>
          {events.length ? (
            <div className={styles.grid}>{events.map((event) => <EventItem key={event.id} event={event} />)}</div>
          ) : (
            <p className={styles.empty}>No public events are open right now.</p>
          )}
        </section>

        <section id="teams" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Teams</h2>
              <p className={styles.sectionText}>Active organization teams and roster groups.</p>
            </div>
          </div>
          {teams.length ? (
            <div className={styles.grid}>{teams.map((team) => <TeamItem key={team.id} team={team} />)}</div>
          ) : (
            <p className={styles.empty}>No public teams are listed yet.</p>
          )}
        </section>

        <section id="rentals" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Rentals</h2>
              <p className={styles.sectionText}>Available field and court reservations.</p>
            </div>
          </div>
          {rentals.length ? (
            <div className={styles.grid}>{rentals.map((rental) => <RentalItem key={rental.id} rental={rental} />)}</div>
          ) : (
            <p className={styles.empty}>No public rentals are listed yet.</p>
          )}
        </section>

        <section id="products" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Products</h2>
              <p className={styles.sectionText}>Memberships, passes, and organization products.</p>
            </div>
          </div>
          {products.length ? (
            <PublicProductGrid slug={slug} organization={organization} products={products} />
          ) : (
            <p className={styles.empty}>No public products are listed yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
