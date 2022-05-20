require("./utils/sentry.js");

const database = require("./utils/pg-pool.js")();

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

			/*
			* If an unprocessed request for this exact URL & tool already exists, there is no need to duplicate it.
			* Just skip this request: both requesters will be notified when the existing is processed.
			*/
			const existingRequest = await getUnprocessedMatchingRequest(url, tool);
			if (existingRequest) {
				// If the new request has a higher priority than the existing one, update the existing request to bump its priority.
				if (priority > existingRequest.priority) {
					await updateRequestPriority(existingRequest.id, priority);
				}

				return;
			}

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

		insertQuery += insertRowStrings.map(paramString => `(${paramString})`).join(", ");
		database.query(insertQuery, queryParams);
	}

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true,
			requestsAdded: rowsToInsert.length,
		})
	};
};

async function getUnprocessedMatchingRequest(url, tool) {
	const res = await database.query(`
		SELECT *
		FROM requests
		WHERE completed_at IS NULL
		AND url = $1
		AND tool = $2
	`, [url, tool]);
	return res.rowCount > 0 ? res.rows[0] : null;
}

async function updateRequestPriority(requestId, newPriority) {
	await database.query(`
		UPDATE requests
		SET priority = $1
		WHERE id = $2
	`, [newPriority, requestId]);
}
