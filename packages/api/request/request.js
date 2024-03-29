require("./utils/sentry.js");

const createDatabaseClient = require("./utils/database.js");

exports.main = async (request) => {
	if (request.__ow_headers.authorization != `Bearer ${process.env.AUTH_ACCESS_TOKEN}`) {
		throw new Error("Unauthorized");
	}

	const urls = Object.values(request.urls ?? []);
	const tools = Object.values(request.tools ?? []);
	let priority = request.priority ?? 1;
	const rowsToInsert = [];

	console.log("Received testing request with the following payload:", request);

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

	console.log(`${rowsToInsert.length} rows to insert in request database`);

	if (rowsToInsert.length) {
		const queryParams = [];
		let insertQuery = "INSERT INTO requests (url, hostname, tool, priority) VALUES ";
		let insertRowStrings = [];

		for (const row of rowsToInsert) {
			const paramStrings = [];

			for (const paramValue of row) {
				queryParams.push(paramValue);
				paramStrings.push("?");
			}

			insertRowStrings.push(paramStrings.join(", "));
		}

		const database = await createDatabaseClient();
		insertQuery += insertRowStrings.map(paramString => `(${paramString})`).join(", ");
		await database.query(insertQuery, queryParams);
		await database.end();
	}

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			requestsAdded: rowsToInsert.length,
		})
	};
};
