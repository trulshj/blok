import type { CSSProperties } from "react";

/** B L O K on four tiles, from notatblokk. `size` is one tile in px. */
export function Logo({ size = 20, strip = false }: { size?: number; strip?: boolean }) {
  return (
    <span className={strip ? "logo logo--strip" : "logo"} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden="true">
      <b>B</b>
      <b>L</b>
      <b>O</b>
      <b>K</b>
    </span>
  );
}
