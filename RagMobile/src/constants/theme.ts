export const COLORS = {
  primary: '#4f7ef8',
  primaryDark: '#3b6ff5',
  background: '#f7f8fc',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

export const FONTS = {
  title: {
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  body: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
};
