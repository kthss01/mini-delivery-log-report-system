/**
 * generate_event_log.js
 * Node.js script to generate event_log.csv (+ optional order_summary.csv)
 *
 * Usage:
 *   node generate_event_log.js
 *   ORDERS=1000 START=2025-01-01 END=2025-01-31 DIRTY=0.01 SEED=42 node generate_event_log.js
 */

const fs = require("fs");
const path = require("path");

// -------------------------
// Config (env overrides)
// -------------------------
const ORDERS = parseInt(process.env.ORDERS ?? "200", 10); // number of orders
const START = process.env.START ?? "2025-01-01";
const END = process.env.END ?? "2025-01-31";
const DIRTY = Math.max(0, Math.min(0.2, parseFloat(process.env.DIRTY ?? "0"))); // 0~0.2
const SEED = parseInt(process.env.SEED ?? "12345", 10);

const OUT_DIR = process.env.OUT_DIR ?? ".";
const EVENT_LOG_FILE = path.join(OUT_DIR, "event_log.csv");
const ORDER_SUMMARY_FILE = path.join(OUT_DIR, "order_summary.csv");

// -------------------------
// Deterministic RNG (LCG)
// -------------------------
function makeRng(seed) {
	let s = seed >>> 0;
	return function rand() {
		// LCG constants
		s = (Math.imul(1664525, s) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}
const rng = makeRng(SEED);

function randInt(min, max) {
	// inclusive
	return Math.floor(rng() * (max - min + 1)) + min;
}
function maybe(p) {
	return rng() < p;
}
function pick(arr) {
	return arr[randInt(0, arr.length - 1)];
}
function pickWeighted(items) {
	// items: [{ value, weight }]
	const total = items.reduce((a, b) => a + b.weight, 0);
	let r = rng() * total;
	for (const it of items) {
		r -= it.weight;
		if (r <= 0) return it.value;
	}
	return items[items.length - 1].value;
}
function roundToThousand(v) {
	return Math.round(v / 1000) * 1000;
}
function pad2(n) {
	return String(n).padStart(2, "0");
}
function toIsoLocal(dt) {
	// ISO without timezone (matches our earlier examples)
	return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(
		dt.getDate()
	)}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(
		dt.getSeconds()
	)}`;
}
function addMinutes(dt, minutes) {
	return new Date(dt.getTime() + minutes * 60 * 1000);
}
function addSeconds(dt, seconds) {
	return new Date(dt.getTime() + seconds * 1000);
}

// -------------------------
// Domain pools
// -------------------------
const REGIONS = [
	"SEOUL_GANGNAM",
	"SEOUL_MAPO",
	"SEOUL_JAMSIL",
	"SEOUL_SEONGSU",
	"SEOUL_YEONGDEUNGPO",
	"SEOUL_JONGNO",
];

const PAYMENT_METHODS = [
	{ value: "CARD", weight: 45 },
	{ value: "KAKAO_PAY", weight: 30 },
	{ value: "NAVER_PAY", weight: 20 },
	{ value: "CASH", weight: 5 },
];

const CANCEL_REASONS = [
	{ value: "USER_CHANGED_MIND", weight: 30 },
	{ value: "STORE_REJECTED", weight: 15 },
	{ value: "NO_RIDER_AVAILABLE", weight: 25 },
	{ value: "LATE_DELIVERY", weight: 20 },
	{ value: "PAYMENT_FAILED", weight: 10 },
];

const EVENT_TYPES = {
	ORDER_CREATED: "ORDER_CREATED",
	PAYMENT_COMPLETED: "PAYMENT_COMPLETED",
	STORE_ACCEPTED: "STORE_ACCEPTED",
	RIDER_ASSIGNED: "RIDER_ASSIGNED",
	PICKED_UP: "PICKED_UP",
	DELIVERY_COMPLETED: "DELIVERY_COMPLETED",
	ORDER_CANCELLED: "ORDER_CANCELLED",
};

// Create pools (store/user/rider)
const STORE_COUNT = parseInt(process.env.STORE_COUNT ?? "120", 10);
const USER_COUNT = parseInt(process.env.USER_COUNT ?? "1500", 10);
const RIDER_COUNT = parseInt(process.env.RIDER_COUNT ?? "200", 10);

const STORE_IDS = Array.from(
	{ length: STORE_COUNT },
	(_, i) => `S${String(i + 1).padStart(3, "0")}`
);
const USER_IDS = Array.from(
	{ length: USER_COUNT },
	(_, i) => `U${String(i + 1).padStart(4, "0")}`
);
const RIDER_IDS = Array.from(
	{ length: RIDER_COUNT },
	(_, i) => `R${String(i + 1).padStart(3, "0")}`
);

// -------------------------
// Peak time logic
// -------------------------
function isPeakTime(dt) {
	const h = dt.getHours();
	const m = dt.getMinutes();
	const minutes = h * 60 + m;
	const lunchStart = 11 * 60 + 30;
	const lunchEnd = 13 * 60 + 30;
	const dinnerStart = 18 * 60;
	const dinnerEnd = 20 * 60 + 30;
	return (
		(minutes >= lunchStart && minutes <= lunchEnd) ||
		(minutes >= dinnerStart && minutes <= dinnerEnd)
	);
}

function randomDateBetween(startDateStr, endDateStr) {
	const start = new Date(`${startDateStr}T00:00:00`);
	const end = new Date(`${endDateStr}T23:59:59`);
	const t =
		start.getTime() + Math.floor(rng() * (end.getTime() - start.getTime()));
	return new Date(t);
}

// -------------------------
// Amount & fee generators
// -------------------------
function generateOrderAmount() {
	// triangular-ish: average around 22k
	const a = rng();
	const b = rng();
	const x = (a + b) / 2; // ~bell-ish
	const raw = 9000 + x * (45000 - 9000);
	return Math.max(9000, Math.min(45000, roundToThousand(raw)));
}

function generateDeliveryFee(peak) {
	// base distribution 0~5000
	const base = pickWeighted([
		{ value: 0, weight: 5 },
		{ value: 1000, weight: 10 },
		{ value: 2000, weight: 30 },
		{ value: 3000, weight: 35 },
		{ value: 4000, weight: 15 },
		{ value: 5000, weight: 5 },
	]);
	if (!peak) return base;

	// peak: slightly higher
	if (base === 0 && maybe(0.6)) return 1000;
	if (base <= 2000 && maybe(0.5)) return base + 1000;
	if (base === 3000 && maybe(0.3)) return 4000;
	return base;
}

// -------------------------
// Scenario logic
// -------------------------
function pickScenario() {
	return pickWeighted([
		{ value: "COMPLETED", weight: 70 },
		{ value: "CANCELLED", weight: 20 },
		{ value: "IN_PROGRESS", weight: 10 },
	]);
}

function pickCancelStage() {
	// a) pre-payment 3% of all orders roughly => within CANCELLED bucket we approximate ratios:
	// a: 15%, b: 35%, c: 50% of CANCELLED
	return pickWeighted([
		{ value: "PRE_PAYMENT", weight: 15 },
		{ value: "POST_PAYMENT_PRE_ACCEPT", weight: 35 },
		{ value: "POST_ACCEPT", weight: 50 },
	]);
}

function pickCancelReason(stage, peak) {
	if (stage === "PRE_PAYMENT") return "USER_CHANGED_MIND";

	if (stage === "POST_PAYMENT_PRE_ACCEPT") {
		return pickWeighted([
			{ value: "USER_CHANGED_MIND", weight: 60 },
			{ value: "PAYMENT_FAILED", weight: 40 },
		]);
	}

	// POST_ACCEPT
	const peakBoost = peak ? 10 : 0;
	return pickWeighted([
		{ value: "NO_RIDER_AVAILABLE", weight: 40 + peakBoost },
		{ value: "LATE_DELIVERY", weight: 30 + peakBoost },
		{ value: "STORE_REJECTED", weight: 30 },
	]);
}

function durationRanges(peak) {
	// minutes ranges
	return {
		createdToPayment: peak ? [0, 2] : [0, 2],
		paymentToAccept: peak ? [3, 15] : [1, 8],
		acceptToAssign: peak ? [5, 20] : [1, 10],
		assignToPickup: peak ? [8, 25] : [5, 20],
		pickupToComplete: peak ? [15, 45] : [10, 35],
	};
}

// -------------------------
// Dirty data injection (optional)
// -------------------------
function applyDirtyMutation(rowsForOrder) {
	// very small corruptions, only if DIRTY > 0
	// possible mutations:
	// 1) remove PAYMENT_COMPLETED event
	// 2) missing rider_id in RIDER_ASSIGNED
	// 3) slight timestamp inversion by -30~60 seconds on one event
	const m = pickWeighted([
		{ value: "DROP_PAYMENT", weight: 40 },
		{ value: "MISSING_RIDER", weight: 35 },
		{ value: "TIME_INVERT", weight: 25 },
	]);

	if (m === "DROP_PAYMENT") {
		const idx = rowsForOrder.findIndex(
			(r) => r.event_type === EVENT_TYPES.PAYMENT_COMPLETED
		);
		if (idx >= 0) rowsForOrder.splice(idx, 1);
		return;
	}
	if (m === "MISSING_RIDER") {
		const idx = rowsForOrder.findIndex(
			(r) => r.event_type === EVENT_TYPES.RIDER_ASSIGNED
		);
		if (idx >= 0) rowsForOrder[idx].rider_id = "";
		return;
	}
	if (m === "TIME_INVERT") {
		if (rowsForOrder.length < 2) return;
		const idx = randInt(1, rowsForOrder.length - 1);
		const dt = new Date(rowsForOrder[idx].event_time);
		const back = randInt(30, 60);
		rowsForOrder[idx].event_time = toIsoLocal(addSeconds(dt, -back));
	}
}

// -------------------------
// Generators
// -------------------------
let globalEventId = 1;

function generateOrderMeta(orderIndex) {
	const order_id = `O${String(orderIndex + 1).padStart(6, "0")}`;
	const user_id = pick(USER_IDS);
	const region = pick(REGIONS);

	// store could be region-biased; MVP: just random
	const store_id = pick(STORE_IDS);

	const payment_method = pickWeighted(PAYMENT_METHODS);
	const order_amount = generateOrderAmount();

	return {
		order_id,
		user_id,
		store_id,
		region,
		payment_method,
		order_amount,
	};
}

function createEventRow(meta, eventType, eventTime, extras = {}) {
	return {
		event_id: globalEventId++,
		event_time: toIsoLocal(eventTime),
		event_type: eventType,
		order_id: meta.order_id,
		user_id: meta.user_id,
		store_id: meta.store_id,
		region: meta.region,
		payment_method: meta.payment_method,
		order_amount: meta.order_amount,
		delivery_fee: meta.delivery_fee,
		rider_id: extras.rider_id ?? "",
		cancel_reason: extras.cancel_reason ?? "",
	};
}

function generateEventsForOrder(orderIndex) {
	const meta = generateOrderMeta(orderIndex);
	const created = randomDateBetween(START, END);
	const peak = isPeakTime(created);

	meta.delivery_fee = generateDeliveryFee(peak);

	const scenario = pickScenario();
	const ranges = durationRanges(peak);

	const rows = [];

	// Always start with CREATED
	rows.push(createEventRow(meta, EVENT_TYPES.ORDER_CREATED, created));

	// Determine flow
	if (scenario === "COMPLETED") {
		const tPay = addMinutes(created, randInt(...ranges.createdToPayment));
		const tAcc = addMinutes(tPay, randInt(...ranges.paymentToAccept));
		const tAss = addMinutes(tAcc, randInt(...ranges.acceptToAssign));
		const tPick = addMinutes(tAss, randInt(...ranges.assignToPickup));
		const tComp = addMinutes(tPick, randInt(...ranges.pickupToComplete));

		rows.push(createEventRow(meta, EVENT_TYPES.PAYMENT_COMPLETED, tPay));
		rows.push(createEventRow(meta, EVENT_TYPES.STORE_ACCEPTED, tAcc));

		const riderId = pick(RIDER_IDS);
		rows.push(
			createEventRow(meta, EVENT_TYPES.RIDER_ASSIGNED, tAss, {
				rider_id: riderId,
			})
		);
		rows.push(
			createEventRow(meta, EVENT_TYPES.PICKED_UP, tPick, {
				rider_id: riderId,
			})
		);
		rows.push(
			createEventRow(meta, EVENT_TYPES.DELIVERY_COMPLETED, tComp, {
				rider_id: riderId,
			})
		);
	}

	if (scenario === "CANCELLED") {
		const stage = pickCancelStage();
		const cancelReason = pickCancelReason(stage, peak);

		if (stage === "PRE_PAYMENT") {
			// cancel 1~10 min after created
			const tCan = addMinutes(created, randInt(1, 10));
			rows.push(
				createEventRow(meta, EVENT_TYPES.ORDER_CANCELLED, tCan, {
					cancel_reason: cancelReason,
				})
			);
		}

		if (stage === "POST_PAYMENT_PRE_ACCEPT") {
			const tPay = addMinutes(
				created,
				randInt(...ranges.createdToPayment)
			);
			// cancel 1~12 min after payment
			const tCan = addMinutes(tPay, randInt(1, 12));
			rows.push(
				createEventRow(meta, EVENT_TYPES.PAYMENT_COMPLETED, tPay)
			);
			rows.push(
				createEventRow(meta, EVENT_TYPES.ORDER_CANCELLED, tCan, {
					cancel_reason: cancelReason,
				})
			);
		}

		if (stage === "POST_ACCEPT") {
			const tPay = addMinutes(
				created,
				randInt(...ranges.createdToPayment)
			);
			const tAcc = addMinutes(tPay, randInt(...ranges.paymentToAccept));

			rows.push(
				createEventRow(meta, EVENT_TYPES.PAYMENT_COMPLETED, tPay)
			);
			rows.push(createEventRow(meta, EVENT_TYPES.STORE_ACCEPTED, tAcc));

			// Sometimes assigned happens, sometimes not (especially NO_RIDER_AVAILABLE)
			let riderId = "";
			let tAss = null;

			const willAssign =
				cancelReason !== "NO_RIDER_AVAILABLE" ? maybe(0.7) : maybe(0.2);
			if (willAssign) {
				tAss = addMinutes(tAcc, randInt(...ranges.acceptToAssign));
				riderId = pick(RIDER_IDS);
				rows.push(
					createEventRow(meta, EVENT_TYPES.RIDER_ASSIGNED, tAss, {
						rider_id: riderId,
					})
				);
			}

			// cancel after accept/optional assigned
			const baseTime = tAss ?? tAcc;
			const tCan = addMinutes(baseTime, randInt(2, peak ? 25 : 18));
			rows.push(
				createEventRow(meta, EVENT_TYPES.ORDER_CANCELLED, tCan, {
					cancel_reason: cancelReason,
					rider_id: riderId,
				})
			);
		}
	}

	if (scenario === "IN_PROGRESS") {
		// created -> payment always
		const tPay = addMinutes(created, randInt(...ranges.createdToPayment));
		rows.push(createEventRow(meta, EVENT_TYPES.PAYMENT_COMPLETED, tPay));

		// optionally accept
		let tLast = tPay;
		if (maybe(0.75)) {
			const tAcc = addMinutes(tPay, randInt(...ranges.paymentToAccept));
			rows.push(createEventRow(meta, EVENT_TYPES.STORE_ACCEPTED, tAcc));
			tLast = tAcc;

			// optionally assign
			if (maybe(0.55)) {
				const tAss = addMinutes(
					tAcc,
					randInt(...ranges.acceptToAssign)
				);
				const riderId = pick(RIDER_IDS);
				rows.push(
					createEventRow(meta, EVENT_TYPES.RIDER_ASSIGNED, tAss, {
						rider_id: riderId,
					})
				);
				tLast = tAss;

				// optionally picked up but not completed yet
				if (maybe(0.25)) {
					const tPick = addMinutes(
						tAss,
						randInt(...ranges.assignToPickup)
					);
					rows.push(
						createEventRow(meta, EVENT_TYPES.PICKED_UP, tPick, {
							rider_id: riderId,
						})
					);
					tLast = tPick;
				}
			}
		}

		// Ensure it's "recent-ish" within the order flow; no extra action needed for MVP
	}

	// Dirty mutation
	if (DIRTY > 0 && maybe(DIRTY)) applyDirtyMutation(rows);

	return rows;
}

// -------------------------
// order_summary (optional) from event rows
// -------------------------
function buildOrderSummaryFromEvents(allRows) {
	const byOrder = new Map();
	for (const r of allRows) {
		if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
		byOrder.get(r.order_id).push(r);
	}

	const summaries = [];
	for (const [orderId, rows] of byOrder.entries()) {
		rows.sort(
			(a, b) =>
				new Date(a.event_time).getTime() -
				new Date(b.event_time).getTime()
		);
		const base = rows[0];

		const getTime = (type) => {
			const hit = rows.find((x) => x.event_type === type);
			return hit ? hit.event_time : "";
		};

		const created_time = getTime(EVENT_TYPES.ORDER_CREATED);
		const accepted_time = getTime(EVENT_TYPES.STORE_ACCEPTED);
		const assigned_time = getTime(EVENT_TYPES.RIDER_ASSIGNED);
		const picked_up_time = getTime(EVENT_TYPES.PICKED_UP);
		const completed_time = getTime(EVENT_TYPES.DELIVERY_COMPLETED);
		const cancelled_time = getTime(EVENT_TYPES.ORDER_CANCELLED);

		let status = "IN_PROGRESS";
		if (completed_time) status = "COMPLETED";
		if (cancelled_time) status = "CANCELLED";

		const cancel_reason =
			rows.find((x) => x.event_type === EVENT_TYPES.ORDER_CANCELLED)
				?.cancel_reason ?? "";

		const diffMin = (a, b) => {
			if (!a || !b) return "";
			const da = new Date(a).getTime();
			const db = new Date(b).getTime();
			const m = Math.round((db - da) / 60000);
			return Number.isFinite(m) ? String(m) : "";
		};

		const lt_order_to_accept_min = diffMin(created_time, accepted_time);
		const lt_accept_to_pickup_min = diffMin(accepted_time, picked_up_time);
		const lt_pickup_to_complete_min = diffMin(
			picked_up_time,
			completed_time
		);

		let total_lead_time_min = "";
		if (status === "COMPLETED")
			total_lead_time_min = diffMin(created_time, completed_time);
		if (status === "CANCELLED")
			total_lead_time_min = diffMin(created_time, cancelled_time);

		summaries.push({
			order_id: orderId,
			user_id: base.user_id,
			store_id: base.store_id,
			region: base.region,
			payment_method: base.payment_method,
			order_amount: base.order_amount,
			delivery_fee: base.delivery_fee,
			status,
			created_time,
			accepted_time,
			assigned_time,
			picked_up_time,
			completed_time,
			cancelled_time,
			cancel_reason,
			lt_order_to_accept_min,
			lt_accept_to_pickup_min,
			lt_pickup_to_complete_min,
			total_lead_time_min,
		});
	}

	return summaries;
}

// -------------------------
// CSV writer
// -------------------------
function csvEscape(v) {
	const s = String(v ?? "");
	if (s.includes(",") || s.includes('"') || s.includes("\n")) {
		return `"${s.replaceAll('"', '""')}"`;
	}
	return s;
}

function writeCsv(filePath, header, rows) {
	const lines = [];
	lines.push(header.join(","));
	for (const r of rows) {
		lines.push(header.map((h) => csvEscape(r[h])).join(","));
	}
	fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

// -------------------------
// Main
// -------------------------
function main() {
	const allRows = [];
	for (let i = 0; i < ORDERS; i++) {
		const orderRows = generateEventsForOrder(i);
		allRows.push(...orderRows);
	}

	// Optional: sort by time (helps readability / realistic log)
	allRows.sort(
		(a, b) =>
			new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
	);

	const eventHeader = [
		"event_id",
		"event_time",
		"event_type",
		"order_id",
		"user_id",
		"store_id",
		"region",
		"payment_method",
		"order_amount",
		"delivery_fee",
		"rider_id",
		"cancel_reason",
	];
	writeCsv(EVENT_LOG_FILE, eventHeader, allRows);

	// Also output summary
	const summaries = buildOrderSummaryFromEvents(allRows);
	const summaryHeader = [
		"order_id",
		"user_id",
		"store_id",
		"region",
		"payment_method",
		"order_amount",
		"delivery_fee",
		"status",
		"created_time",
		"accepted_time",
		"assigned_time",
		"picked_up_time",
		"completed_time",
		"cancelled_time",
		"cancel_reason",
		"lt_order_to_accept_min",
		"lt_accept_to_pickup_min",
		"lt_pickup_to_complete_min",
		"total_lead_time_min",
	];
	writeCsv(ORDER_SUMMARY_FILE, summaryHeader, summaries);

	console.log(
		`✅ Generated ${allRows.length} event rows from ${ORDERS} orders`
	);
	console.log(`- ${EVENT_LOG_FILE}`);
	console.log(`- ${ORDER_SUMMARY_FILE}`);
	console.log(`(START=${START}, END=${END}, DIRTY=${DIRTY}, SEED=${SEED})`);
}

main();
