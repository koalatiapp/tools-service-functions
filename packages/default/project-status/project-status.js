require("./utils/sentry.js");

const database = require("./utils/pg-pool.js")();
const queue = require("./utils/queue.js")(database);
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

	const pendingRequests = await queue.getRequestsMatchingUrl(projectUrl);

	return {
		success: true,
		message: "",
		data: {
			pending: pendingRequests.length > 0,
			requestCount: pendingRequests.length,
			timeEstimate: await estimateProcessingTime(pendingRequests),
		},
	};
};
