function avg(nums) {
	if (!nums.length) return null;
	return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function aggregateKPI(
	orderMetrics,
	{ slaSeconds = 2700, groupKey = "region" } = {}
) {
	const completed = orderMetrics.filter(
		(m) => typeof m.totalLeadTime === "number"
	);

	const delayedCount = completed.filter(
		(m) => m.totalLeadTime > slaSeconds
	).length;

	// 병목(가장 큰 segment)
	const bottleneckCounts = new Map();
	for (const m of completed) {
		let maxSeg = null;
		let maxVal = -1;
		for (const [k, v] of Object.entries(m.segments)) {
			if (typeof v === "number" && v > maxVal) {
				maxVal = v;
				maxSeg = k;
			}
		}
		if (maxSeg)
			bottleneckCounts.set(
				maxSeg,
				(bottleneckCounts.get(maxSeg) ?? 0) + 1
			);
	}

	const bottleneckTop3 = [...bottleneckCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([segment, count]) => ({
			segment,
			ratio: completed.length
				? Number((count / completed.length).toFixed(2))
				: 0,
		}));

	// 그룹별(간단 버전)
	const groups = new Map();
	for (const m of completed) {
		const key = m[groupKey] ?? "UNKNOWN";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(m.totalLeadTime);
	}

	const byGroup = {};
	for (const [k, arr] of groups.entries()) {
		byGroup[k] = {
			completedOrders: arr.length,
			averageLeadTime: avg(arr),
		};
	}

	return {
		totalOrders: orderMetrics.length,
		completedOrders: completed.length,
		averageLeadTime: avg(completed.map((m) => m.totalLeadTime)),
		delayedOrderRate: completed.length
			? Number((delayedCount / completed.length).toFixed(2))
			: 0,
		bottleneckTop3,
		byGroup,
	};
}
