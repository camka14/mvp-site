import { TextDecoder, TextEncoder } from "util";

Object.assign(global, { TextDecoder, TextEncoder });

const { parseTualatinHillsYouthLacrosseDirectory } = require("../tualatinHillsYouthLacrosseSource") as typeof import("../tualatinHillsYouthLacrosseSource");

describe("parseTualatinHillsYouthLacrosseDirectory", () => {
  it("creates club candidates only from the rendered member-club list", () => {
    const result = parseTualatinHillsYouthLacrosseDirectory(`
      <div class="fr-view">
        <p><a href="https://www.tvlaxtitans.com/">TVYLL parent league</a></p>
        <h2>Member Clubs</h2>
        <ul>
          <li><a href="https://www.alohalacrosse.org/">Aloha Youth Lacrosse</a></li>
          <li><a href="https://beavertonhighschoollacrosse.teamsnapsites.com/teams/youth/">Beaverton Beavers Youth Lacrosse</a></li>
          <li><a href="https://westviewlacrosse.com/k-8-registration/">Westview Youth Lacrosse</a></li>
        </ul>
        <h2>Registration</h2>
        <p><a href="https://example.com/boundaries">Attendance boundaries</a></p>
      </div>
    `);

    expect(result.skippedRows).toEqual([]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.title)).toEqual([
      "Aloha Youth Lacrosse",
      "Beaverton Beavers Youth Lacrosse",
      "Westview Youth Lacrosse",
    ]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          listingKind: "CLUB",
          officialActionUrl: "https://www.alohalacrosse.org/",
          city: "Beaverton, OR",
          ageGroup: "Grades 1-8",
          tags: ["Club", "Youth"],
          dateDisplayMode: "ONGOING",
        }),
      ]),
    );
    expect(result.candidates.some((candidate) => candidate.title === "TVYLL parent league"))
      .toBe(false);
  });

  it("reports malformed links and a missing member-club section", () => {
    const malformed = parseTualatinHillsYouthLacrosseDirectory(`
      <h2>Member Clubs</h2>
      <ul><li><a href="mailto:coach@example.com">Email-only club</a></li></ul>
    `);
    expect(malformed.candidates).toEqual([]);
    expect(malformed.skippedRows).toEqual([
      expect.objectContaining({
        title: "Email-only club",
        reason: "invalid or non-HTTP club URL",
      }),
    ]);

    const missing = parseTualatinHillsYouthLacrosseDirectory("<h1>Youth Lacrosse</h1>");
    expect(missing.candidates).toEqual([]);
    expect(missing.skippedRows[0]?.reason).toContain("member club list was not found");
  });
});
