const queue = require("./queue.js")();
const { MAX_CONCURRENT_SAME_HOST_REQUESTS } = process.env;
let timesByToolPromise = queue.getAverageProcessingTimes();

setInterval(() => timesByToolPromise = queue.getAverageProcessingTimes(), 120000);

async function getAverageTimeForTool(tool) {
	const fallbackTime = 3000;

	try {
		const timesByTool = (await timesByToolPromise).average;
		const toolEstimates = timesByTool[tool] || {};

		return parseInt(toolEstimates.processing_time || fallbackTime);
	} catch (err) {
		return fallbackTime;
	}
}

/**
 * Estimates the total amount of time it will take to process
 * the provided array of requests.
 *
 * This takes into account the concurrent processing of requests
 * from the same domain, assuming a 90% usage / load.
 *
 * @param {Array} requests Requests for which to estimate the processing time.
 * @param {Float} processingCapacityPercentage Percentage of the processing capacity that is used for calclations.
 * @returns {Promise<int>} Total processing time in milliseconds.
 */
module.exports = async function estimateProcessingTime(requests, processingCapacityPercentage = 0.9) {
	const timeByProcessor = {};
	let maxNbOfProcessors = Math.max(1, Math.floor(MAX_CONCURRENT_SAME_HOST_REQUESTS * processingCapacityPercentage));

	if (requests.length < 40) {
		maxNbOfProcessors = 1;
	}

	for (const request of requests) {
		let time = await getAverageTimeForTool(request.tool);
		let lowestIndex = 0;
		let lowestTime = null;

		// Deduct already elapsed time
		if (request.processed_at) {
			const msSinceStart = (new Date()).getTime() - (new Date(request.processed_at)).getTime();

			if (msSinceStart >= 0) {
				time -= msSinceStart;
			}
		}

		for (let processorIndex = 0; processorIndex < maxNbOfProcessors; processorIndex++) {
			if (lowestTime === null || (timeByProcessor[processorIndex] ?? 0) < lowestTime) {
				lowestIndex = processorIndex;
				lowestTime = timeByProcessor[processorIndex] ?? 0;
			}
		}

		timeByProcessor[lowestIndex] = (timeByProcessor[lowestIndex] ?? 0) + time;
	}

	return Math.max(...Object.values(timeByProcessor));
};
