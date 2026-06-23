---
trigger: always_on
glob:
description: Run build pipeline with `just build`.
---

After editing any source code, you must run `just build`, which will output diagnostics collected from running all source code checks of the build pipeline. You must iteratively address these diagnostics and re-run `just build` until all diagnostics have been addressed.
