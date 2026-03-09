import { ImageResponse } from 'next/og';
import { MOBILE_APP_MUI_PALETTE, MOBILE_APP_THEME_TOKENS } from './theme/mobilePalette';

const hexToRgb = (hex: string) => {
  const sanitized = hex.replace('#', '');
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((char) => `${char}${char}`).join('')
    : sanitized;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const withAlpha = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  const year = new Date().getFullYear();
  const primaryMain = MOBILE_APP_MUI_PALETTE.primary.main;
  const primaryLight = MOBILE_APP_MUI_PALETTE.primary.light;
  const primaryDark = MOBILE_APP_MUI_PALETTE.primary.dark;
  const textPrimary = MOBILE_APP_THEME_TOKENS.text;
  const textMuted = MOBILE_APP_THEME_TOKENS.textMuted;
  const panelBackground = withAlpha(MOBILE_APP_THEME_TOKENS.surface, 0.82);

  return new ImageResponse(
    (
      <div
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: 'flex',
          gap: '48px',
          padding: '72px',
          background: `linear-gradient(135deg, ${MOBILE_APP_THEME_TOKENS.background} 0%, ${primaryLight} 100%)`,
          color: textPrimary,
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
              `radial-gradient(circle at 20% 20%, ${withAlpha(primaryMain, 0.22)}, transparent 38%), radial-gradient(circle at 80% 10%, ${withAlpha(MOBILE_APP_THEME_TOKENS.surface, 0.65)}, transparent 36%), radial-gradient(circle at 70% 70%, ${withAlpha(primaryDark, 0.16)}, transparent 32%)`,
          }}
        />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '24px', zIndex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: withAlpha(MOBILE_APP_THEME_TOKENS.surface, 0.74),
              color: textMuted,
              fontSize: 18,
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: primaryMain, boxShadow: `0 0 0 8px ${withAlpha(primaryMain, 0.18)}` }} />
            Multi-sport Event Platform
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 68, lineHeight: 1.08, fontWeight: 800 }}>
            <span>BracketIQ</span>
            <span>Manage teams, events, and chat in one place.</span>
            <span>Any sport. One platform.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: primaryDark, fontSize: 22, fontWeight: 600 }}>
            <span style={{ display: 'flex', width: 12, height: 12, borderRadius: '50%', background: MOBILE_APP_THEME_TOKENS.success, boxShadow: `0 0 0 10px ${withAlpha(MOBILE_APP_THEME_TOKENS.success, 0.12)}` }} />
            BracketIQ by Razumly
          </div>

          <div style={{ display: 'flex', gap: '16px', color: textMuted, fontSize: 20 }}>
            <span>Live product • {year}</span>
            <span style={{ opacity: 0.6 }}>Postgres • Next.js • Mantine</span>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            minWidth: 380,
            padding: '28px',
            borderRadius: '18px',
            background: panelBackground,
            border: `1px solid ${withAlpha(primaryDark, 0.2)}`,
            boxShadow: `0 20px 60px ${withAlpha(primaryDark, 0.28)}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ color: primaryDark, fontSize: 18, letterSpacing: '0.02em' }}>Highlights</div>

          {["Event scheduling", "Stripe-powered payments", "Real-time chat", "Team & roster management", "Multi-sport support"].map((item) => (
            <div key={item} style={{ display: 'flex', gap: '12px', alignItems: 'center', color: textPrimary, fontSize: 20, fontWeight: 600 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${MOBILE_APP_THEME_TOKENS.success}, ${primaryMain})`,
                  boxShadow: `0 0 0 8px ${withAlpha(primaryMain, 0.1)}`,
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
