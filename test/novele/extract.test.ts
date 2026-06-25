import { describe, expect, test } from "bun:test";
import { spawnSync } from "bun";
import rawProfiles from "./profiles.json";
import type { ExtractTestProfile } from "./run-profile.ts";

const profiles = rawProfiles as ExtractTestProfile[];

for (let i = 0; i < profiles.length; i++) {
	const profile = profiles[i];
	describe(profile.name, () => {
		test("resolves catalog links and parses chapters correctly", () => {
			const result = spawnSync({
				cmd: [
					"bun",
					"-r",
					"./test/setup.ts",
					"test/novele/run-profile.ts",
					String(i),
				],
				env: { ...process.env, NODE_ENV: "test" },
				stdout: "inherit",
				stderr: "inherit",
			});
			expect(result.exitCode).toBe(0);
		});
	});
}
