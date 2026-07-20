# San Francisco And Bay Area Affiliate Source Backlog

## Research Source

The URLs in this backlog are intake seeds, not permission to perform ad hoc scraping. Site information for implementation must come first from the live `AffiliateSourceIntakes` capture for that host. Locate it with `npm run affiliate:intake:export -- --live --list --search <name-or-host>` and export it with `npm run affiliate:intake:export -- --live --url <url>`. The generated `source-evidence.json` is the provenance record for local setup scripts, source metadata, and completed registry notes.

When a row moves beyond `Not started`, record the live intake source key, selected run ID, capture timestamp/provider, inspected page roles/URLs, and artifact kinds used. If the intake has no allowed exportable run or lacks necessary pages, keep the row in intake review instead of manually substituting uncited public-site data.

This is the canonical intake backlog for the San Francisco and broader Bay Area expansion. Every row below is `Not started`: it is a lead to triage, not permission to scrape. Before wiring a source, follow the affiliate source-builder workflow: verify `robots.txt` and terms, record a source-specific decision, use official outbound actions only, create the source-owned organization and reviewed logo, and keep the source manual/disabled until it passes local validation.

Entries under directories and marketplaces are discovery inputs. Do not import their inventory directly unless the entry itself exposes a compliant, public, first-party action flow. Consolidate child URLs with their parent organization only when they share the same source organization and scraper behavior; preserve child URLs in the source metadata when they expose distinct sports or registration paths.

## Adult Leagues And Multi-Sport Programs

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| San Francisco Rec & Park Adult Sports League Directory | https://sfrecpark.org/1186/Adult-Sports-Leagues |
| Volo Sports San Francisco | https://www.volosports.com/san-francisco |
| Volo Soccer San Francisco | https://www.volosports.com/san-francisco/soccer |
| Volo Basketball San Francisco | https://www.volosports.com/san-francisco/basketball |
| Volo Volleyball San Francisco | https://www.volosports.com/san-francisco/volleyball |
| Volo Softball San Francisco | https://www.volosports.com/san-francisco/softball |
| Volo Flag Football San Francisco | https://www.volosports.com/san-francisco/flag-football |
| Volo Dodgeball San Francisco | https://www.volosports.com/san-francisco/dodgeball |
| Volo Kickball San Francisco | https://www.volosports.com/san-francisco/kickball |
| ZogSports San Francisco / Volo | https://www.zogsports.com/sf/ |
| OutLoud Sports San Francisco | https://outloudsports.com/sanfrancisco |
| Stonewall Sports San Francisco | https://stonewallsportssf.leagueapps.com/ |
| Stonewall Sports SF Dodgeball | https://stonewallsportssf.leagueapps.com/pages/dodgeball |
| Stonewall Sports SF Kickball | https://stonewallsportssf.leagueapps.com/pages/kickball |
| Play Recess San Francisco | https://playrecess.com/ |
| ClubWAKA San Francisco South Bay | https://clubwaka.com/locations/san-francisco-south-bay-2/ |
| ClubWAKA San Francisco East Bay | https://clubwaka.com/locations/san-francisco-east-bay-2/ |
| SF Social Sports Club | https://sfsocialsportsclub.com/ |
| Varsity Gay League San Francisco | https://varsitygayleague.com/ |
| United States Gay Sports Network San Francisco Directory | https://www.usgsn.com/sanfrancisco |

## Rentals And Facilities

Target kind: `RENTAL` or facility `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| San Francisco Rec & Park Athletic Field Reservations | https://sfrecpark.org/423/Athletic-Field-Reservations |
| San Francisco Rec & Park Gymnasium Rentals | https://sfrecpark.org/660/Gymnasium-Rental-Information |
| SFUSD Facility Rentals | https://www.sfusd.edu/business-with-sfusd/real-estate/using-and-renting-sfusd-facilities |
| City College of San Francisco Facility Rentals | https://www.ccsf.edu/about-ccsf/administration/finance-and-administration/facilitiesbuildings-and-grounds/facility-rentals |
| South San Francisco Parks & Recreation Sports | https://www.ssfca.gov/Departments/Parks-Recreation/Divisions/Recreation-Division/Sports |
| South San Francisco Parks & Rec QuickScores | https://www.quickscores.com/ssf |
| Terrabay Gymnasium Rental | https://www.ssfca.gov/Departments/Parks-Recreation/Divisions/Recreation-Division/Rentals/Terrabay-Gymnasium |
| San Mateo Union High School District Facility Rentals | https://www.smuhsd.org/community/facilities-use/rental-of-facilities-and-fields |
| San Mateo County Community College District / Facilitron | https://www.facilitron.com/smccd |
| Oakland Unified School District / Facilitron | https://www.facilitron.com/ousd94607 |
| Oakland Unified Facility Permit Request | https://www.ousd.org/facilities-planning-management/contact-us/facilities-permit-request |
| Walnut Creek Field & Gym Rentals | https://www.walnutcreekartsrec.org/parks-facilities/field-gym-rentals |
| SportsHouse Indoor Sports | https://www.sportshouse.us/ |
| Sofive Alameda | https://www.sofive.com/locations/alameda |
| Sofive Alameda Field Rentals | https://www.sofive.com/rent-a-field/alameda |
| Sofive Alameda Court Rentals | https://www.sofive.com/courts/alameda |
| COPA Soccer Training Center | https://copastc.com/ |
| COPA STC Rentals | https://copastc.com/rentals/ |
| The Power Sports Academy | https://thepowersportsacademy.com/ |
| The Power Sports Academy Rentals | https://thepowersportsacademy.com/rentals |
| Ranch Sports Facility | https://www.ranchsportsfacility.com/ |
| Ranch Sports Facility Services | https://www.ranchsportsfacility.com/services |
| Elite Sports Centers | https://www.elitesportscenters.com/ |
| CourtRenter Bay Area | https://courtrenter.com/ |
| SF Baseball Academy | https://www.sfbaseballacademy.com/ |
| East Bay Batting | https://www.eastbaybatting.com/ |
| Pacifica Cages | https://pacificacages.com/ |
| Bay Area Ballplayers Batting Cages | https://www.bayareaballplayers.com/battingcages |

## Soccer, Futsal, And Beach Soccer

Target kind: `EVENT`, `CLUB`, or `RENTAL`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| San Francisco Youth Soccer | https://www.sfyouthsoccer.org/ |
| San Francisco Youth Soccer Events | https://www.sfyouthsoccer.org/en_us/e |
| San Francisco Youth Soccer Tryout Guidance | https://www.sfyouthsoccer.org/es_mx/guidance-for-tryouts |
| San Francisco Soccer Cup | https://www.sfsoccercup.com/ |
| San Francisco Beach Soccer Classic | https://proambeachsoccer.net/sfclassic/ |
| San Francisco Rec & Park Jose Coronado Futsal League | https://sfrecpark.org/1184/Jose-Coronado-Futsal-League |
| Bay Area Adult Soccer League | https://baasl.org/ |
| BAASL Futsal | https://baasl.org/welcomefutsal |
| San Francisco Soccer Football League | https://www.sfsfl.com/ |
| Kickit365 | https://www.kickit365.com/ |
| Kickit365 Leagues | https://www.kickit365.com/leagues |
| I Play For SF | https://iplayforsf.leagueapps.com/ |
| Golden Gate Women's Soccer League | https://www.ggwsl.org/ |
| SF Co-Ed Recreational Soccer League | https://sfcrsl.org/ |
| SF Glens Academy | https://www.sfglensacademy.com/ |
| SF Glens Academy Tryouts | https://www.sfglensacademy.com/tryouts.html |
| SF Glens Academy Competitive Program | https://www.sfglensacademy.com/competitive-program.html |
| SF Glens Academy Indoor Soccer | https://www.sfglensacademy.com/indoor-soccer.html |
| San Francisco Glens SC | https://www.sfglens.com/ |
| San Francisco Seals Soccer Club | https://www.sfseals.com/ |
| San Francisco Seals Tryouts | https://www.sfseals.com/tryouts |
| San Francisco Seals NorCal Travel Teams | https://www.sfseals.com/norcal-travel-teams |
| San Francisco Vikings Soccer Club | https://sfvikings.org/ |
| San Francisco Vikings Tryouts | https://sfvikings.org/club/tryouts |
| San Francisco Vikings Indoor Soccer | https://sfvikings.org/club/indoor-soccer |
| SF United FC Tryouts | https://sf-united.com/club/tryout-info |
| San Francisco Elite Academy | https://www.sfelitesc.org/ |
| San Francisco Elite Academy Tryouts | https://www.sfelitesc.org/tryouts |
| Golden Gate Soccer Club | https://www.goldengatesoccer.com/ |
| Golden Gate Soccer Club Registration | https://www.goldengatesoccer.com/contact |
| Mission Youth Soccer League | https://www.missionyouthsoccer.com/ |
| SF Aftershocks FC | https://www.sfaftershocks.com/ |
| Independent FC San Francisco | https://independentfc.com/ |
| Association FC | https://www.associationfc.org/ |
| Peninsula Soccer Club | https://www.peninsula-soccer.org/ |
| AYSO United Bay Area | https://aysounited.org/bay-area/ |
| Albion SC Silicon Valley | https://albionscsiliconvalley.org/ |
| Eastshore Alliance FC | https://www.eastshorealliancefc.org/ |
| Palo Alto Soccer Club / Silicon Valley Soccer Academy | https://www.pasoccerclub.org/ |
| Silicon Valley Eagles Soccer Academy | https://www.siliconvalleyeagles.com/ |
| NorCal Premier Soccer Clubs Directory | https://norcalpremier.com/clubs/ |
| NorCal Premier Tryout Window | https://norcalpremier.com/resources/tryout-window2026/ |
| US Club Soccer Sanctioned Tournaments | https://usclubsoccer.org/list-of-sanctioned-tournaments/ |
| GotSoccer California Events | https://home.gotsoccer.com/events.aspx?state=CA |
| Stanford Strikers Summer Classic | https://www.stanfordstrikers.org/stanford-strikers-tournament/ |
| San Ramon FC Tournaments | https://www.sanramonfc.com/tournaments |
| San Ramon FC Summer Classic | https://www.sanramonfc.com/summer-classic |
| Bay FC Players of Tomorrow / Girls Youth League News | https://bayfc.com/press-releases/bay-fc-2026-all-girls-soccer-league-winter-tournament-12132025/ |
| Sofive Alameda Adult Soccer Leagues | https://www.sofive.com/adult-soccer-leagues/alameda |
| Nike Soccer Camp at Sofive Alameda | https://www.ussportscamps.com/soccer/nike/nike-soccer-camp-bladium-sports-and-fitness-alameda |
| Lil Kickers Sofive Alameda | https://www.lilkickers.com/location/california/alameda/sofive-alameda/ |

## Volleyball

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| NCVA | https://ncva.com/ |
| NCVA Find a Club | https://ncva.com/info/teams-clubs/find-a-club/ |
| NCVA Tryout Information | https://ncva.com/tryouts/ |
| Bay Area Volleyball Directory | https://bayareavolleyball.com/ |
| Bay Area Volleyball Open Gyms | https://bayareavolleyball.com/open-gyms/ |
| Bay Area Volleyball Club | https://bayareavolleyballclub.com/ |
| Bay Area Volleyball Club Tryouts | https://bayareavolleyballclub.com/teams/girls-club-teams/tryouts/ |
| Academy Volleyball | https://www.academyvolleyball.com/ |
| Red Rock Volleyball | https://www.redrockvolleyball.com/ |
| SF Elite Volleyball Club | https://sfelitevbc.com/ |
| SF Elite Girls Tryouts / Open Gyms | https://sfelitevbc.leagueapps.com/events/4529206-2025-2026-girls-season-tryouts--open-gyms |
| SF Elite Boys Summer Tryouts | https://sfelitevbc.com/boys-summer-tryouts/ |
| San Francisco Juniors Volleyball Club | https://www.sfjuniors.com/ |
| NorCal Volleyball Club Tryouts | https://www.norcalvbc.com/girls/club-tryouts/ |
| Eclipse Volleyball Club | https://www.eclipsevolleyballclub.com/ |
| Bay Area Open Gyms / Reclub Volleyball | https://reclub.co/clubs/%40bayarea.opengyms |

## Basketball

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| Bay City Basketball | https://www.baycitybasketball.com/ |
| Bay City Basketball Tournaments & Leagues | https://www.baycitybasketball.com/tournaments-leagues/ |
| Bay City Basketball City League | https://www.baycitybasketball.com/tournaments-leagues/city-league/ |
| Bay City Basketball Spring Events | https://www.baycitybasketball.com/tournaments-leagues/ |
| SFBA AAU Basketball | https://www.sfbasportsperformance.com/sfbaaaubasketballsanfrancisco |
| SF Champions Basketball | https://www.sfchampions.org/ |
| NorCal Rush Basketball | https://www.norcalrushbasketball.com/ |
| Bay Area Roaddawgs Basketball | https://bayarearoaddawgs.com/ |
| GSG Basketball | https://www.gsghoops.com/ |
| Bay Area Flight Basketball | https://basketballnationusa.com/bay-area-flight/ |
| BullDawgs Basketball Club | https://www.dawgsclub.com/ |
| Underdogs Basketball | https://underdogsbasketball.com/ |
| SportStrong Basketball | https://www.sportstrong.com/ |
| Team12 Sports / Peninsula Gold AAU | https://team12sports.com/aau-basketball/ |
| Just Hoop Inc | https://www.justhoopinc.com/ |
| Supreme Kourt Basketball | https://www.leaguelineup.com/welcome.asp?url=supremekourt |
| Olympic Club Junior Basketball AAU | https://www.olyclub.com/juniors/jr-basketball/aau-spring-registration/ |
| SportsHouse Adult Basketball / Corporate Rivals | https://www.sportshouse.us/adult-basketball |
| Exposure Events California Youth Basketball Tournaments | https://basketball.exposureevents.com/youth-basketball-tournaments/california |
| Pick Her Up Basketball | https://www.pickherupball.com/ |

## Baseball And Softball

Target kind: `EVENT`, `CLUB`, or `RENTAL`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| San Francisco Softball League | https://sfsoftball.leagueapps.com/leagues |
| San Francisco Youth Baseball League | https://sfybl.com/ |
| SF Rec & Park San Francisco Youth Baseball League | https://sfrecpark.org/1714/San-Francisco-Youth-Baseball-League--SFY |
| SFYBL All-Stars | https://sfybl.com/all-stars/ |
| Bay Area Mens Senior Baseball League | https://bamsbl.com/ |
| San Francisco Baseball Academy | https://www.sfbaseballacademy.com/ |
| Youth Seagulls Baseball Academy | https://www.youthseagulls.com/home |
| Wrigley Baseball Club | https://wrigleybaseballclub.com/ |
| USA Prime Peninsula | https://usa-prime-peninsula.com/ |
| Bay Area Bombers | https://www.bayareabombers.org/ |
| Bay Area Ballplayers Summer Teams | https://www.bayareaballplayers.com/summerbaseball |
| Bay Area Ballplayers Batting Cages | https://www.bayareaballplayers.com/battingcages |
| Warrior Softball Academy | https://warrioracademysoftball.com/ |
| Wicked Fastpitch / RCGSL | https://www.rcgsl.org/wicked |
| Cabrillo Gals Crushers Travel Teams | https://www.cabrillogals.com/Default.aspx?tabid=1442365 |
| Extreme Fastpitch | https://www.extremefastpitch.com/ |
| Softball Connected Tryouts Directory | https://softballconnected.com/tryouts |
| Bay Area Vintage Baseball | https://bavbb.com/ |
| Pacific Coast Hardball League | https://pchlbaseball.blogspot.com/ |
| Architects / Engineers / Contractors Softball League | https://www.sfaecsl.com/ |
| Bay Area Media Softball League | https://www.bamsl.com/ |

## Lacrosse

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| NorCal Lacrosse Association | https://www.norcallacrosseassoc.org/ |
| NorCal Lacrosse Find a Youth Club | https://www.norcallacrosseassoc.org/page/show/9274122-find-a-youth-club-near-you |
| ULAX San Francisco Men's Lacrosse | https://ulax.org/sanfrancisco/men/ |
| San Francisco Lacrosse Club | https://www.sflacrosse.org/ |
| San Francisco Lacrosse Club FAQs | https://www.sflacrosse.org/faqs.html |
| BayLax Women's Lacrosse | https://www.baylax.com/ |
| BayLax About | https://www.baylax.com/about.html |
| Bay Area Lacrosse League | https://bayarealacrosseleague.org/ |
| Team NorCal Lacrosse | https://teamnorcal.com/ |
| Team NorCal Travel Team | https://www.tomahawkslacrosse.org/page/show/165168-team-norcal-boys-and-girls-travel-team |
| San Francisco Riptide Lacrosse | https://sfriptide.com/ |
| Fog City Lacrosse | https://fogcitylacrosse.com/ |
| Coyotes Lacrosse Club | https://www.coyoteslacrosse.org/about-us/ |
| Skyline Lacrosse Programs | https://www.skylinelacrosse.com/programs |
| ADVNC Lacrosse East Bay | https://www.advnclacrosse.com/east-bay |
| Diablo Lacrosse Club | https://www.diablolacrosse.org/ |
| Palo Alto Lacrosse Club | https://www.paloaltolacrosse.com/about |
| South Bay United Lacrosse Club | https://www.sbulax.com/ |

## Rugby

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| Rugby NorCal | https://rugbynorcal.org/ |
| Rugby NorCal Schedule | https://rugbynorcal.org/schedule/ |
| Bay Area Rugby | https://bayrugby.org/ |
| Bay Area Rugby Clubs | https://bayrugby.org/clubs/ |
| San Francisco Golden Gate Rugby Club | https://www.sfggrugby.com/ |
| SFGG Youth Rugby | https://www.sfggrugby.com/junior-youth |
| Bay Area Baracus Rugby Club | https://www.babaracusrugby.com/ |
| Bay Area Rugby Club | https://www.bayarearugby.com/join |
| San Francisco Touch Rugby | https://www.sanfranciscotouch.com/ |
| San Francisco Touch Rugby Competitive | https://www.sanfranciscotouch.com/competitive |
| Silicon Valley Rugby | https://bayrugby.org/clubs/silicon-valley/ |
| Blackthorn Rugby Club Flag Rugby | https://www.blackthornrugbyclub.com/about-3-1 |
| USA Rugby Find a Club | https://usa.rugby/play-rugby-today |

## Hockey And Field Hockey

Target kind: `EVENT`, `CLUB`, or `RENTAL`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| San Francisco Sabercats Youth Hockey | https://www.sfsabercats.org/ |
| San Francisco Sabercats Program | https://www.sfsabercats.org/program/ |
| NorCal Youth Hockey Clubs Directory | https://www.norcalyouthhockey.org/Clubs.html |
| Northern California Women's Hockey League | https://ncwhl.com/ |
| Oakland Ice Adult Hockey | https://www.oaklandice.com/adult-hockey |
| Sharks Ice San Jose Adult Hockey | https://www.sharksiceatsanjose.com/adult-hockey |
| Sharks Ice San Jose Women's League | https://www.sharksiceatsanjose.com/adult-hockey/siahl-womens-league |
| The Plex Adult Roller Hockey Leagues | https://www.gotoplex.com/sports/roller-hockey/adult-roller-hockey-leagues/ |
| Nor-Cal Inline / Dry Ice Inline Hockey | https://dryiceinlinehockey.com/ |
| The Cage Roller Hockey Rink | https://cagehockey.com/ |
| Cal Street Hockey Programs | https://calstreethockey.com/our-programs/ |
| Northern California Field Hockey Association | https://www.ncfha.org/ |
| NCFHA Adults | https://www.ncfha.org/adults |
| Fog City Field Hockey | https://www.fogcityfieldhockey.com/about |
| Bay Area Field Hockey Association | https://bafha.org/ |
| SF Youth Field Hockey | https://www.sfyouthfieldhockey.com/ |
| Lightning Youth Field Hockey | https://www.lightningfieldhockey.org/ |
| Performance Field Hockey | https://www.performancefieldhockey.com/ |
| Golden Gate Rippers Field Hockey | https://www.goldengaterippers.com/content/field-hockey |

## Flag Football

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| United Sports Flag Football San Francisco | https://www.unitedsportsflag.com/Default.aspx?tabid=1840459 |
| United Sports Bay Area Youth Flag Football | https://www.unitedsportsflag.com/Default.aspx?tabid=2114541 |
| United Sports Adult Flag Football | https://www.usportsofamerica.com/leagues/adult-leagues/adult-flag-football |
| United Sports Women's Flag Football | https://www.usportsofamerica.com/leagues/womens-team |
| Next Level Flag Football Overview | https://www.nextlevelsports.com/Default.aspx?tabid=316478 |
| 49ers Flag Football | https://www.49ers.com/flag/ |
| SF PAL Flag Football | https://www.sfpal.org/programs/flagfootball |
| SF Rec & Park Youth Flag Football | https://sfrecpark.org/1801/Flag-Football |
| San Francisco Women's+ Flag Football League | https://www.sfwffl.org/ |
| East Bay Flag Football | https://www.eastbaynflflag.com/ |
| SV5 NFL Flag Football League | https://www.sv5nflflag.com/ |

## Ultimate And Disc

Target kind: `EVENT` or `CLUB`; initial priority: `SF-P1`.

| Source | URL |
| --- | --- |
| Bay Area Disc Association | https://bayareadisc.org/ |
| Bay Area Disc Adult Ultimate | https://bayareadisc.org/en_us/adult-ultimate |
| Bay Area Disc Youth Ultimate | https://bayareadisc.org/en_us/youth-ultimate |
| Bay Area Disc Youth Leagues | https://bayareadisc.org/en_us/youth-leagues |
| Bay Area Disc Leagues | https://bayareadisc.org/en_us/leagues |
| Bay Area Disc Club Ultimate | https://bayareadisc.org/en_us/club-ultimate |
| Bay Area Disc Tournaments | https://bayareadisc.org/p/ultimate-tournaments-in-the-bay-area |
| Bay Area Disc SF Winter League | https://bayareadisc.org/san-francisco-winter-league |
| Bay Area Disc SF Beach League | https://bayareadisc.org/en_us/e/san-francisco-beach-league-202526 |
| Big Gay Frisbee San Francisco | https://bgfsanfrancisco.com/ |
| Pickup Ultimate San Francisco Bay Area | https://pickupultimate.com/map/city/sfbayarea |

## Seed Directories

These are discovery-only inputs and must not be used as primary inventory sources without a source-specific review. They duplicate entries above where applicable.

| Source | URL |
| --- | --- |
| SF Rec & Park Adult Sports League Directory | https://sfrecpark.org/1186/Adult-Sports-Leagues |
| United States Gay Sports Network San Francisco | https://www.usgsn.com/sanfrancisco |
| NorCal Premier Soccer Clubs Directory | https://norcalpremier.com/clubs/ |
| NorCal Premier Tryout Window | https://norcalpremier.com/resources/tryout-window2026/ |
| NCVA Find a Club | https://ncva.com/info/teams-clubs/find-a-club/ |
| NCVA Tryouts | https://ncva.com/tryouts/ |
| Bay Area Volleyball Directory | https://bayareavolleyball.com/ |
| Bay Area Volleyball Open Gyms | https://bayareavolleyball.com/open-gyms/ |
| NorCal Lacrosse Find a Youth Club | https://www.norcallacrosseassoc.org/page/show/9274122-find-a-youth-club-near-you |
| Rugby NorCal | https://rugbynorcal.org/ |
| Bay Area Rugby Clubs | https://bayrugby.org/clubs/ |
| NorCal Youth Hockey Clubs Directory | https://www.norcalyouthhockey.org/Clubs.html |
| US Club Soccer Sanctioned Tournaments | https://usclubsoccer.org/list-of-sanctioned-tournaments/ |
| GotSoccer California Events | https://home.gotsoccer.com/events.aspx?state=CA |
| Exposure Events California Basketball Tournaments | https://basketball.exposureevents.com/youth-basketball-tournaments/california |
| Softball Connected Tryouts Directory | https://softballconnected.com/tryouts |
| Facilitron Sports Rentals | https://www.facilitron.com/for-renters/rentals-for-sports |
| CourtRenter Bay Area | https://courtrenter.com/ |
