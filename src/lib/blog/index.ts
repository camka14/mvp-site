import { getPreferredMobileStoreUrl } from '@/lib/mobileAppLinks';
import { SITE_URL } from '@/lib/siteUrl';
import type { BlogAuthor, BlogPostEntry, GuideTopicId } from './types';

export const BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY = {
  name: 'Samuel Razumovskiy',
  image: '/blog/authors/samuel-razumovskiy.jpg',
} satisfies BlogAuthor;

export type GuideTopic = {
  id: GuideTopicId;
  title: string;
  description: string;
};

export const GUIDE_TOPICS = [
  {
    id: 'events',
    title: 'Events',
    description: 'Pickup events, open play, clinics, and one-off registration workflows.',
  },
  {
    id: 'tournaments',
    title: 'Tournaments',
    description: 'Tournament setup, team management, schedules, brackets, scores, and day-of operations.',
  },
  {
    id: 'leagues',
    title: 'Leagues',
    description: 'Season setup, weekly schedules, standings, playoffs, and league communication.',
  },
  {
    id: 'organizations',
    title: 'Organizations',
    description: 'Facility, club, event organizer, staff, public page, payment, and rental workflows.',
  },
] satisfies GuideTopic[];

const createLeagueInBracketiq: BlogPostEntry = {
  slug: 'create-league-in-bracketiq',
  title: 'How to Create a League in BracketIQ',
  description:
    'Create a sports league in BracketIQ by adding league details, team registration, divisions, scoring rules, weekly schedule windows, publishing status, and public page review.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-26',
  publishedAt: '2026-05-26',
  updatedAt: '2026-05-26',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'create a sports league',
  longTailKeywords: [
    'how to create a sports league',
    'sports league setup guide',
    'create an indoor soccer league',
    'create a volleyball league',
    'league registration software',
    'sports league scheduling software',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/create-league-in-bracketiq',
  ctas: [
    {
      label: 'Create a league',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Browse public events',
      href: '/discover',
      variant: 'secondary',
    },
    {
      label: 'Download the app to manage updates on the go',
      href: getPreferredMobileStoreUrl(),
      variant: 'tertiary',
      external: true,
    },
  ],
  faq: [
    {
      question: 'Can I create leagues for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ league setup works for volleyball, pickleball, basketball, tennis, hockey, baseball, football, outdoor soccer, indoor soccer, and other recreational sports.',
    },
    {
      question: 'Does a single-division league still need a division?',
      answer:
        'Yes. BracketIQ uses the division to store capacity, price, age or skill eligibility, registration rules, schedule assignment, and standings behavior, even when every team plays in one group.',
    },
    {
      question: 'Is creating a league the same as managing the league season?',
      answer:
        'No. Creation covers the initial league details, divisions, scoring rules, weekly schedule windows, and publishing setup. League management covers registrations, weekly updates, standings, schedule changes, and playoffs after teams start joining.',
    },
  ],
  ogImageAlt: 'BracketIQ league creation guide preview',
  load: () => import('@/content/blog/create-league-in-bracketiq.mdx'),
};

const tournamentResultsAdvancement: BlogPostEntry = {
  slug: 'tournament-results-advancement',
  title: 'How to Manage Tournament Results, Standings, and Advancement',
  description:
    'Manage tournament results in BracketIQ by reviewing scored matches, entering score updates, confirming standings, automatically seeding advancing teams, and continuing bracket score entry.',
  contentType: 'guide',
  guideTopic: 'tournaments',
  createdAt: '2026-05-26',
  publishedAt: '2026-05-26',
  updatedAt: '2026-05-26',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'tournament results and standings',
  longTailKeywords: [
    'manage tournament results',
    'tournament standings guide',
    'tournament advancement software',
    'pool standings to bracket',
    'tournament score entry software',
    'sports tournament bracket advancement',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/tournament-results-advancement',
  ctas: [
    {
      label: 'Manage tournament results',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Run pool play first',
      href: '/guides/tournament-pool-play',
      variant: 'secondary',
    },
    {
      label: 'Review the tournament management workflow',
      href: '/guides/manage-tournament-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should tournament standings be confirmed?',
      answer:
        'Confirm standings after every score in the division or pool has been entered and reviewed. Once standings are confirmed, BracketIQ can use the rankings to seed advancing teams into bracket matches.',
    },
    {
      question: 'Can BracketIQ move teams from pool standings into the bracket?',
      answer:
        'Yes. When automatic playoff reassignment is enabled, confirmed standings can place advancing teams into the bracket so organizers do not need to copy rankings into another bracket tool.',
    },
    {
      question: 'Can bracket matches be scored the same way as pool matches?',
      answer:
        'Yes. Open the bracket match, confirm the teams and field or court, enter the score by segment, save the result, and then verify the next bracket match updates as expected.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament results and advancement guide preview',
  load: () => import('@/content/blog/tournament-results-advancement.mdx'),
};

const tournamentRegistration: BlogPostEntry = {
  slug: 'tournament-registration',
  title: 'How to Set Up Tournament Registration for Teams and Players',
  description:
    'Set up tournament registration in BracketIQ by confirming team signup, division capacity, pricing, public registration controls, captain team options, and organizer participant review.',
  contentType: 'guide',
  guideTopic: 'tournaments',
  createdAt: '2026-05-26',
  publishedAt: '2026-05-26',
  updatedAt: '2026-05-26',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'tournament registration',
  longTailKeywords: [
    'set up tournament registration',
    'team tournament registration guide',
    'sports tournament registration software',
    'tournament team signup',
    'collect tournament registration payments',
    'tournament division registration',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/tournament-registration',
  ctas: [
    {
      label: 'Set up tournament registration',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create the tournament first',
      href: '/guides/create-tournament-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Manage the tournament after teams join',
      href: '/guides/manage-tournament-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Should tournament registration be team-based or player-based?',
      answer:
        'Use team registration when captains are responsible for entering a team into the tournament. Use player registration when each person signs up independently and the organizer will build teams later.',
    },
    {
      question: 'Can BracketIQ charge a team entry fee for a tournament?',
      answer:
        'Yes. Set the tournament or division price before publishing. Captains see the team entry amount on the public event page and can move toward checkout after selecting the team they manage.',
    },
    {
      question: 'What should organizers check before opening registration?',
      answer:
        'Confirm the tournament type, team size, registration cutoff, required documents, division capacity, team price, public page details, and captain team selection flow before sharing the link.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament registration guide preview',
  load: () => import('@/content/blog/tournament-registration.mdx'),
};

const tournamentPoolPlay: BlogPostEntry = {
  slug: 'tournament-pool-play',
  title: 'How to Run a Tournament With Pool Play',
  description:
    'Run tournament pool play in BracketIQ by checking pool settings, reviewing the schedule, entering results, confirming standings, and seeding teams into the bracket.',
  contentType: 'guide',
  guideTopic: 'tournaments',
  createdAt: '2026-05-25',
  publishedAt: '2026-05-25',
  updatedAt: '2026-05-25',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'tournament pool play',
  longTailKeywords: [
    'how to run tournament pool play',
    'pool play tournament bracket',
    'sports tournament pool play guide',
    'pool play standings and advancement',
    'tournament pool schedule software',
    'indoor soccer pool play tournament',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/tournament-pool-play',
  ctas: [
    {
      label: 'Run pool play in BracketIQ',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create the tournament first',
      href: '/guides/create-tournament-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Manage the tournament day workflow',
      href: '/guides/manage-tournament-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'What is tournament pool play?',
      answer:
        'Pool play groups teams into smaller round robin groups before the bracket. Teams play several pool matches, standings are calculated, and selected teams advance into playoff or championship matches.',
    },
    {
      question: 'When should I confirm pool standings in BracketIQ?',
      answer:
        'Confirm pool standings only after the scores for that pool are entered and reviewed. Once standings are confirmed with automatic playoff reassignment enabled, BracketIQ can seed advancing teams into the bracket.',
    },
    {
      question: 'Can pool play work for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ pool-play workflow works for volleyball, pickleball, basketball, tennis, hockey, baseball, football, outdoor soccer, indoor soccer, and other recreational sports that use pools before brackets.',
    },
  ],
  ogImageAlt: 'BracketIQ pool play tournament guide preview',
  load: () => import('@/content/blog/tournament-pool-play.mdx'),
};

const manageTournamentInBracketiq: BlogPostEntry = {
  slug: 'manage-tournament-in-bracketiq',
  title: 'How to Manage a Tournament in BracketIQ',
  description:
    'Manage a published sports tournament in BracketIQ by reviewing teams, checking the schedule, confirming the bracket, updating match results, and verifying the public page.',
  contentType: 'guide',
  guideTopic: 'tournaments',
  createdAt: '2026-05-24',
  publishedAt: '2026-05-24',
  updatedAt: '2026-05-25',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'manage a sports tournament',
  longTailKeywords: [
    'how to manage a sports tournament',
    'sports tournament management guide',
    'manage tournament teams and schedules',
    'tournament bracket management software',
    'tournament score entry software',
    'indoor soccer tournament management',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/manage-tournament-in-bracketiq',
  ctas: [
    {
      label: 'Manage your tournament',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create a tournament first',
      href: '/guides/create-tournament-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Download the app to manage updates on the go',
      href: getPreferredMobileStoreUrl(),
      variant: 'tertiary',
      external: true,
    },
  ],
  faq: [
    {
      question: 'Should I create a tournament and manage a tournament in the same workflow?',
      answer:
        'No. Create the tournament first so the event, divisions, schedule windows, and public page are set up correctly. Manage the tournament after teams are registering, schedules need review, and matches need score updates.',
    },
    {
      question: 'Can I manage a tournament for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ management workflow applies to volleyball, pickleball, basketball, tennis, hockey, baseball, football, outdoor soccer, and other recreational sports.',
    },
    {
      question: 'What should I check before tournament day?',
      answer:
        'Review the published details, registered teams, bills or documents, schedule, bracket, match score controls, and public page. The goal is to make BracketIQ the source of truth for staff and teams before matches start.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament management guide preview',
  load: () => import('@/content/blog/manage-tournament-in-bracketiq.mdx'),
};

const createTournamentInBracketiq: BlogPostEntry = {
  slug: 'create-tournament-in-bracketiq',
  title: 'How to Create a Tournament in BracketIQ',
  description:
    'Create a sports tournament, add divisions and fields, set schedule windows, publish the event, and verify the public tournament page in BracketIQ.',
  contentType: 'guide',
  guideTopic: 'tournaments',
  createdAt: '2026-05-24',
  publishedAt: '2026-05-24',
  updatedAt: '2026-05-24',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'create a sports tournament',
  longTailKeywords: [
    'how to create a sports tournament',
    'sports tournament setup guide',
    'create an indoor soccer tournament',
    'create a volleyball tournament',
    'tournament registration software',
    'sports tournament scheduling software',
  ],
  readingMinutes: 11,
  canonicalPath: '/guides/create-tournament-in-bracketiq',
  ctas: [
    {
      label: 'Create a tournament',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Browse public events',
      href: '/discover',
      variant: 'secondary',
    },
    {
      label: 'Download the app to manage updates on the go',
      href: getPreferredMobileStoreUrl(),
      variant: 'tertiary',
      external: true,
    },
  ],
  faq: [
    {
      question: 'Can I create tournaments for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ tournament setup applies to volleyball, outdoor soccer, basketball, tennis, hockey, baseball, football, and other recreational sports. Sport-specific articles can add extra logistics after the base tournament is created.',
    },
    {
      question: 'Do I need a division for a single-division tournament?',
      answer:
        'Yes. BracketIQ uses the division to store capacity, price, eligibility, registration rules, and scheduling assignments, even when everyone is playing in one open group.',
    },
    {
      question: 'Is creating a tournament the same as managing tournament day?',
      answer:
        'No. Creation covers the initial event, division, capacity, field or court, and publishing setup. Tournament management covers registrations, schedule updates, check-in, scores, and advancement after teams start joining.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament creation guide preview',
  load: () => import('@/content/blog/create-tournament-in-bracketiq.mdx'),
};

const paidPickupEventPayments: BlogPostEntry = {
  slug: 'paid-pickup-event-payments',
  title: 'How to Create a Paid Pickup Sports Event With BracketIQ',
  description:
    'Create a paid pickup event, set the player price, publish it, and let players pay online with BracketIQ.',
  contentType: 'guide',
  guideTopic: 'events',
  createdAt: '2026-05-22',
  publishedAt: '2026-05-22',
  updatedAt: '2026-05-22',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'pickup sports event payments',
  longTailKeywords: [
    'create a paid pickup sports event',
    'sports pickup event signups',
    'collect payments for pickup games',
    'beach volleyball pickup event',
    'sports event payment software',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/paid-pickup-event-payments',
  ctas: [
    {
      label: 'Create a paid pickup event',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Jump to player payment',
      href: '#player-payment',
      variant: 'secondary',
    },
    {
      label: 'Download the app to manage updates on the go',
      href: getPreferredMobileStoreUrl(),
      variant: 'tertiary',
      external: true,
    },
  ],
  faq: [
    {
      question: 'Do I need an organization account to create a paid pickup event?',
      answer:
        'No. You can create this event from your own profile instead of an organization page. You still need payments turned on before you charge players.',
    },
    {
      question: 'Why does a single pickup event still need a division?',
      answer:
        'BracketIQ uses divisions to know who can join, how many spots are open, and what each player pays. Even if everyone joins the same casual group, add one simple division such as CoEd Open 18+.',
    },
    {
      question: 'What do players pay?',
      answer:
        'Players see the event price plus BracketIQ and Stripe fees. The final total can change after the player chooses how to pay because Stripe fees vary by payment type.',
    },
  ],
  ogImageAlt: 'BracketIQ paid pickup event guide preview',
  load: () => import('@/content/blog/paid-pickup-event-payments.mdx'),
};

const blogPosts = [
  createLeagueInBracketiq,
  tournamentResultsAdvancement,
  tournamentRegistration,
  tournamentPoolPlay,
  manageTournamentInBracketiq,
  createTournamentInBracketiq,
  paidPickupEventPayments,
] satisfies BlogPostEntry[];

const sortByPublishDateDesc = (posts: BlogPostEntry[]) => (
  [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
);

const GUIDE_TOPIC_POST_ORDER = {
  events: ['paid-pickup-event-payments'],
  tournaments: [
    'create-tournament-in-bracketiq',
    'tournament-registration',
    'manage-tournament-in-bracketiq',
    'tournament-pool-play',
    'tournament-results-advancement',
  ],
  leagues: ['create-league-in-bracketiq'],
  organizations: [],
} satisfies Record<GuideTopicId, string[]>;

const sortGuideTopicPosts = (topicId: GuideTopicId, posts: BlogPostEntry[]) => {
  const order = new Map(
    GUIDE_TOPIC_POST_ORDER[topicId].map((slug, index) => [slug, index]),
  );

  return [...posts].sort((a, b) => {
    const aIndex = order.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = order.get(b.slug) ?? Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return b.publishedAt.localeCompare(a.publishedAt);
  });
};

export function getPublishedContentPosts() {
  return sortByPublishDateDesc(
    blogPosts.filter((post) => post.isPublished),
  );
}

export function getPublishedBlogPosts() {
  return sortByPublishDateDesc(
    blogPosts.filter((post) => post.isPublished && post.contentType === 'blog'),
  );
}

export function getPublishedGuidePosts() {
  return sortByPublishDateDesc(
    blogPosts.filter((post) => post.isPublished && post.contentType === 'guide'),
  );
}

export function getBlogPostBySlug(slug: string) {
  return getPublishedBlogPosts().find((post) => post.slug === slug) ?? null;
}

export function getGuidePostBySlug(slug: string) {
  return getPublishedGuidePosts().find((post) => post.slug === slug) ?? null;
}

export function getContentPostBySlug(slug: string) {
  return getPublishedContentPosts().find((post) => post.slug === slug) ?? null;
}

export function getGuideTopics() {
  const guidePosts = getPublishedGuidePosts();
  return GUIDE_TOPICS.map((topic) => ({
    ...topic,
    posts: sortGuideTopicPosts(
      topic.id,
      guidePosts.filter((post) => post.guideTopic === topic.id),
    ),
  }));
}

export function getContentSitemapEntries() {
  return getPublishedContentPosts().map((post) => ({
    url: `${SITE_URL}${post.canonicalPath}`,
    lastModified: post.updatedAt,
  }));
}

export const getBlogSitemapEntries = getContentSitemapEntries;

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}
