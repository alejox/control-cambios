import { register } from "node:module";

// Los tests corren contra el Bitwarden falso.
register("./resolver.mjs", import.meta.url, { data: { sdkFalso: true } });
