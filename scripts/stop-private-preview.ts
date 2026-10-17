import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".data/private-preview", { recursive: true });
await writeFile(".data/private-preview/stop", "stop");
console.log("Stop requested for the temporary private preview. Local HireLens is unchanged.");
