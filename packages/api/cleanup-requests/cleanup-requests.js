require("./utils/sentry.js");

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	const queue = require("./utils/queue.js")();
	await queue.deassignOldRequests();
	await queue.disconnect();

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
		})
	};
};
