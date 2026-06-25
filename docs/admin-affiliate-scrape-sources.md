# Admin Affiliate Scrape Source Registry

This registry tracks candidate sites for BracketIQ affiliate event and rental imports. Keep implementation notes here as each scraper is added. The implementation plan lives in `docs/admin-affiliate-scraping-execplan.md`.

Status values:

- `Not started`: no scraper work has begun.
- `Research`: source behavior is being inspected manually.
- `Fixture captured`: representative HTML or JSON fixture is saved or recorded for tests.
- `Mapping saved`: a DB-stored selector mapping exists for this source.
- `Admin flow wired`: source can be scraped from the admin page.
- `Published`: candidates from this source can be published as affiliate listings.
- `Blocked`: source is not currently suitable for scraping.

General capture fields for every source: event or rental name, organizer, sport, format, city, venue, address, date range, day/time, skill level, age group, gender or division, team vs individual or free-agent availability, price, registration or booking status, registration deadline, official booking URL, source URL, and last-checked timestamp.

For field or court rentals, do not promise real-time availability unless the official source publicly exposes it. List the facility, rental type, rough price if public, booking process, and link to the official booking page.

## Priority P0 Sources

| Source | Target kind | Initial priority | URL | Target data | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Underdog Sports Leagues Portland | Event | P0 | https://www.underdogportland.com/ | Adult leagues and tournaments across volleyball, kickball, softball, flag football, pickleball, and related sports; likely sport, location, day, start date, team/individual registration, status, and pricing. | Not started | Strong first event-source candidate. |
| City of Gresham Recreation / sports field rentals | Rental | P0 | https://www.greshamoregon.gov/services/parks-and-recreation/recreation/ | Public sports field rentals in Gresham, including Gradin Community Sports Park, Hall Park, Main City Park, North Gresham Park, Red Sunset Park, and other public fields. | Not started | Link-out only unless availability is public. |
| Eastside Timbers Field Rentals | Rental | P0 | https://www.eastsidetimbers.com/fieldrentals | Turf field rentals for tournaments, leagues, and trainings at Eastside Timbers Sports Complex on SE 174th Ave. | Not started | Strong first rental-source candidate. |
| Troutdale Indoor Sports | Event and rental | P0 | https://www.troutdaleindoorsports.com/ | Indoor rentals, leagues, soccer field, and basketball court near Gresham and East County. | Not started | Locally important; inspect for dynamic booking flow. |
| The Courts at Clear Creek | Event and rental | P0 | https://courtsatclearcreek.com/ | Indoor court facility in Gresham for basketball, volleyball, badminton, indoor soccer-style use, practices, events, parties, and rentals. | Not started | Strong East County source. |
| NCPRD / North Clackamas Parks & Recreation District Sports | Event | P0 | https://teamsideline.com/sites/clackamas/content/10195/Coach-Information-Resources | Adult softball, youth programs, drop-in sports, adaptive/inclusive programs, schedules, and registration timelines via TeamSideline/NCPRD. | Not started | TeamSideline extractor may be reusable. |
| Portland Parks & Recreation Athletic Field Permitting | Rental | P0 | https://www.portland.gov/parks/athletic-field-rental | More than 200 athletic fields for seasonal, occasional, and tournament play across softball, baseball, soccer, football, ultimate, lacrosse, and more. | Not started | Link-out public inventory; availability may not be real time. |
| Portland Public Schools facility rentals via Facilitron | Rental | P0 | https://www.facilitron.com/pps97227 | Gyms, pools, sports fields, theaters, classrooms, and school facility rentals across Portland Public Schools. | Not started | Marketplace-like flow; may need link-out only. |
| Portland Volleyball Association / TeamSideline | Event | P0 | https://teamsideline.com/sites/portlandvolleyball | Adult volleyball registration, schedules, locations, costs, divisions, and seasonal programs. | Not started | TeamSideline extractor candidate. |
| Portland Metro Softball Association | Event | P0 | https://www.portlandsoftball.com/ | Adult softball leagues, tournaments, schedules, rules, free-agent signup, and registration. | Not started | Good event inventory. |
| Portland Basketball | Event | P0 | https://www.portlandbasketball.com/ | Adult basketball leagues, schedules, individual registration, team registration, pick-to-play, and related volleyball offerings. | Not started | Strong event-source candidate. |
| Rose City Futsal | Event and rental | P0 | https://rosecityfutsal.com/adult-soccer-leagues-in-portland/ | Adult futsal leagues, court rentals, youth programs, camps, pickup or organized play, and Portland/Tigard facilities. | Not started | Affiliate outreach target. |
| The Plex PDX | Event and rental | P0 | https://www.theplexpdx.com/ | Adult indoor soccer leagues, individual/team registration, and facility membership/registration pages. | Not started | Affiliate outreach target. |
| Portland Ultimate | Event | P0 | https://portlandultimate.org/ | Ultimate frisbee leagues, tournaments, pickup, youth programs, clinics, and field info. | Not started | Good event inventory. |
| OutLoud Sports Portland | Event | P0 | https://outloudsports.com/portland | Adult recreational leagues including kickball, dodgeball, soccer, football, pickleball, tennis, indoor/sand volleyball, and bowling. | Not started | Affiliate outreach target. |
| East County Pickleball Courts, Troutdale | Rental | P0 | https://eastcountypickleballcourts.com/ | Indoor pickleball court reservations/open play with Playbypoint reservation flow and dedicated indoor courts. | Not started | Likely external booking link. |
| Tualatin Hills Park & Recreation District / TeamSideline | Event | P0 | https://www.teamsideline.com/sites/tualatinhills/home | Adult basketball, kickball, softball, indoor/sand volleyball, youth basketball/volleyball, schedules, divisions, and registrations. | Not started | TeamSideline extractor candidate. |
| Hillsboro Parks & Recreation / TeamSideline | Event | P0 | https://teamsideline.com/sites/hillsboro/content/221/Adult-Sports | Adult basketball, cornhole, softball, soccer, volleyball, schedules, free-agent forms, and league seasons. | Not started | TeamSideline extractor candidate. |
| The People's Courts | Event and rental | P0 | https://thepeoplescourts.com/ | Pickleball court reservations, private parties, corporate events, special occasions, and public play. | Not started | Affiliate outreach target. |
| RECS Pickleball | Event and rental | P0 | https://wearerecs.com/ | Indoor pickleball open play, leagues, lessons, events, tournaments, flex leagues, and Clackamas/Tualatin locations. | Not started | Affiliate outreach target. |
| Oregon Badminton Academy | Event and rental | P0 | https://orbadminton.com/ | Badminton court rentals, open play, tournaments, team events, corporate events, and court booking. | Not started | Affiliate outreach target. |
| Batting a Thousand, SE Portland | Rental | P0 | https://batpdx.com/ | Indoor batting cages, training tunnels, team/group rentals, prices, and reservations. | Not started | Strong first rental-source candidate. |
| Big Dawg Batting, Damascus | Rental | P0 | https://www.bigdawgbatting.com/ | Eastside baseball/softball cage rentals, lane rentals, full facility rentals, and team workouts. | Not started | Strong East County rental source. |

## Priority P1 Sources

| Source | Target kind | Initial priority | URL | Target data | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Eastside Timbers Recreation | Event | P1 | https://www.eastsidetimbers.com/recreation | Youth recreational soccer leagues in Gresham, Sandy, Clackamas, Troutdale, and Portland, plus seasonal camps. | Not started | May overlap with Eastside Timbers field rentals. |
| Oregon Premier Futsal / Eastside Timbers | Event and rental | P1 | https://www.eastsidetimbers.com/futsal | Indoor sports facility in Clackamas operated by Eastside Timbers; futsal/indoor soccer listings and rentals. | Not started | Inspect for shared Eastside markup. |
| Cascade Athletic Clubs Gresham sports programs | Event | P1 | https://cascadeac.com/gresham/sports-programs/basketball/ | Men's 4-on-4 basketball leagues with individual/team signup, playoffs, and Gresham location. | Not started | Membership dependency possible. |
| Gresham-Barlow School District facility use | Rental | P1 | https://www.gresham.k12.or.us/departments/facilities-department/facility-use | Elementary/middle school gyms, cafeterias, fields, and fee schedule for gyms, fields, tennis courts, tracks, and related facilities. | Not started | Likely link-out/facility info only. |
| Reynolds School District facility use | Rental | P1 | https://www.reynolds.k12.or.us/facilities/facilities-use-application | Elementary, middle, and high school gyms, cafeterias, and fields available when staff support is available. | Not started | Likely link-out/facility info only. |
| Parkrose School District facility rentals | Rental | P1 | https://www.parkrose.com/facilitiy-rentals | Gyms, classrooms, fields, libraries, and other community-use rentals; applications route through Facilitron. | Not started | Source path typo appears official; verify before implementation. |
| 8th Street Athletics / Playpass Gresham volleyball | Event | P1 | https://playpass.com/gresham-or/volleyball | Gresham volleyball camps, coed volleyball registration, dates, prices, and location info. | Not started | Aggregator-like; use source carefully. |
| Super G Sports Group / Playpass | Event | P1 | https://playpass.com/edgemont-services/4th-annual-bunny-tournament-Ac2bnpJ | Local volleyball tournament pages, including sand volleyball details, pricing, location, age rules, and team limits. | Not started | Specific organizer/event page; use as pattern. |
| Oregon Adult Soccer Association | Event | P1 | https://www.oregonadultsoccer.com/ | Soccer leagues, tournament lists, sanctioned events, find-a-team resources, and affiliate league/tournament links. | Not started | May be more useful as lead source. |
| Portland Indoor Soccer | Event and rental | P1 | https://pdxindoorsoccer.com/ | Indoor soccer programs and facility info in the same ecosystem as The Plex/indoor soccer registrations. | Not started | Check overlap with The Plex. |
| MJCC Sportsplex indoor soccer | Event and rental | P1 | https://www.oregonjcc.org/sports/indoor-soccer/adult-leagues-info | Adult indoor soccer league details, team captain registration, deposits, prices, and facility info in SW Portland. | Not started | Good structured event detail candidate. |
| Tualatin Indoor Soccer | Event and rental | P1 | https://www.tualatinindoor.com/ | Adult indoor soccer leagues, private field rental, parties, turf field info, and soccer programs. | Not started | Affiliate outreach target. |
| Lake Oswego Parks & Recreation adult basketball | Event | P1 | https://www.ci.oswego.or.us/parksrec/adult-basketball-league-0 | Adult basketball league registration, team/player registration, fees, deadlines, and season structure. | Not started | Public agency link-out. |
| Lake Oswego adult slow-pitch softball | Event | P1 | https://www.ci.oswego.or.us/parksrec/adult-summer-slow-pitch-softball | Adult softball league dates, costs, registration status, and divisions. | Not started | Public agency link-out. |
| Northwest Independent Baseball League | Event | P1 | https://www.nwibl.org/ | Adult baseball league schedules, new player registration, regional adult tournaments, all-star events, and Portland-area games. | Not started | Good event inventory. |
| Winterhawks ICE Adult Hockey | Event and rental | P1 | https://wicadulthockey.sportngin.com/ | Adult hockey leagues with multiple seasons and rinks in Sherwood/Beaverton plus Veterans Memorial Coliseum use. | Not started | SportsEngine source; inspect ToS and structure. |
| Mountain View Ice Arena, Vancouver | Event and rental | P1 | https://mtviewice.com/ | Adult hockey, pick-up/stick-and-puck, summer adult league, Rose Cup tournament, rentals, and hockey programs. | Not started | North-metro expansion. |
| Salmon Creek Indoor Soccer, Vancouver | Event and rental | P1 | https://www.scsoccerarena.com/ | Indoor soccer leagues, pickleball drop-in, field rentals, parties, and team events. | Not started | North-metro expansion. |
| Jumbo's Pickleball Portland | Event and rental | P1 | https://www.jumbospickleball.com/portland | Indoor pickleball courts, tournaments, lessons, clinics, leagues, and level-based programs. | Not started | May use dynamic platform pages. |
| Portland Tennis Center | Rental | P1 | https://www.portland.gov/parks/portland-tennis-center | Eight indoor and four outdoor tennis courts with online court reservations. | Not started | Public agency link-out. |
| Portland Tennis & Education pickleball | Event and rental | P1 | https://www.ptande.org/pickleball | Online booking for pickleball courts, classes, and lessons. | Not started | Inspect booking provider. |
| 03 International Badminton Club | Event and rental | P1 | https://www.03intlbadminton.net/ | Beaverton/Portland-area badminton court rentals, classes, tournaments, memberships, and camps. | Not started | Good racket-sports source. |
| D-BAT PDX West, Tigard | Event and rental | P1 | https://www.dbatpdxwest.com/ | Baseball/softball lessons, cage rentals, camps, clinics, HitTrax leagues, team practices, and parties. | Not started | Affiliate outreach target. |
| The Courts in Beaverton / The Courts in Oregon | Event and rental | P1 | https://www.thecourtsinoregon.com/ | Volleyball courts, basketball courts, rentals, camps, clinics, events, and tournaments. | Not started | Check relationship to Clear Creek source. |
| PCC Athletic Facility Rentals | Rental | P1 | https://www.pcc.edu/facility-rental/athletic/ | Gymnasiums, studios, soccer field, and track rentals across PCC Cascade, Rock Creek, Southeast, and Sylvania. | Not started | Public facility link-out. |
| Montavilla Community Center | Rental | P1 | https://www.portland.gov/parks/montavilla-community-center | Gym rentals with basketball/volleyball court setup and after-hours rental windows. | Not started | Public agency link-out. |
| Oregon Youth Soccer sanctioned tournaments | Event | P1 | https://www.oregonyouthsoccer.org/sanctioned-tournaments/ | Sanctioned youth soccer tournaments and host-registration resources. | Not started | Tournament discovery source. |
| Portland Youth Soccer Association | Event | P1 | https://leagues.bluesombrero.com/Default.aspx?tabid=1558293 | Youth soccer team registration, deadlines, league information, and club/association links. | Not started | Blue Sombrero source. |
| Portland City United Soccer Club | Event | P1 | https://www.pcusc.org/ | Youth soccer teams, academies, camps, leagues, and tournament opportunities. | Not started | Club program source. |
| United PDX | Event | P1 | https://www.unitedpdx.com/ | Youth soccer registration, fees, development academy programs, jamborees, and league play. | Not started | Club program source. |
| Oregon Super Cup | Event | P1 | https://soccerchanceacademy.us/super-cup/ | Portland metro youth soccer tournament with dates, registration deadline, and format. | Not started | Specific tournament source. |
| NW Nations Tournament Baseball | Event | P1 | https://nwyouthbaseball.com/ | Pacific Northwest youth baseball tournament registration and schedules. | Not started | Regional tournament source. |
| Washington Baseball Tournaments / Youth OR tournaments | Event | P1 | https://www.washingtonbaseballtournaments.com/youth-or/overview/ | Oregon youth baseball tournament dates, locations, age groups, and registration links. | Not started | Regional tournament source. |
| HoopSource Basketball | Event | P1 | https://hoopsourcebasketball.com/ | Youth basketball tournaments, leagues, and events around the Northwest. | Not started | Regional event source. |
| CEVA / Columbia Empire Volleyball Association | Event | P1 | https://cevaregion.org/bvc-adult-tournament-dates-announced/ | Adult volleyball tournament announcements, costs, membership requirements, and regional tournament opportunities. | Not started | Volleyball tournament source. |
| YMCA Columbia-Willamette sports | Event | P1 | https://www.ymcacw.org/programs/sports/volleyball | Youth volleyball and adult pickup basketball/pickleball-style programs across YMCA locations. | Not started | Multi-location program source. |

## Aggregators And Partner-Only Sources

These sources are useful for discovery and outreach, but they should not be primary scraped inventory without further legal/product review because they are aggregators, marketplaces, closed ecosystems, or high-friction community platforms.

| Source | Suggested use | URL | Status | Notes |
| --- | --- | --- | --- | --- |
| Playpass Portland/Gresham pages | Discover small local organizers and link to organizer-owned pages where appropriate. | https://playpass.com/gresham-or/volleyball | Not started | Avoid deep copying aggregator descriptions. |
| GoodRec Portland | Lead source for pickup soccer, basketball, pickleball, and open-play volleyball discovery. | https://www.goodrec.com/pickup-soccer/portland | Not started | Better as lead generation and link-out. |
| Meetup Portland sports pages | Lead source for pickup groups and organizer outreach. | https://www.meetup.com/find/us--or--portland/volleyball/ | Not started | Community platform; use cautiously. |
| Eventbrite Portland sports and fitness / tournaments | Lead source for one-off tournaments, races, clinics, wrestling, fitness events, and other public sports events. | https://www.eventbrite.com/b/or--portland/sports-and-fitness/ | Not started | Use event links, not copied long descriptions. |
| Facilitron Portland / school rentals | Facility discovery and official booking link-outs for school gyms, fields, tennis courts, and outdoor basketball courts. | https://www.facilitron.com/or/portland | Not started | Some pricing or availability may require login. |
| Swimply Portland/Gresham sports courts | Partner or link-out candidate for private pickleball, basketball, and court rentals. | https://swimply.com/explore/us-or-portland/pickleball-court | Not started | Marketplace source; partner-only by default. |
| Facebook public groups | Outreach source for pickup games and group admins. | https://www.facebook.com/groups/1906445192900340/ | Not started | Higher terms/friction risk; prefer submit-your-event flows. |

## Affiliate Outreach Targets

Best early affiliate candidates are independent operators who benefit directly from filled spots or rental bookings:

- Underdog Portland
- Rose City Futsal
- Troutdale Indoor Sports
- The Courts at Clear Creek
- Eastside Timbers / Oregon Premier Futsal
- RECS
- The People's Courts
- Batting a Thousand
- Big Dawg Batting
- D-BAT PDX West
- Oregon Badminton Academy
- The Plex
- Tualatin Indoor Soccer
- Portland Basketball
- Portland Metro Softball
- OutLoud Sports

City, school, and parks sites remain strong inventory sources, but they are more likely to support official link-outs than affiliate payouts.

## Implementation Notes

Use this section as a changelog when a source moves forward. For each implemented source, record the active mapping version, whether JavaScript rendering is required, the last manual ScrapingDog inspection date, and any known selector limitations.

- 2026-06-25: Initial registry created from the supplied Gresham / Portland metro source list. No scrapers have been implemented yet.
- 2026-06-25: Product direction clarified that normal sources should use manually authored DB-stored mappings. Codex/developers will run ScrapingDog, inspect the output, identify selectors and transforms, and save mappings to the database. The admin page only needs to run saved mappings and review/publish discovered candidates.
