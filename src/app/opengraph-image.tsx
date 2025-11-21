import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export async function GET() {
  const year = new Date().getFullYear();

  return new ImageResponse(
    (
      <div
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: 'flex',
          gap: '48px',
          padding: '72px',
          background: 'linear-gradient(135deg, #0b1224 0%, #203059 100%)',
          color: '#f7f9fc',
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 20% 20%, rgba(143, 180, 255, 0.22), transparent 38%), radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.12), transparent 36%), radial-gradient(circle at 70% 70%, rgba(88, 140, 255, 0.14), transparent 32%)',
          }}
        />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '24px', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#c7d1e4',
              fontSize: 18,
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8fb4ff', boxShadow: '0 0 0 8px rgba(143, 180, 255, 0.18)' }} />
            Volleyball Event Platform
          </div>

          <div style={{ fontSize: 68, lineHeight: 1.08, fontWeight: 800 }}>
            Razumly MVP
            <br />
            Manage teams, events, and chat in one place.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#8fb4ff', fontSize: 22, fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', width: 12, height: 12, borderRadius: '50%', background: '#7bffb1', boxShadow: '0 0 0 10px rgba(123, 255, 177, 0.12)' }} />
            mvp.razumly.com
          </div>

          <div style={{ display: 'flex', gap: '16px', color: '#c4d5ff', fontSize: 20 }}>
            <span>Live product • {year}</span>
            <span style={{ opacity: 0.6 }}>Appwrite • Next.js • Mantine</span>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            minWidth: 380,
            padding: '28px',
            borderRadius: '18px',
            background: 'rgba(13, 22, 45, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 20px 60px rgba(7, 12, 28, 0.45)',
            display: 'grid',
            gap: '18px',
          }}
        >
          <div style={{ color: '#c7d9ff', fontSize: 18, letterSpacing: '0.02em' }}>Highlights</div>

          {["Event scheduling", "Stripe-powered payments", "Real-time chat", "Team & roster management"].map((item) => (
            <div key={item} style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#f1f5ff', fontSize: 20, fontWeight: 600 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7bffb1, #8fb4ff)',
                  boxShadow: '0 0 0 8px rgba(143, 180, 255, 0.10)',
                }}
              />
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
