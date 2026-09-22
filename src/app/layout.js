// src/app/layout.js
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "TaskWhisker",
  description: "Internal operations dashboard for pet-sitting",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="taskwhisker">
      <body
        className={[
          "antialiased",
          "min-h-screen",
          "bg-[var(--background)]",
          "text-[var(--foreground)]",
        ].join(" ")}
      >
        {/* <ShimejiAssistant storageKey="taskwhisker-shimeji-enabled" /> */}
        {children}
      </body>
    </html>
  );
}
