import fs from "fs";
import path from "path";

/**
 * Each directory in `site/` is treated as a page route route. This function
 * lists all of these page routes.
 */
export function get_pages(): { name: string; path: string }[] {
  return fs
    .readdirSync("site")
    .filter((fp) => fs.statSync(path.join("site", fp)).isDirectory())
    .map((fn) => ({
      name: path.basename(fn),
      path: fn,
    }));
}
