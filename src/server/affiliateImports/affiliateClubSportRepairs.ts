export type AffiliateClubSportRepair = {
  from: string | null;
  sports: readonly string[];
  rationale: string;
};

/**
 * Source-backed repairs for historical CLUB candidates that used a composite,
 * generic, or obsolete sport label. Unsupported labels are intentionally not
 * included here and remain in NEEDS_REVIEW.
 */
export const AFFILIATE_CLUB_SPORT_REPAIRS: Readonly<Record<string, AffiliateClubSportRepair>> = {
  'ea13c020-930b-4604-8c47-8fa2a55faed2': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes tennis and pickleball programs.',
  },
  '706373b1-7425-43fb-8ace-2358501c852d': {
    from: 'Australian Rules Football',
    sports: ['Australian Football'],
    rationale: 'Australian Rules Football is the source label for the catalog sport Australian Football.',
  },
  '584973a0-230b-4414-8ea0-082781df68ac': {
    from: 'Multi-sport facility',
    sports: ['Indoor Volleyball', 'Basketball', 'Indoor Soccer', 'Lacrosse', 'Baseball'],
    rationale: 'The source describes indoor volleyball, basketball, soccer and lacrosse turf, and baseball batting cages.',
  },
  '6b1510f6-5b09-48c0-9ca3-93955c11008c': {
    from: 'Multi-sport social leagues',
    sports: ['Flag Football', 'Grass Soccer', 'Softball', 'Indoor Volleyball', 'Beach Volleyball', 'Ultimate Frisbee'],
    rationale: 'The source names flag football, soccer, softball, indoor and sand volleyball, and ultimate frisbee; unsupported kickball and dodgeball are excluded.',
  },
  '548ca755-50aa-4be4-9ea0-35a056992739': {
    from: 'Football and Cheer',
    sports: ['Football'],
    rationale: 'The source describes youth football and cheer; cheer is blacklisted and football is supported.',
  },
  '7beee039-966d-4662-8d7e-a42ed9a57990': {
    from: 'Youth multi-sport leagues',
    sports: ['Baseball', 'Basketball', 'Flag Football', 'Grass Soccer', 'Indoor Volleyball'],
    rationale: 'The source names youth baseball, basketball, flag football, soccer, and volleyball; cheer is excluded.',
  },
  'e1722690-de04-4273-ac0e-7ab409b8c83b': {
    from: 'Golf',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'Golf and swimming are blacklisted; the source also explicitly describes tennis and pickleball.',
  },
  '9b41a768-264d-4558-954c-9ce0cbd69a1b': {
    from: 'Arena Football',
    sports: ['Football'],
    rationale: 'The source describes an indoor football organization, which uses the supported Football catalog sport.',
  },
  'd72c1b4e-b6b9-4b11-b330-eab84f9ac4e2': {
    from: 'Tennis, Pickleball, and Multi-sport Facility',
    sports: ['Tennis', 'Pickleball', 'Grass Soccer', 'Flag Football', 'Lacrosse', 'Baseball'],
    rationale: 'The source explicitly names tennis, pickleball, soccer, flag football, lacrosse, and baseball use cases.',
  },
  'c93afd63-5e23-47d2-896c-d48e9b411a5e': {
    from: 'Football and Cheer',
    sports: ['Football', 'Flag Football'],
    rationale: 'The source explicitly describes youth tackle and flag football; cheer is excluded.',
  },
  '25568636-d66d-4d3c-812e-42ddc6eb2906': {
    from: 'Baseball & Softball',
    sports: ['Baseball', 'Softball'],
    rationale: 'The source explicitly offers boys baseball and girls softball registration.',
  },
  'fe225d92-0d59-4085-8da7-1cb8b91af083': {
    from: 'Basketball, Baseball, Football, Soccer, Track, and Volleyball',
    sports: ['Basketball', 'Baseball', 'Football', 'Grass Soccer', 'Indoor Volleyball'],
    rationale: 'The source explicitly names basketball, baseball, football, soccer, and volleyball; track is blacklisted.',
  },
  '3ffdae67-a3e7-426d-b51c-001a05573c00': {
    from: 'Baseball & Fastpitch Softball',
    sports: ['Baseball', 'Softball'],
    rationale: 'Fastpitch softball maps to the supported Softball catalog sport.',
  },
  '4569a6c7-b298-4cb4-954b-897adda9ab03': {
    from: 'Table Tennis and Soccer',
    sports: ['Table Tennis', 'Indoor Soccer'],
    rationale: 'The source explicitly describes an indoor table-tennis facility and an indoor soccer arena.',
  },
  'ab928d7e-f69e-403c-86b3-d09623fe792a': {
    from: 'Multi-sport athletics',
    sports: ['Baseball', 'Softball', 'Basketball', 'Football', 'Grass Soccer', 'Tennis', 'Indoor Volleyball', 'Flag Football'],
    rationale: 'The source lists Jacksonville baseball, softball, basketball, football, soccer, tennis, competitive volleyball, and women’s flag football; cheer is excluded.',
  },
  'e9ede4c9-7a41-4e71-8022-07f39a620a3c': {
    from: 'Baseball & Softball',
    sports: ['Baseball', 'Softball'],
    rationale: 'The source explicitly provides baseball and softball training.',
  },
  '71dccc85-94fb-4e60-96d2-3856cf275a08': {
    from: 'Football and Cheerleading',
    sports: ['Football'],
    rationale: 'The source describes football and cheer programs; cheerleading is blacklisted.',
  },
  '1768353c-2136-4d57-b7c6-8a6c10d2bc47': {
    from: 'Ice Sports',
    sports: ['Hockey'],
    rationale: 'The source explicitly includes open hockey and hockey programs; figure skating and public skating are not catalog sports.',
  },
  'f2ddbe56-feef-43b5-949e-05be5dd7d786': {
    from: 'Baseball and Fastpitch Softball',
    sports: ['Baseball', 'Softball'],
    rationale: 'The source explicitly provides youth baseball and fastpitch softball instruction.',
  },
  '9b591357-d825-461c-91d0-857a929d00c5': {
    from: 'Multi-sport parks and recreation athletics',
    sports: ['Flag Football'],
    rationale: 'The source package is scoped to the explicitly named Columbus flag-football program; broader facility claims are not converted into inferred sports.',
  },
  '784a4f67-583a-4853-8fac-ae7a0d90df7a': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes tennis and pickleball court bookings.',
  },
  '3c1f359a-b262-4e04-b61a-c47190a63923': {
    from: 'Multi-sport parks and recreation',
    sports: ['Tennis', 'Pickleball', 'Indoor Volleyball'],
    rationale: 'The source explicitly names tennis, pickleball, and volleyball reservations; the unqualified volleyball label uses the product default Indoor Volleyball.',
  },
  '95695a99-380d-4f62-afe7-4845e690748f': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes public tennis and pickleball facilities.',
  },
  '9fd2ad9b-eb07-4891-8627-8fbdfa3eb1b0': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes tennis and pickleball programs.',
  },
  '5a0d75cd-35b0-4f3c-a0bc-3c9039cac6e9': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes tennis and pickleball programs.',
  },
  'e43a15c6-0176-4e6a-8e20-44832d229bb5': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes indoor tennis and pickleball programs.',
  },
  'f248b07e-6d6a-4edc-a491-18a47b17a565': {
    from: 'Swimming, Tennis, Basketball, and Baseball',
    sports: ['Tennis', 'Basketball', 'Baseball'],
    rationale: 'Swimming is blacklisted; the source explicitly describes tennis, basketball, and baseball.',
  },
  '3c7814a2-3ef5-4214-aead-68e16e069626': {
    from: 'Multi-sport',
    sports: ['Indoor Volleyball', 'Basketball', 'Pickleball', 'Racquetball'],
    rationale: 'The source explicitly describes volleyball and basketball leagues plus pickleball and racquetball recreation.',
  },
  'ce857615-6599-4398-8c85-4569db9a1cf7': {
    from: 'Baseball, Softball, T-Ball',
    sports: ['Baseball', 'Softball'],
    rationale: 'T-ball is a baseball program; the source also explicitly describes baseball and softball.',
  },
  '0ed21d84-66c9-4b31-ae2b-20908575d0de': {
    from: 'Adaptive Baseball',
    sports: ['Baseball'],
    rationale: 'Adaptive Baseball is an inclusive form of the supported Baseball sport.',
  },
  '1f2c72cf-3644-4649-8bfa-d17727bb7c6d': {
    from: 'Futsal and Soccer',
    sports: ['Futsal', 'Grass Soccer'],
    rationale: 'The source explicitly describes futsal and soccer programs; unqualified soccer uses the product default Grass Soccer.',
  },
  '26b30451-8231-4b35-8dcb-e64f7d78f11c': {
    from: 'Basketball and Volleyball',
    sports: ['Basketball', 'Indoor Volleyball'],
    rationale: 'The source explicitly describes indoor basketball and volleyball courts; unqualified volleyball uses the product default Indoor Volleyball.',
  },
  'ab073a13-e425-42bf-a589-a91fde12a445': {
    from: 'Multi-sport parks and recreation',
    sports: ['Football', 'Grass Soccer', 'Baseball', 'Basketball', 'Hockey'],
    rationale: 'The source explicitly lists football, soccer, baseball, basketball, and hockey; cheer and boxing are not catalog sports.',
  },
  '34496500-05e1-4f04-82c2-cb804a072749': {
    from: 'Tennis and Pickleball',
    sports: ['Tennis', 'Pickleball'],
    rationale: 'The source explicitly describes adult tennis and pickleball leagues.',
  },
  'c43445dd-8067-4101-94f3-90a7f5443d80': {
    from: 'Multi-sport',
    sports: ['Hockey', 'Softball', 'Flag Football', 'Basketball', 'Grass Soccer', 'Lacrosse', 'Pickleball'],
    rationale: 'The source explicitly names hockey, softball, flag football, basketball, soccer, lacrosse, and pickleball; golf and kickball are excluded.',
  },
  'd089bdf9-c5bd-4820-a3ee-f292888c71c4': {
    from: null,
    sports: ['Field Hockey'],
    rationale: 'The source explicitly identifies the organization as Field Hockey, which is now present in the canonical catalog.',
  },
  '64cb816f-bb41-4ea5-b1c9-0041cfa706ed': {
    from: null,
    sports: ['Basketball', 'Pickleball', 'Softball', 'Tennis', 'Indoor Volleyball', 'Grass Soccer', 'Beach Volleyball', 'Grass Volleyball'],
    rationale: 'The source explicitly names basketball, pickleball, softball, tennis, indoor volleyball, soccer, and sand-and-grass volleyball programs.',
  },
};

export const affiliateClubSportRepairEntries = (): Array<[string, AffiliateClubSportRepair]> => (
  Object.entries(AFFILIATE_CLUB_SPORT_REPAIRS)
);
