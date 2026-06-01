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

const createOrganizationInBracketiq: BlogPostEntry = {
  slug: 'create-organization-in-bracketiq',
  title: 'How to Create and Set Up an Organization in BracketIQ',
  description:
    'Create a sports organization in BracketIQ by setting profile details, visibility, sports, location, tax and facility settings, the organization dashboard, public page, widgets, and staff access.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-28',
  publishedAt: '2026-05-28',
  updatedAt: '2026-05-28',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'create a sports organization in BracketIQ',
  longTailKeywords: [
    'sports organization setup guide',
    'sports club management software setup',
    'sports facility organization page',
    'event organizer organization setup',
    'sports organization public page',
    'BracketIQ organization guide',
  ],
  readingMinutes: 8,
  canonicalPath: '/guides/create-organization-in-bracketiq',
  ctas: [
    {
      label: 'Create your organization',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Set up the public page next',
      href: '/guides/create-public-page-for-sports-organization',
      variant: 'secondary',
    },
    {
      label: 'Create a league next',
      href: '/guides/create-league-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should I create an organization instead of a personal event?',
      answer:
        'Create an organization when a club, facility, event organizer, or staff group needs a shared workspace for public pages, hosted events, teams, fields, rentals, payments, customer history, or staff access. A personal event is enough for a simple one-off event managed by one person.',
    },
    {
      question: 'Should the organization be listed or unlisted?',
      answer:
        'Use Listed when the organization should appear in public discovery. Use Unlisted when you only want people to reach the organization from a direct link, embedded widget, or shared event page.',
    },
    {
      question: 'What should I set up after creating the organization?',
      answer:
        'Most organizers should review the dashboard, enable the public page, invite staff, and then add the next operational workflow such as fields, teams, rentals, leagues, tournaments, or paid events.',
    },
  ],
  ogImageAlt: 'BracketIQ organization setup guide preview',
  load: () => import('@/content/blog/create-organization-in-bracketiq.mdx'),
};

const createPublicPageForSportsOrganization: BlogPostEntry = {
  slug: 'create-public-page-for-sports-organization',
  title: 'How to Create a Public Page for Your Sports Organization',
  description:
    'Create a public BracketIQ organization page by setting the public slug, brand colors, page visibility, widgets, headline, intro text, preview links, and embed snippets.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-28',
  publishedAt: '2026-05-28',
  updatedAt: '2026-05-28',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'public page for a sports organization',
  longTailKeywords: [
    'sports organization public page',
    'sports club public page setup',
    'sports facility website widgets',
    'embed sports event listings',
    'club event registration page',
    'BracketIQ public page guide',
  ],
  readingMinutes: 7,
  canonicalPath: '/guides/create-public-page-for-sports-organization',
  ctas: [
    {
      label: 'Set up your public page',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Create the organization first',
      href: '/guides/create-organization-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Set up online registration',
      href: '/guides/registration-league-tournament',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Do I need an organization before creating a public page?',
      answer:
        'Yes. The public page belongs to a BracketIQ organization, so create the organization first and then use its Public Page tab to set the slug, brand colors, visibility, widgets, headline, and intro text.',
    },
    {
      question: 'What should I check before sharing the organization page?',
      answer:
        'Confirm the public slug, brand colors, headline, intro text, page enablement, preview URL, and the visitor-facing sections for events, teams, rentals, and products before sending the link to players or parents.',
    },
    {
      question: 'When should I use BracketIQ widgets?',
      answer:
        'Use widgets when the organization already has its own website but wants BracketIQ events, rentals, teams, or products embedded there. Enable widgets, choose the filters, and copy the generated iframe or script snippet.',
    },
  ],
  ogImageAlt: 'BracketIQ public organization page guide preview',
  load: () => import('@/content/blog/create-public-page-for-sports-organization.mdx'),
};

const organizationPaymentProcessing: BlogPostEntry = {
  slug: 'organization-payment-processing',
  title: 'How to Set Up Payment Processing for Your BracketIQ Organization',
  description:
    'Set up organization payment processing in BracketIQ by connecting Stripe, completing hosted onboarding, checking verification status, and confirming paid registrations, rentals, and products are ready.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-29',
  publishedAt: '2026-05-29',
  updatedAt: '2026-05-29',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'set up payment processing for a sports organization',
  longTailKeywords: [
    'sports organization payment processing',
    'sports facility Stripe onboarding',
    'club registration payments setup',
    'sports event payment processing guide',
    'BracketIQ organization payments',
    'collect payments for sports registrations',
  ],
  readingMinutes: 8,
  canonicalPath: '/guides/organization-payment-processing',
  ctas: [
    {
      label: 'Set up payment processing',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Create the organization first',
      href: '/guides/create-organization-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Set up online registration',
      href: '/guides/registration-league-tournament',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Does BracketIQ show the Stripe onboarding screens in the guide?',
      answer:
        'No. Stripe-hosted onboarding can include sensitive business, identity, and bank details, and the exact screens vary by account requirements. The guide screenshots only show BracketIQ-controlled setup and verification surfaces.',
    },
    {
      question: 'What should I do if my organization still says unverified?',
      answer:
        'Reopen onboarding from the BracketIQ Payments card and finish any remaining Stripe requirements. Stripe may need more business, representative, tax, or bank information before payments and payouts are fully ready.',
    },
    {
      question: 'Which organization workflows use payment processing?',
      answer:
        'A connected organization payment account supports paid event registration, league and tournament team registration, rentals, store products, customer payment records, refunds, and payout readiness for that organization.',
    },
  ],
  ogImageAlt: 'BracketIQ organization payment processing guide preview',
  load: () => import('@/content/blog/organization-payment-processing.mdx'),
};

const manageSportsFacility: BlogPostEntry = {
  slug: 'manage-sports-facility',
  title: 'How to Manage a Sports Facility With BracketIQ',
  description:
    'Manage a sports facility in BracketIQ by setting up organization workflows for fields or courts, rentals, events, products, payments, public pages, widgets, and staff access.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-31',
  publishedAt: '2026-05-31',
  updatedAt: '2026-05-31',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'manage a sports facility with BracketIQ',
  longTailKeywords: [
    'sports facility management software guide',
    'manage sports facility rentals',
    'sports facility event registration',
    'court and field rental management',
    'sports facility payments and public pages',
    'BracketIQ facility management guide',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/manage-sports-facility',
  ctas: [
    {
      label: 'Manage your facility',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Create the organization first',
      href: '/guides/create-organization-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Set up payment processing',
      href: '/guides/organization-payment-processing',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Should a sports facility start with fields, events, or the public page?',
      answer:
        'Start with the organization profile, then add the fields, courts, or surfaces that determine what can be scheduled. After the facility inventory is clear, publish events, rentals, products, and the public page.',
    },
    {
      question: 'Can one facility manage rentals and events in the same BracketIQ organization?',
      answer:
        'Yes. BracketIQ keeps fields or courts, rental availability, leagues, tournaments, pickup events, products, payments, staff, and public listings together under the facility organization.',
    },
    {
      question: 'When should a facility connect Stripe?',
      answer:
        'Connect Stripe before publishing paid registrations, rentals, or products. That gives staff time to finish verification, review pricing, and test the public checkout path before customers arrive.',
    },
  ],
  ogImageAlt: 'BracketIQ sports facility management guide preview',
  load: () => import('@/content/blog/manage-sports-facility.mdx'),
};

const manageSportsClub: BlogPostEntry = {
  slug: 'manage-sports-club',
  title: 'How to Manage a Sports Club With BracketIQ',
  description:
    'Manage a sports club in BracketIQ by organizing teams, players, parents, staff roles, permissions, registrations, payments, schedules, public pages, and mobile access.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-31',
  publishedAt: '2026-05-31',
  updatedAt: '2026-05-31',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'manage a sports club with BracketIQ',
  longTailKeywords: [
    'sports club management software guide',
    'manage club teams and rosters',
    'sports club staff permissions',
    'parent and player communication software',
    'club registration payments and schedules',
    'BracketIQ sports club guide',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/manage-sports-club',
  ctas: [
    {
      label: 'Manage your club',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Set up club registration',
      href: '/guides/registration-league-tournament',
      variant: 'secondary',
    },
    {
      label: 'Create the organization first',
      href: '/guides/create-organization-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Can BracketIQ manage club teams and staff in one place?',
      answer:
        'Yes. A club organization can hold team lists, staff access, role-based permissions, events, registration workflows, customers, payments, public pages, and mobile access together.',
    },
    {
      question: 'How should clubs assign permissions?',
      answer:
        'Assign permissions by responsibility. Club directors may need broad access, coaches may need teams and rosters, coordinators may need events and schedules, and finance staff may need payments, bills, products, and refunds.',
    },
    {
      question: 'Are customers the same as team rosters?',
      answer:
        'No. Teams and rosters track who plays together. Customers help the club understand parents, guardians, payers, repeat participants, and billing or support relationships.',
    },
  ],
  ogImageAlt: 'BracketIQ sports club management guide preview',
  load: () => import('@/content/blog/manage-sports-club.mdx'),
};

const clubPlayersParentsTeams: BlogPostEntry = {
  slug: 'club-players-parents-teams',
  title: 'How Clubs Can Manage Players, Parents, Teams, and Events',
  description:
    'Manage club players, parents, teams, rosters, tryouts, clinics, camps, registrations, staff permissions, schedules, payments, public pages, and mobile access in BracketIQ.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-05-31',
  publishedAt: '2026-05-31',
  updatedAt: '2026-05-31',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'manage club players parents and teams',
  longTailKeywords: [
    'sports club roster management',
    'manage players and parents for a club',
    'club team registration software',
    'youth sports club management guide',
    'sports club tryout registration workflow',
    'BracketIQ club operations guide',
  ],
  readingMinutes: 8,
  canonicalPath: '/guides/club-players-parents-teams',
  ctas: [
    {
      label: 'Manage club operations',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Start with the club guide',
      href: '/guides/manage-sports-club',
      variant: 'secondary',
    },
    {
      label: 'Set up registration',
      href: '/guides/registration-league-tournament',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Are club customers the same as team rosters?',
      answer:
        'No. Team rosters show who plays together. Customers can include players, parents, guardians, captains, team managers, payers, or anyone with event, billing, document, or support history.',
    },
    {
      question: 'When should a club review participants?',
      answer:
        'Review participants before tryout groups, clinic rosters, camp lists, invoices, and family communication become hard to change. This helps catch wrong sessions, duplicate records, missing payments, and parent questions early.',
    },
    {
      question: 'Can coaches and staff have different BracketIQ access?',
      answer:
        'Yes. Club directors, coaches, coordinators, finance staff, and seasonal helpers can be given access based on the work they actually manage, instead of giving every staff member broad organization access.',
    },
  ],
  ogImageAlt: 'BracketIQ club players parents teams and events guide preview',
  load: () => import('@/content/blog/club-players-parents-teams.mdx'),
};

const clubCommunication: BlogPostEntry = {
  slug: 'club-communication',
  title: 'How Clubs Can Communicate Better With Players, Parents, and Teams',
  description:
    'Improve club communication in BracketIQ by organizing player, parent, guardian, team, staff, registration, schedule, public page, and mobile update workflows.',
  contentType: 'guide',
  guideTopic: 'organizations',
  createdAt: '2026-06-01',
  publishedAt: '2026-06-01',
  updatedAt: '2026-06-01',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'club communication with players and parents',
  longTailKeywords: [
    'sports club communication guide',
    'communicate with players and parents',
    'youth sports parent communication',
    'club schedule update workflow',
    'sports club staff communication permissions',
    'BracketIQ club communication guide',
  ],
  readingMinutes: 7,
  canonicalPath: '/guides/club-communication',
  ctas: [
    {
      label: 'Manage club communication',
      href: '/organizations',
      variant: 'primary',
    },
    {
      label: 'Organize teams and parents first',
      href: '/guides/club-players-parents-teams',
      variant: 'secondary',
    },
    {
      label: 'Create the public page',
      href: '/guides/create-public-page-for-sports-organization',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Should a club send every update as an event notification?',
      answer:
        'No. Clubs should use event or program notifications when a tryout, clinic, camp, evaluation, schedule, or registration workflow needs a specific update. Everyday team communication should stay tied to teams, rosters, parents, and staff responsibilities.',
    },
    {
      question: 'Why separate players and parents in club communication?',
      answer:
        'Players may need roster or arrival details, while parents or guardians often handle payment, forms, transportation, and questions. BracketIQ customer context helps staff understand which person needs which update.',
    },
    {
      question: 'Who should be allowed to send club updates?',
      answer:
        'Give communication access based on responsibility. Directors, coaches, coordinators, finance staff, and seasonal helpers should only manage the updates and workflows that match their role.',
    },
  ],
  ogImageAlt: 'BracketIQ club communication guide preview',
  load: () => import('@/content/blog/club-communication.mdx'),
};

const registrationLeagueTournament: BlogPostEntry = {
  slug: 'registration-league-tournament',
  title: 'How to Set Up Online Registration for a League or Tournament',
  description:
    'Set up online registration for a sports league or tournament in BracketIQ by confirming team registration, cutoffs, capacity, pricing, public registration details, captain team selection, free-agent access, and organizer participant review.',
  contentType: 'guide',
  guideTopic: 'events',
  createdAt: '2026-05-28',
  publishedAt: '2026-05-28',
  updatedAt: '2026-05-28',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'online registration for a league or tournament',
  longTailKeywords: [
    'sports league and tournament registration',
    'online sports registration guide',
    'team registration software',
    'sports tournament registration setup',
    'sports league signup software',
    'collect sports registration payments',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/registration-league-tournament',
  ctas: [
    {
      label: 'Set up online registration',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create the league first',
      href: '/guides/create-league-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Create the tournament first',
      href: '/guides/create-tournament-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Is team registration required for leagues and tournaments?',
      answer:
        'Yes. Leagues and tournaments are team events in BracketIQ. Captains register or select teams, while free-agent or individual interest can be collected as a supplemental path when organizers want to help players find teams.',
    },
    {
      question: 'When should I set price and capacity?',
      answer:
        'Set price, capacity, division, registration cutoff, and refund rules before sharing the public registration link so captains and players see the correct terms from the start.',
    },
    {
      question: 'What is different from the league and tournament registration guides?',
      answer:
        'This guide covers the shared online registration workflow across leagues and tournaments. The league and tournament registration guides go deeper on format-specific setup details for each event type.',
    },
  ],
  ogImageAlt: 'BracketIQ league and tournament online registration guide preview',
  load: () => import('@/content/blog/registration-league-tournament.mdx'),
};

const leagueScheduleCommunication: BlogPostEntry = {
  slug: 'league-schedule-communication',
  title: 'How to Communicate Schedule Changes During a League Season',
  description:
    'Communicate league schedule changes in BracketIQ by reviewing Agenda view, checking affected match details, using reschedule controls, sending event notifications, reviewing participant teams, and verifying the public schedule.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-28',
  publishedAt: '2026-05-28',
  updatedAt: '2026-05-28',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'communicate league schedule changes',
  longTailKeywords: [
    'sports league schedule change communication',
    'notify teams about schedule changes',
    'league schedule update guide',
    'indoor soccer schedule change',
    'sports league notifications',
    'communicate rainouts and field changes',
  ],
  readingMinutes: 8,
  canonicalPath: '/guides/league-schedule-communication',
  ctas: [
    {
      label: 'Communicate schedule changes',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Schedule the league first',
      href: '/guides/multi-week-league-scheduling',
      variant: 'secondary',
    },
    {
      label: 'Manage the league workflow',
      href: '/guides/manage-league-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should I send a league schedule update?',
      answer:
        'Send a schedule update after the BracketIQ schedule has been saved and verified, especially when teams, players, officials, or staff need to know about a time, field, court, opponent, weather, or facility change.',
    },
    {
      question: 'Should I use Reschedule or edit one match?',
      answer:
        'Edit one match when a single time, field, official, or team assignment needs a correction. Use Reschedule when broader league constraints changed, such as field availability, weekly windows, dropped teams, or makeup dates.',
    },
    {
      question: 'Who should receive a league schedule notification?',
      answer:
        'Select the audience that needs to act on the change. Managers are usually enough for captain-led adult teams, while players, parents, officials, and hosts should be included when the change affects arrival time, staffing, youth teams, or field operations.',
    },
  ],
  ogImageAlt: 'BracketIQ league schedule communication guide preview',
  load: () => import('@/content/blog/league-schedule-communication.mdx'),
};

const leagueRegistration: BlogPostEntry = {
  slug: 'league-registration',
  title: 'How to Set Up League Registration for Teams and Players',
  description:
    'Set up league registration in BracketIQ by confirming team signup settings, division capacity, team price, public registration controls, captain team selection, free-agent access, and organizer participant review.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-28',
  publishedAt: '2026-05-28',
  updatedAt: '2026-05-28',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'league registration for teams and players',
  longTailKeywords: [
    'sports league team registration',
    'league registration software',
    'recreational sports league signup',
    'indoor soccer league registration',
    'sports team signup software',
    'league free agent registration',
  ],
  readingMinutes: 8,
  canonicalPath: '/guides/league-registration',
  ctas: [
    {
      label: 'Set up league registration',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create the league first',
      href: '/guides/create-league-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Manage registered teams',
      href: '/guides/manage-league-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'Is league registration team-based?',
      answer:
        'League registration is team-based in BracketIQ. Captains register teams for the league, while the free-agent path can collect individual player interest when organizers want to place players onto teams later.',
    },
    {
      question: 'When should I set league price and capacity?',
      answer:
        'Set price, division capacity, team size, registration cutoff, and refund rules before sharing the public league link so captains see the correct registration terms from the start.',
    },
    {
      question: 'Can players without a full team still express interest?',
      answer:
        'Yes. When the free-agent path is available, players without a team can join the free-agent list while captains register full teams through the team-selection workflow.',
    },
  ],
  ogImageAlt: 'BracketIQ league registration guide preview',
  load: () => import('@/content/blog/league-registration.mdx'),
};

const leagueStandingsPlayoffSeeding: BlogPostEntry = {
  slug: 'league-standings-playoff-seeding',
  title: 'How to Manage League Standings and Playoff Seeding',
  description:
    'Manage league standings and playoff seeding in BracketIQ by reviewing Agenda results, saving final-points adjustments, confirming standings, checking the seeded bracket, and verifying the public standings page.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-27',
  publishedAt: '2026-05-27',
  updatedAt: '2026-05-27',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'league standings playoff seeding',
  longTailKeywords: [
    'how to manage league standings',
    'sports league playoff seeding software',
    'confirm league results',
    'sports league standings adjustments',
    'indoor soccer playoff seeding',
    'league standings software',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/league-standings-playoff-seeding',
  ctas: [
    {
      label: 'Manage your league standings',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Manage the league first',
      href: '/guides/manage-league-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Schedule a multi-week league',
      href: '/guides/multi-week-league-scheduling',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should I confirm league standings?',
      answer:
        'Confirm league standings after completed match scores, forfeits, penalties, and final point adjustments have been reviewed for the division that feeds playoff qualification or seeding.',
    },
    {
      question: 'Should I adjust points or edit the match score?',
      answer:
        'Edit the match score when the reported result is wrong. Use final point adjustments only for organizer decisions such as forfeits, eligibility penalties, tiebreak rulings, or other league rules that change standings points.',
    },
    {
      question: 'Can BracketIQ seed league playoffs automatically?',
      answer:
        'Yes. When automatic playoff reassignment is enabled, BracketIQ can use confirmed standings to place qualified teams into playoff match slots so the bracket stays connected to the league results.',
    },
  ],
  ogImageAlt: 'BracketIQ league standings and playoff seeding guide preview',
  load: () => import('@/content/blog/league-standings-playoff-seeding.mdx'),
};

const leagueSplitDivisions: BlogPostEntry = {
  slug: 'league-split-divisions',
  title: 'How to Run a League With Separate Regular Season and Playoff Divisions',
  description:
    'Run a sports league with separate regular-season and playoff divisions in BracketIQ by mapping Gold and Silver playoff placements, reviewing team division columns, checking Agenda view, confirming standings, and verifying the participant-facing bracket.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-27',
  publishedAt: '2026-05-27',
  updatedAt: '2026-05-27',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'league split playoff divisions',
  longTailKeywords: [
    'separate regular season and playoff divisions',
    'sports league gold silver playoffs',
    'league playoff division mapping',
    'split division league playoffs',
    'indoor soccer league playoff divisions',
    'sports league playoff seeding software',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/league-split-divisions',
  ctas: [
    {
      label: 'Run split league playoffs',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Run a simple playoff bracket first',
      href: '/guides/league-playoffs',
      variant: 'secondary',
    },
    {
      label: 'Manage standings and seeding',
      href: '/guides/league-standings-playoff-seeding',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should I use separate regular-season and playoff divisions?',
      answer:
        'Use separate divisions when teams start in groups such as East and West, then qualify into playoff groups such as Gold and Silver, A and B, competitive and recreational, or age and skill playoff brackets.',
    },
    {
      question: 'What does playoff placement mapping do?',
      answer:
        'Placement mapping tells BracketIQ where each regular-season finishing position should go. For example, first and second place from East can map to Gold Playoffs while third place maps to Silver Playoffs.',
    },
    {
      question: 'Can BracketIQ seed split league playoffs from confirmed standings?',
      answer:
        'Yes. When automatic playoff reassignment is enabled, BracketIQ can use confirmed standings and placement mapping to place teams into the correct playoff division matches.',
    },
  ],
  ogImageAlt: 'BracketIQ split league playoff divisions guide preview',
  load: () => import('@/content/blog/league-split-divisions.mdx'),
};

const leaguePlayoffs: BlogPostEntry = {
  slug: 'league-playoffs',
  title: 'How to Run a League With Playoffs',
  description:
    'Run a sports league with playoffs in BracketIQ by confirming playoff settings, reviewing team eligibility, checking the playoff schedule in Agenda view, confirming qualifying standings, and verifying the seeded bracket.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-27',
  publishedAt: '2026-05-27',
  updatedAt: '2026-05-27',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'run a league with playoffs',
  longTailKeywords: [
    'how to run a sports league with playoffs',
    'league playoff bracket software',
    'sports league playoff setup',
    'indoor soccer league playoffs',
    'league playoff seeding guide',
    'recreational sports league playoffs',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/league-playoffs',
  ctas: [
    {
      label: 'Run your league playoffs',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Manage standings first',
      href: '/guides/league-standings-playoff-seeding',
      variant: 'secondary',
    },
    {
      label: 'Create the league first',
      href: '/guides/create-league-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'When should I set the playoff team count?',
      answer:
        'Set the playoff team count before the final regular-season week so captains know how many teams qualify and staff can review the bracket dates before standings are confirmed.',
    },
    {
      question: 'Can BracketIQ seed league playoff matches from standings?',
      answer:
        'Yes. When automatic playoff reassignment is enabled, confirmed standings can place qualified teams into playoff match slots so semifinals and finals stay connected to league results.',
    },
    {
      question: 'What is different about split league and playoff divisions?',
      answer:
        'Split divisions are used when regular-season groups feed different playoff groups such as Gold and Silver. That workflow needs division placement rules and mapping, so it should be handled separately from a simple single-division playoff bracket.',
    },
  ],
  ogImageAlt: 'BracketIQ league playoffs guide preview',
  load: () => import('@/content/blog/league-playoffs.mdx'),
};

const multiWeekLeagueScheduling: BlogPostEntry = {
  slug: 'multi-week-league-scheduling',
  title: 'How to Schedule a Multi-Week Sports League',
  description:
    'Schedule a multi-week sports league in BracketIQ by confirming league details, adding recurring weekly timeslots, reviewing teams, checking Agenda view, rescheduling, and verifying the public schedule.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-27',
  publishedAt: '2026-05-27',
  updatedAt: '2026-05-27',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'schedule a sports league',
  longTailKeywords: [
    'how to schedule a sports league',
    'multi-week sports league scheduling',
    'recurring league schedule software',
    'sports league field scheduling',
    'indoor soccer league scheduling',
    'league agenda schedule software',
  ],
  readingMinutes: 9,
  canonicalPath: '/guides/multi-week-league-scheduling',
  ctas: [
    {
      label: 'Schedule your league',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create the league first',
      href: '/guides/create-league-in-bracketiq',
      variant: 'secondary',
    },
    {
      label: 'Manage the league after scheduling',
      href: '/guides/manage-league-in-bracketiq',
      variant: 'tertiary',
    },
  ],
  faq: [
    {
      question: 'What should I set before scheduling a multi-week league?',
      answer:
        'Set the league dates, sport, divisions, weekly timeslots, fields or courts, match duration, and team list before generating or rebuilding the schedule.',
    },
    {
      question: 'Why use Agenda view for league schedule review?',
      answer:
        'Agenda view shows dates, times, teams, scores, and field or court assignments in one list, which makes it easier for organizers and staff to review a multi-week schedule before teams rely on it.',
    },
    {
      question: 'Can this workflow schedule sports other than soccer?',
      answer:
        'Yes. The same BracketIQ recurring schedule workflow applies to volleyball, pickleball, basketball, tennis, hockey, baseball, football, outdoor soccer, indoor soccer, and other recreational sports.',
    },
  ],
  ogImageAlt: 'BracketIQ multi-week league scheduling guide preview',
  load: () => import('@/content/blog/multi-week-league-scheduling.mdx'),
};

const manageLeagueInBracketiq: BlogPostEntry = {
  slug: 'manage-league-in-bracketiq',
  title: 'How to Manage a League in BracketIQ',
  description:
    'Manage a published sports league in BracketIQ by reviewing teams, checking the weekly Agenda schedule, entering match scores, reviewing standings, and verifying the public page.',
  contentType: 'guide',
  guideTopic: 'leagues',
  createdAt: '2026-05-27',
  publishedAt: '2026-05-27',
  updatedAt: '2026-05-27',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'manage a sports league',
  longTailKeywords: [
    'how to manage a sports league',
    'sports league management guide',
    'manage league teams and schedules',
    'sports league standings software',
    'league score entry software',
    'indoor soccer league management',
  ],
  readingMinutes: 10,
  canonicalPath: '/guides/manage-league-in-bracketiq',
  ctas: [
    {
      label: 'Manage your league',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Create a league first',
      href: '/guides/create-league-in-bracketiq',
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
      question: 'When should I use the league management workflow?',
      answer:
        'Use the league management workflow after the league has been created. The create workflow sets up the sport, registration, divisions, scoring rules, weekly schedule windows, and public page; management starts once teams are joining, matches need score updates, and standings need review.',
    },
    {
      question: 'Can BracketIQ manage leagues for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ league management workflow applies to volleyball, pickleball, basketball, tennis, hockey, baseball, football, outdoor soccer, indoor soccer, and other recreational sports.',
    },
    {
      question: 'What should I check every week during a league season?',
      answer:
        'Review the registered teams, payment or document follow-up, Agenda schedule, match score controls, standings, and public league page so staff and teams can rely on the same information.',
    },
  ],
  ogImageAlt: 'BracketIQ league management guide preview',
  load: () => import('@/content/blog/manage-league-in-bracketiq.mdx'),
};

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
      question: 'Is tournament registration team-based?',
      answer:
        'Tournament registration is team-based in BracketIQ. Captains register teams for the tournament, while the free-agent path can collect individual player interest when organizers want to help players find or build teams later.',
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
  createOrganizationInBracketiq,
  createPublicPageForSportsOrganization,
  organizationPaymentProcessing,
  manageSportsFacility,
  manageSportsClub,
  clubPlayersParentsTeams,
  clubCommunication,
  registrationLeagueTournament,
  leagueScheduleCommunication,
  leagueRegistration,
  leagueSplitDivisions,
  leaguePlayoffs,
  leagueStandingsPlayoffSeeding,
  multiWeekLeagueScheduling,
  manageLeagueInBracketiq,
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
  events: ['paid-pickup-event-payments', 'registration-league-tournament'],
  tournaments: [
    'create-tournament-in-bracketiq',
    'tournament-registration',
    'manage-tournament-in-bracketiq',
    'tournament-pool-play',
    'tournament-results-advancement',
  ],
  leagues: [
    'create-league-in-bracketiq',
    'league-registration',
    'manage-league-in-bracketiq',
    'multi-week-league-scheduling',
    'league-schedule-communication',
    'league-standings-playoff-seeding',
    'league-playoffs',
    'league-split-divisions',
  ],
  organizations: [
    'create-organization-in-bracketiq',
    'create-public-page-for-sports-organization',
    'organization-payment-processing',
    'manage-sports-facility',
    'manage-sports-club',
    'club-players-parents-teams',
    'club-communication',
  ],
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
