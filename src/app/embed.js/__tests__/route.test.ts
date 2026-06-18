jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    readonly headers: { get: (name: string) => string | null };

    constructor(private readonly body: string, init?: { headers?: Record<string, string> }) {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
      );
      this.headers = {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      };
    }

    async text() {
      return this.body;
    }
  },
}));

import { GET } from '../route';

describe('GET /embed.js', () => {
  it('emits support for direct registration widgets', async () => {
    const response = await GET();
    const script = await response.text();

    expect(response.headers.get('Content-Type')).toContain('application/javascript');
    expect(script).toContain("'registration'");
    expect(script).toContain('target.dataset.eventId');
    expect(script).toContain("'/registration/'");
    expect(script).toContain('target.dataset.slotId');
    expect(script).toContain('target.dataset.occurrenceDate');
  });
});
