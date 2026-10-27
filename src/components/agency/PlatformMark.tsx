import { useState } from "react";

/**
 * Platform symbol. Shows the official logo file placed in /public/brand (google-ads.svg/.png, meta.svg/.png)
 * and falls back to the coloured marker while the file is missing.
 */
export function PlatformMark({ platform, size = 16 }: { platform: "google" | "meta"; size?: number }) {
  // Tries .svg, then .png; the coloured marker if neither exists.
  const [attempt, setAttempt] = useState(0);
  if (attempt > 1) return <i aria-hidden />;
  const base = platform === "google" ? "/brand/google-ads" : "/brand/meta";
  return (
    <img
      className="platformMark"
      key={attempt}
      src={base + (attempt === 0 ? ".svg" : ".png")}
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flex: "none" }}
      onError={() => setAttempt((n) => n + 1)}
    />
  );
}
