// eslint-disable-next-line import/no-anonymous-default-export
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light"], // ✅ force light only
    darkTheme: "light", // ✅ disable dark fallback
  },
};
