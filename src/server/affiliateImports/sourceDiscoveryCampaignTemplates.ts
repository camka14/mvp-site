export type AffiliateSourceDiscoveryCampaignTemplate = {
  priorityRank: number;
  name: string;
  region: string;
  location: string;
  anchorCity: string;
  anchorState: string;
  anchorPopulation: number;
  coveredCities: Array<{
    rank: number;
    city: string;
    state: string;
    population: number;
  }>;
};

const city = (
  priorityRank: number,
  anchorCity: string,
  anchorState: string,
  anchorPopulation: number,
  options?: {
    name?: string;
    region?: string;
    location?: string;
    coveredCities?: AffiliateSourceDiscoveryCampaignTemplate['coveredCities'];
  },
): AffiliateSourceDiscoveryCampaignTemplate => ({
  priorityRank,
  name: options?.name ?? `${anchorCity} Metro Sports Sources`,
  region: options?.region ?? `${anchorCity}, ${anchorState} metropolitan area`,
  location: options?.location ?? `${anchorCity}, ${anchorState}`,
  anchorCity,
  anchorState,
  anchorPopulation,
  coveredCities: options?.coveredCities ?? [{
    rank: priorityRank,
    city: anchorCity,
    state: anchorState,
    population: anchorPopulation,
  }],
});

// Ordered by U.S. Census Bureau Vintage 2025 incorporated-place population.
// Obvious shared metros are represented by one campaign to avoid paying for
// substantially duplicate searches while still covering every top-50 city.
export const US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES: AffiliateSourceDiscoveryCampaignTemplate[] = [
  city(1, 'New York', 'New York', 8_584_629),
  city(2, 'Los Angeles', 'California', 3_869_089, {
    region: 'Greater Los Angeles, California',
    coveredCities: [
      { rank: 2, city: 'Los Angeles', state: 'California', population: 3_869_089 },
      { rank: 44, city: 'Long Beach', state: 'California', population: 450_469 },
    ],
  }),
  city(3, 'Chicago', 'Illinois', 2_731_585),
  city(4, 'Houston', 'Texas', 2_397_315),
  city(5, 'Phoenix', 'Arizona', 1_665_481, {
    region: 'Phoenix metropolitan area, Arizona',
    coveredCities: [
      { rank: 5, city: 'Phoenix', state: 'Arizona', population: 1_665_481 },
      { rank: 38, city: 'Mesa', state: 'Arizona', population: 513_656 },
    ],
  }),
  city(6, 'Philadelphia', 'Pennsylvania', 1_574_281),
  city(7, 'San Antonio', 'Texas', 1_548_422),
  city(8, 'San Diego', 'California', 1_406_106),
  city(9, 'Dallas', 'Texas', 1_329_491, {
    name: 'Dallas-Fort Worth Metro Sports Sources',
    region: 'Dallas-Fort Worth metropolitan area, Texas',
    location: 'Dallas, Texas',
    coveredCities: [
      { rank: 9, city: 'Dallas', state: 'Texas', population: 1_329_491 },
      { rank: 10, city: 'Fort Worth', state: 'Texas', population: 1_028_117 },
    ],
  }),
  city(11, 'Jacksonville', 'Florida', 1_017_689),
  city(12, 'Austin', 'Texas', 1_002_632),
  city(13, 'San Jose', 'California', 989_814, {
    name: 'San Francisco Bay Area Sports Sources',
    region: 'San Francisco Bay Area, California',
    location: 'San Francisco, California',
    coveredCities: [
      { rank: 13, city: 'San Jose', state: 'California', population: 989_814 },
      { rank: 17, city: 'San Francisco', state: 'California', population: 826_079 },
      { rank: 45, city: 'Oakland', state: 'California', population: 440_838 },
    ],
  }),
  city(14, 'Charlotte', 'North Carolina', 964_784),
  city(15, 'Columbus', 'Ohio', 938_396),
  city(16, 'Indianapolis', 'Indiana', 901_116),
  city(18, 'Seattle', 'Washington', 784_777),
  city(19, 'Denver', 'Colorado', 740_613, {
    region: 'Denver metropolitan area, Colorado',
    coveredCities: [
      { rank: 19, city: 'Denver', state: 'Colorado', population: 740_613 },
      { rank: 50, city: 'Aurora', state: 'Colorado', population: 410_053 },
    ],
  }),
  city(20, 'Nashville', 'Tennessee', 721_074),
  city(21, 'Oklahoma City', 'Oklahoma', 719_849),
  city(22, 'Washington', 'District of Columbia', 693_645, {
    name: 'Washington DC Metro Sports Sources',
    region: 'Washington, DC metropolitan area',
    location: 'Washington, DC',
  }),
  city(23, 'El Paso', 'Texas', 683_012),
  city(24, 'Las Vegas', 'Nevada', 679_817),
  city(25, 'Boston', 'Massachusetts', 672_973),
  city(26, 'Detroit', 'Michigan', 649_095),
  city(27, 'Louisville', 'Kentucky', 641_962),
  city(28, 'Portland', 'Oregon', 635_109, {
    name: 'Portland Metro Sports Sources',
    region: 'Portland, Oregon metropolitan area',
  }),
  city(29, 'Memphis', 'Tennessee', 609_647),
  city(30, 'Baltimore', 'Maryland', 569_997),
  city(31, 'Milwaukee', 'Wisconsin', 562_407),
  city(32, 'Albuquerque', 'New Mexico', 556_588),
  city(33, 'Fresno', 'California', 555_549),
  city(34, 'Tucson', 'Arizona', 548_371),
  city(35, 'Sacramento', 'California', 536_449),
  city(36, 'Atlanta', 'Georgia', 529_110),
  city(37, 'Kansas City', 'Missouri', 521_220),
  city(39, 'Raleigh', 'North Carolina', 506_306),
  city(40, 'Colorado Springs', 'Colorado', 494_743),
  city(41, 'Miami', 'Florida', 489_812),
  city(42, 'Omaha', 'Nebraska', 488_797),
  city(43, 'Virginia Beach', 'Virginia', 453_737, {
    name: 'Hampton Roads Metro Sports Sources',
    region: 'Hampton Roads metropolitan area, Virginia',
    location: 'Virginia Beach, Virginia',
  }),
  city(46, 'Minneapolis', 'Minnesota', 430_324, {
    name: 'Minneapolis-St. Paul Metro Sports Sources',
    region: 'Minneapolis-St. Paul metropolitan area, Minnesota',
    location: 'Minneapolis, Minnesota',
  }),
  city(47, 'Bakersfield', 'California', 422_165),
  city(48, 'Tulsa', 'Oklahoma', 416_209),
  city(49, 'Tampa', 'Florida', 413_554),
];

export const CENSUS_CITY_CAMPAIGN_SOURCE = {
  vintage: 2025,
  estimateDate: '2025-07-01',
  sourceUrl: 'https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html',
} as const;
