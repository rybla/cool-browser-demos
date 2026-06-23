import { get_pages } from "./index.macro" with { type: "macro" };

const root = document.getElementById("root")!;

const pages = get_pages();

for (const page of pages) {
  const item = document.createElement("div");
  item.classList.add("page-item");
  root.appendChild(item);

  const anchor = document.createElement("a");
  item.appendChild(anchor);
  anchor.classList.add("page-anchor");
  anchor.href = page.path;
  anchor.innerText = page.name;
}
