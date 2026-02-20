import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const distDir = "dist";

function run(command) {
	console.log(`[build] ${command}`);
	execSync(command, { stdio: "inherit" });
}

function copyFile(from, to) {
	fs.copyFileSync(from, to);
	console.log(`[build] copied: ${from} -> ${to}`);
}

function main() {
	run("npm run run");

	fs.mkdirSync(distDir, { recursive: true });
	copyFile(path.join("src", "web", "dashboard.html"), path.join(distDir, "index.html"));
	copyFile(path.join("output", "kpi.json"), path.join(distDir, "kpi.json"));

	console.log("[build] dist ready for GitHub Pages");
}

main();
