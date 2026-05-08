/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#0f1117",
          sidebar: "#121520",
          panel: "#11141d",
          panelAlt: "#171b26",
          panelMuted: "#1f2431",
          input: "#1e2130",
          border: "#23283a",
          borderStrong: "#2e3250",
          text: "#f5f5f5",
          subtext: "#8b8fa8",
          muted: "#6f748d",
          accent: "#ff4500",
          accentHover: "#ff6534",
          userBubble: "#241912",
          assistantBubble: "#171b26",
          avatarAssistant: "#221911",
        },
      },
      boxShadow: {
        landing: "0 26px 80px rgba(0, 0, 0, 0.42)",
      },
      keyframes: {
        messageIn: {
          from: {
            opacity: "0",
            transform: "translateY(6px)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
      },
      animation: {
        "message-in": "messageIn 180ms ease forwards",
      },
    },
  },
  plugins: [],
};
