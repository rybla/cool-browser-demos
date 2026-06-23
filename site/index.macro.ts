import * as constants from "./constants";
import fs from "fs";
import path from "path";

export function get_pages(): { name: string; path: string }[] {
  return fs
    .readdirSync("site")
    .filter((fp) => fs.statSync(path.join("site", fp)).isDirectory())
    .map((fn) => ({
      name: path.basename(fn),
      path: path.join(constants.ROOT_PATH, fn),
    }));
}
