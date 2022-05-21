require("./utils/sentry.js");

const database = require("./utils/pg-pool.js")();
const queue = require("./utils/queue.js")(database);
const { createApiClient } = require('dots-wrapper');
const digitalOcean = createApiClient({ token: process.env.DO_API_TOKEN });
const TOOL_SERVICE_APP_ID = process.env.TOOL_SERVICE_APP_ID;
const MAX_CONCURRENT_SAME_HOST_REQUESTS = parseInt(process.env.MAX_CONCURRENT_SAME_HOST_REQUESTS || 10);

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	// Load current app spec from DO
	const { data } = await digitalOcean.app.getApp({ app_id: TOOL_SERVICE_APP_ID });
	const spec = data.app.spec;
	const currentContainerCount = data.app.spec.services[0].instance_count;

	// Calculate the ideal number of containers for the current request queue
	const pendingCountByHostname = await queue.pendingCountByHostname();
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

	if (currentContainerCount == idealContainerCount) {
		console.log(`The app is already running on ${idealContainerCount} - there's nothing to do.`);
	} else {
		console.log(`Sending DO an app spec update...`);

		spec.services[0].instance_count = idealContainerCount;
		await digitalOcean.app.updateApp({ app_id: TOOL_SERVICE_APP_ID, spec });

		console.log(`The app has been updated on DO!`);
	}

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
