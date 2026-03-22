// src/components/ui/ShimejiAssistant.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

const PETS = ["🐶", "🐾", "🐕", "🦴" ,"🐱"];

function getRandomPet() {
  return PETS[Math.floor(Math.random() * PETS.length)];
}

export default function ShimejiAssistant({
  storageKey = "taskwhisker-shimeji-enabled",
  defaultEnabled = true,
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [mounted, setMounted] = useState(false);
  const [pet, setPet] = useState("🐶");
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);

    if (saved !== null) {

      setEnabled(saved === "true");
    }

    setPet(getRandomPet());
  }, [storageKey]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(storageKey, String(enabled));
  }, [enabled, mounted, storageKey]);

  useEffect(() => {
    if (!enabled) return;

    let frameId;
    let lastSwitch = Date.now();

    const animate = () => {
      setPosition((prev) => {
        const nextX = prev.x + direction * 0.25;
        const maxX = Math.max(window.innerWidth - 90, 24);

        let clampedX = nextX;
        let nextDirection = direction;

        if (nextX <= 24) {
          clampedX = 24;
          nextDirection = 1;
        } else if (nextX >= maxX) {
          clampedX = maxX;
          nextDirection = -1;
        }

        if (nextDirection !== direction) {
          setDirection(nextDirection);
        }

        return { ...prev, x: clampedX };
      });

      if (Date.now() - lastSwitch > 10000) {
        lastSwitch = Date.now();
        setPet(getRandomPet());
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [enabled, direction]);

  const characterStyle = useMemo(
    () => ({
      left: `${position.x}px`,
      bottom: `${position.y}px`,
      transform: `scaleX(${direction})`,
    }),
    [position, direction]
  );

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setEnabled((prev) => !prev)}
        className="fixed bottom-4 right-4 z-[70] rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-md transition hover:bg-zinc-50"
        aria-pressed={enabled}
        aria-label={enabled ? "Hide assistant" : "Show assistant"}
      >
        {enabled ? "Hide mascot" : "Show mascot"}
      </button>

      {enabled && (
        <div
          className="pointer-events-none fixed z-[60] select-none"
          style={characterStyle}
          aria-hidden="true"
        >
          <div className="animate-bounce text-4xl drop-shadow-sm">{pet}</div>
        </div>
      )}
    </>
  );
}