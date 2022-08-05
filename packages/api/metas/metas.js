require("./utils/sentry.js");

const getMetaData = require('metadata-scraper');

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	const url = request.url;
	const metas = await getMetaData({
		url,
		timeout: 10000,
		forceImageHttps: true,
	});

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			url,
			metas,
		})
	};
};
