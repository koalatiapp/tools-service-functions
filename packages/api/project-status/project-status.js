require("./utils/sentry.js");

const estimateProcessingTime = require("./utils/estimate-processing-time.js");

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	const projectUrl = request.url ?? null;

	if (!projectUrl) {
		return {
			success: false,
			message: "Missing `url` GET parameter."
		};
	}

	const queue = require("./utils/queue.js")();
	const pendingRequests = await queue.getRequestsMatchingUrl(projectUrl);
	await queue.disconnect();

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			message: "",
			data: {
				pending: pendingRequests.length > 0,
				requestCount: pendingRequests.length,
				timeEstimate: await estimateProcessingTime(pendingRequests),
			},
		})
	}
};
