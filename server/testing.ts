import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A throwaway parent folder with an empty "blok" checkout inside, so the default
 * "../blok-notes" also lands in the temp folder. Call cleanup() when done.
 */
export function tempCheckout() {
  const parent = mkdtempSync(join(tmpdir(), "blok-test-"));
  const root = join(parent, "blok");
  mkdirSync(root);
  return { parent, root, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}
