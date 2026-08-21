/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  corePlugins: {
    preflight: false, // Important: disable preflight to prevent breaking PrimeNG/Bootstrap
  },
  theme: {
    extend: {
      colors: {
        primary: "#1E3A8A",
        "on-primary": "#FFFFFF",
        secondary: "#3B82F6",
        "on-secondary": "#FFFFFF",
        accent: "#A16207",
        "on-accent": "#FFFFFF",
        background: "#F8FAFC",
        "on-background": "#0F172A",
        surface: "#FFFFFF",
        "on-surface": "#0F172A",
        muted: "#E2E8F0",
        "on-muted": "#64748B",
        border: "#CBD5E1",
        destructive: "#DC2626",
        "on-destructive": "#FFFFFF",
        ring: "#1E3A8A",
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "gutter": "24px",
        "stack-sm": "12px",
        "margin-mobile": "16px",
        "unit": "8px",
        "stack-lg": "48px",
        "stack-md": "24px",
        "container-max": "1440px",
        "stack-xs": "4px",
        "margin-desktop": "40px"
      },
      fontFamily: {
        "headline-lg": ["Cormorant", "serif"],
        "display-lg": ["Cormorant", "serif"],
        "label-md": ["Montserrat", "sans-serif"],
        "body-sm": ["Montserrat", "sans-serif"],
        "body-lg": ["Montserrat", "sans-serif"],
        "headline-lg-mobile": ["Cormorant", "serif"],
        "headline-md": ["Cormorant", "serif"],
        "body-md": ["Montserrat", "sans-serif"],
        sans: ["Montserrat", "sans-serif"],
        serif: ["Cormorant", "serif"],
      },
      fontSize: {
        "headline-lg": ["32px", { lineHeight: "1.3", fontWeight: "600" }],
        "display-lg": ["48px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "600" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-lg-mobile": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }]
      }
    },
  },
  plugins: [],
}
