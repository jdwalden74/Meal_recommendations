"use client";

import { useEffect, useRef } from "react";

export default function ParticlesBackground({
  count = 50,
  color = "rgba(16, 185, 129, 0.8)",
}: {
  count?: number;
  color?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const particles: HTMLDivElement[] = [];

    for (let i = 0; i < count; i++) {
      const particle = document.createElement("div");

      const size = Math.random() * 6 + 4;
      const left = Math.random() * 100;
      const duration = Math.random() * 10 + 8;
      const delay = Math.random() * 10;

      particle.className = "absolute rounded-full";

      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${left}%`;
      particle.style.bottom = "-20px";

      // Glow styling
      particle.style.background = color;
      particle.style.boxShadow = `0 0 ${size * 2}px ${color}`;
      particle.style.filter = "blur(1px)";

      particle.style.animation = `floatUp ${duration}s linear infinite`;
      particle.style.animationDelay = `${delay}s`;

      container.appendChild(particle);
      particles.push(particle);
    }

    return () => {
      particles.forEach((p) => p.remove());
    };
  }, [count, color]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div ref={containerRef} className="relative w-full h-full" />
    </div>
  );
}
