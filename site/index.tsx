import { get_pages } from "./index.macro" with { type: "macro" };

const pages = get_pages();

const pagesList = document.getElementById("pages-list")!;

for (const page of pages) {
  const item = document.createElement("div");
  item.classList.add("page-item");
  pagesList.appendChild(item);

  const anchor = document.createElement("a");
  item.appendChild(anchor);
  anchor.classList.add("page-anchor");
  anchor.href = `./${page.path}`;
  anchor.innerText = page.name;
}
