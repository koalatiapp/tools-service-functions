require("./utils/sentry.js");

const { createApiClient } = require('dots-wrapper');
const TOOL_SERVICE_APP_ID = process.env.TOOL_SERVICE_APP_ID;
const MAX_CONCURRENT_SAME_HOST_REQUESTS = parseInt(process.env.MAX_CONCURRENT_SAME_HOST_REQUESTS || 10);
const MAX_CONTAINER_HARD_LIMIT = parseInt(process.env.MAX_CONTAINER_HARD_LIMIT || 20);
let previousPendingRequestCount = null;
let previousForcedDeployTimestamp = null;

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	// Load current app spec from DO
	const digitalOcean = createApiClient({ token: process.env.DO_API_TOKEN });
	const { data } = await digitalOcean.app.getApp({ app_id: TOOL_SERVICE_APP_ID });
	const spec = data.app.spec;
	const currentContainerCount = data.app.spec.services[0].instance_count;

	// Calculate the ideal number of containers for the current request queue
	const queue = require("./utils/queue.js")();
	const pendingCountByHostname = await queue.pendingCountByHostname();
	await queue.disconnect();

	let idealContainerCount = 0;
	let totalPendingRequests = 0;
	console.log(`The app currently runs with ${currentContainerCount} containers.`);

	for (const hostnameRequests of pendingCountByHostname) {
		const requestCount = parseInt(hostnameRequests.count);

		// If a hostname only has a few requests pending, it's likely about to
		// end its testing. A single container should suffice, as the testing
		// will likely be done by the time these changes applied and ready for
		// processing.
		if (requestCount <= 20) {
			idealContainerCount += 1;
		}
		// Otherwise, we'll provide 1 container per simultaneous request that
		// this host can handle.
		else {
			idealContainerCount += Math.min(requestCount, MAX_CONCURRENT_SAME_HOST_REQUESTS);
		}

		totalPendingRequests += requestCount;
	}

	idealContainerCount = Math.max(idealContainerCount, 1);

	console.log(`There are ${totalPendingRequests} pending requests split between ${pendingCountByHostname.length} hostnames.`);
	console.log(`Based on that, the app should ideally run on ${idealContainerCount} containers.`);

	if (idealContainerCount > MAX_CONTAINER_HARD_LIMIT) {
		console.log(`Hard limit set in service config is ${MAX_CONTAINER_HARD_LIMIT} containers. This will be used instead.`);
		idealContainerCount = MAX_CONTAINER_HARD_LIMIT;
	}

	if (currentContainerCount == idealContainerCount) {
		console.log(`The app is already running on ${idealContainerCount} - there's nothing to do.`);

		if (previousPendingRequestCount == totalPendingRequests && totalPendingRequests != 0) {
			console.log(`It looks like request processing may be jammed.`);

			if (previousForcedDeployTimestamp && (Date.now() - previousForcedDeployTimestamp) / 1000 < 300000) {
				console.log(`A forced deploy was already done in the past 5 minutes, we'll wait a bit before we retry.`);
			} else {
				console.log(`Forcing a redeploy to get things moving...`);

				await digitalOcean.app.createAppDeployment({ app_id: TOOL_SERVICE_APP_ID, spec });
				previousForcedDeployTimestamp = Date.now();

				console.log(`Redeploy has been queued!`);
			}
		}
	} else {
		console.log(`Sending DO an app spec update...`);

		spec.services[0].instance_count = idealContainerCount;
		try {
			await digitalOcean.app.updateApp({ app_id: TOOL_SERVICE_APP_ID, spec });
		} catch (e) {
			console.error(e);

			return {
				headers:  { 'content-type': 'application/json; charset=UTF-8' },
				body: JSON.stringify({
					success: false,
					totalPendingRequests,
					idealContainerCount,
					currentContainerCount,
				})
			};
		}

		console.log(`The app has been updated on DO!`);
	}

	previousPendingRequestCount = totalPendingRequests;

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			totalPendingRequests,
			idealContainerCount,
			currentContainerCount,
		})
	};
};
