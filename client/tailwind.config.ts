import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        punch: "#ffec3d",
        danger: "#ff385c",
        turf: "#1df2a0",
        pop: "#6c63ff"
      },
      boxShadow: {
        brutal: "8px 8px 0 #000",
        brutalSm: "4px 4px 0 #000"
      }
    }
  },
  plugins: []
};

export default config;
