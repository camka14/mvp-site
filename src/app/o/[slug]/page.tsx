import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import {
  getPublicOrganizationBySlug,
  getPublicOrganizationCatalog,
  type PublicOrganizationEventCard,
  type PublicOrganizationDivisionCard,
  type PublicOrganizationRentalCard,
  type PublicOrganizationTeamCard,
} from '@/server/publicOrganizationCatalog';
import {
  absoluteUrl,
  createPublicOrganizationMetaDescription,
  createPublicOrganizationStructuredData,
  publicOrganizationPath,
} from '@/server/publicSearchSeo';
import PublicProductGrid from './PublicProductGrid';
import { getOrganizationReviewsPayload } from '@/server/organizationReviews';
import styles from './PublicOrganizationPage.module.css';
import OrganizationClaimCallout from '@/components/ui/OrganizationClaimCallout';
import OrganizationOwnershipBadges from '@/components/ui/OrganizationOwnershipBadges';

export const dynamic = 'force-dynamic';

type PublicOrganizationPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PublicOrganizationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'page' });
  if (!organization) {
    return {};
  }

  const canonicalPath = publicOrganizationPath(organization.slug);
  const description = createPublicOrganizationMetaDescription(organization);
  const title = `${organization.name} Events, Teams, and Rentals | BracketIQ`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(canonicalPath),
      type: 'website',
      images: [
        {
          url: absoluteUrl(organization.logoUrl),
          width: 240,
          height: 240,
          alt: `${organization.name} on BracketIQ`,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [absoluteUrl(organization.logoUrl)],
    },
  };
}

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

const getTeamCapacityLabel = (team: PublicOrganizationTeamCard): string => (
  team.teamSize > 0
    ? `${team.currentSize}/${team.teamSize} full`
    : `${team.currentSize} members`
);

const getTeamCapacityFill = (team: PublicOrganizationTeamCard): number => (
  team.teamSize > 0
    ? Math.max(0, Math.min(100, Math.round((team.currentSize / team.teamSize) * 100)))
    : 0
);

function EventItem({ event }: { event: PublicOrganizationEventCard }) {
  return (
    <Link href={event.detailsUrl} className={styles.item}>
      <Image src={event.imageUrl} alt="" width={640} height={360} className={styles.itemImage} unoptimized />
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{event.name}</h3>
        <p className={styles.itemMeta}>{formatDate(event.start)} - {event.location}</p>
        <p className={styles.itemMeta}>{event.sportName ?? event.eventType} - {formatPrice(event.priceCents)}</p>
        <span className={styles.itemAction}>Register</span>
      </div>
    </Link>
  );
}

function TeamItem({ team }: { team: PublicOrganizationTeamCard }) {
  const capacityLabel = getTeamCapacityLabel(team);
  const capacityFill = getTeamCapacityFill(team);
  const isAffiliateTeam = typeof team.affiliateUrl === 'string' && team.affiliateUrl.trim().length > 0;
  const registrationLabel = isAffiliateTeam
    ? 'External registration'
    : team.joinPolicy === 'REQUEST_TO_JOIN'
      ? 'Request to join'
      : 'Join team';
  const content = (
    <>
      <Image src={team.imageUrl} alt="" width={640} height={360} className={styles.itemImage} unoptimized />
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{team.name}</h3>
        <p className={styles.itemMeta}>{team.sport ?? 'Sport TBD'} - {team.division ?? 'Open'}</p>
        <div className={styles.teamCapacity} aria-label={capacityLabel}>
          <span className={styles.teamCapacityText}>{capacityLabel}</span>
          {team.teamSize > 0 ? (
            <span className={styles.teamCapacityTrack} aria-hidden="true">
              <span className={styles.teamCapacityFill} style={{ width: `${capacityFill}%` }} />
            </span>
          ) : null}
        </div>
        <p className={styles.itemMeta}>
          {isAffiliateTeam
            ? 'External registration'
            : team.joinPolicy === 'REQUEST_TO_JOIN'
            ? `Request to join - ${formatPrice(team.registrationPriceCents)}`
            : team.openRegistration
            ? `Open registration - ${formatPrice(team.registrationPriceCents)}`
            : 'Registration closed'}
        </p>
        {team.registrationUrl ? (
          <span className={styles.itemAction}>
            {registrationLabel}
          </span>
        ) : null}
        {team.openRegistration && team.isFull ? (
          <button type="button" className={styles.itemButtonDisabled} disabled>
            Team full
          </button>
        ) : null}
      </div>
    </>
  );

  if (team.registrationUrl) {
    return (
      <Link
        href={team.registrationUrl}
        className={styles.item}
        target={isAffiliateTeam ? '_blank' : undefined}
        rel={isAffiliateTeam ? 'noopener noreferrer' : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={styles.item}>
      {content}
    </div>
  );
}

function RentalItem({ rental }: { rental: PublicOrganizationRentalCard }) {
  return (
    <a href={rental.detailsUrl} className={styles.item}>
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{rental.facilityName ?? rental.fieldName}</h3>
        {rental.facilityName ? (
          <p className={styles.itemMeta}>{rental.fieldName}</p>
        ) : null}
        <p className={styles.itemMeta}>{rental.location ?? rental.facilityLocation ?? 'Location TBD'}</p>
        <p className={styles.itemMeta}>{formatDate(rental.start)} - {formatPrice(rental.priceCents)}</p>
        <span className={styles.itemAction}>Book rental</span>
      </div>
    </a>
  );
}

function DivisionItem({ division }: { division: PublicOrganizationDivisionCard }) {
  const content = (
    <>
      <h3 className={styles.divisionTitle}>{division.name}</h3>
      {division.divisionTypeName ? <p className={styles.itemMeta}>{division.divisionTypeName}</p> : null}
      {division.description ? <p className={styles.itemMeta}>{division.description}</p> : null}
      {division.registrationUrl ? <span className={styles.itemAction}>Register</span> : null}
    </>
  );
  if (division.registrationUrl) {
    return (
      <a
        href={division.registrationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.divisionCard}
      >
        {content}
      </a>
    );
  }
  return <article className={styles.divisionCard}>{content}</article>;
}

export default async function PublicOrganizationPage({ params }: PublicOrganizationPageProps) {
  const { slug } = await params;
  const catalog = await getPublicOrganizationCatalog(slug, { surface: 'page', limit: 8 });
  if (!catalog) {
    notFound();
  }

  const { organization, events, teams, divisions, rentals, products } = catalog;
  const reviewPayload = await getOrganizationReviewsPayload(organization.id, null, { limit: 6 });
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
          {reviewPayload.summary.reviewCount > 0 ? (
            <div className={styles.heroRating} aria-label={`${reviewPayload.summary.averageRating} out of 5 stars`}>
              <span className={styles.heroRatingValue}>{reviewPayload.summary.averageRating?.toFixed(1)}</span>
              <span className={styles.stars} aria-hidden="true">★★★★★</span>
              <span>{reviewPayload.summary.reviewCount} {reviewPayload.summary.reviewCount === 1 ? 'review' : 'reviews'}</span>
            </div>
          ) : null}
          <div className={styles.heroActions}>
            <a href="#events" className={styles.button}>Find events</a>
            <a href="#rentals" className={styles.buttonSecondary}>Book rentals</a>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.ownershipPanel} aria-label="Organization ownership">
          <OrganizationOwnershipBadges
            organization={{
              $id: organization.id,
              originType: organization.originType,
              ownershipStatus: organization.ownershipStatus,
              claimVerificationLevel: organization.claimVerificationLevel,
            }}
          />
          <OrganizationClaimCallout
            organization={{
              $id: organization.id,
              name: organization.name,
              originType: organization.originType,
              ownershipStatus: organization.ownershipStatus,
              claimVerificationLevel: organization.claimVerificationLevel,
            }}
          />
        </section>
        {divisions.length > 0 ? (
          <section id="divisions" className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Divisions</h2>
                <p className={styles.sectionText}>Current organization divisions and registration options.</p>
              </div>
            </div>
            <div className={styles.divisionGrid}>
              {divisions.slice(0, 2).map((division) => (
                <DivisionItem key={division.id} division={division} />
              ))}
            </div>
            {divisions.length > 2 ? (
              <details className={styles.divisionMore}>
                <summary className={styles.sectionAction}>More ({divisions.length - 2})</summary>
                <div className={styles.divisionGrid}>
                  {divisions.slice(2).map((division) => (
                    <DivisionItem key={division.id} division={division} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        ) : null}
        <section id="reviews" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Reviews</h2>
              <p className={styles.sectionText}>Feedback from people in the BracketIQ community.</p>
            </div>
            <Link href={`/organizations/${encodeURIComponent(organization.id)}/reviews`} className={styles.sectionAction}>
              Write a review
            </Link>
          </div>
          {reviewPayload.reviews.length ? (
            <div className={styles.reviewGrid}>
              {reviewPayload.reviews.map((review) => (
                <article key={review.id} className={styles.review}>
                  <div className={styles.reviewHeader}>
                    {review.reviewer.profileImageUrl ? (
                      <Image src={review.reviewer.profileImageUrl} alt="" width={44} height={44} className={styles.reviewAvatar} unoptimized />
                    ) : <span className={styles.reviewAvatarFallback} aria-hidden="true">{review.reviewer.displayName.slice(0, 1)}</span>}
                    <div>
                      <p className={styles.reviewName}>{review.reviewer.displayName}</p>
                      <p className={styles.reviewRating} aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                    </div>
                  </div>
                  {review.body ? <p className={styles.reviewBody}>{review.body}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No reviews yet.</p>
          )}
        </section>

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
      <BlogStructuredData data={createPublicOrganizationStructuredData({ organization, events })} />
    </main>
  );
}
