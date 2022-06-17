require("./utils/sentry.js");

const createPgClient = require("./utils/pg-client.js");

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	const urls = request.urls ?? [];
	const tools = request.tools ?? [];
	let priority = request.priority ?? 1;
	const rowsToInsert = [];

	for (const tool of tools) {
		if (!/^@koalati\/.+/.test(tool)) {
			throw new Error(`Invalid tool requested. ${tool} is either not a valid Koalati tool, or it is not installed.`);
		}

		for (const url of urls) {
			// Extract the hostname from the URL
			const hostname = (new URL(url)).hostname;

			// Insert the request in the database
			rowsToInsert.push([url, hostname, tool, priority]);
		}
	}

	if (rowsToInsert.length) {
		const queryParams = [];
		let paramNumber = 1;
		let insertQuery = "INSERT INTO requests (url, hostname, tool, priority) VALUES ";
		let insertRowStrings = [];

		for (const row of rowsToInsert) {
			const paramStrings = [];

			for (const paramValue of row) {
				queryParams.push(paramValue);
				paramStrings.push("$" + paramNumber);
				paramNumber += 1;
			}

			insertRowStrings.push(paramStrings.join(", "));
		}

		const pgClient = await createPgClient();
		insertQuery += insertRowStrings.map(paramString => `(${paramString})`).join(", ");
		await pgClient.query(insertQuery, queryParams);
		await pgClient.end();
	}

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			requestsAdded: rowsToInsert.length,
		})
	};
};
