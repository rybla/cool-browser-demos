declare module "*.svg" {
  const path: `${string}.svg`;
  export = path;
}

declare module "*.png" {
  const path: `${string}.png`;
  export = path;
}

declare module "*.module.css" {
  const content: { [className: string]: string };
  export default content;
}

declare module "*.css" {
  const path: `${string}.css`;
  export = path;
}
