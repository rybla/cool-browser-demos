[doc("Install all dependencies")]
install:
  @echo "Installing dependencies"
  bun install

[doc("Format source code (prettier)")]
format:
  @echo "Formatting"
  bun prettier --log-level warn --write .

[doc("Typecheck source code (TypeScript compiler)")]
typecheck:
  @echo "Typechecking"
  bun tsc --noEmit

[doc("Lint source code (ESLint)")]
lint:
  @echo "Linting"
  bun eslint . --fix

[doc("Bundle project (Bun)")]
bundle:
  @echo "Bundling project"
  bun run bundle.ts

[doc("Run entire build pipeline")]
build: install format typecheck lint bundle

[doc("Run local development server")]
dev: build
  @echo "Running local development server"
  bun run serve.ts

[doc("Deploy to GitHub Pages")]
deploy: build
  ./deploy-to-github-pages.sh
