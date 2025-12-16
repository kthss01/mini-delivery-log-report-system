import fs from "fs/promises";

export async function loadEventLog(filePath, { format = "jsonl" } = {}) {
	const text = await fs.readFile(filePath, "utf-8");

	if (format === "csv") {
		// MVP: CSV 파서는 나중에 확장(지금은 jsonl 기준으로 시작 추천)
		throw new Error("CSV loader not implemented yet. Use JSONL first.");
	}

	// JSONL
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}
