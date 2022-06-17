const createPgClient = require("./pg-client.js");

class Queue {
	constructor()
	{
		this.pgClient = null;
		this._pgClientPromise = createPgClient()
			.then(client => this.pgClient = client);
	}

	async _waitForPgConnection()
	{
		await this._pgClientPromise;
	}

	async disconnect()
	{
		await this._waitForPgConnection();
		await this.pgClient.end();
	}

	async getUnprocessedMatchingRequest(url, tool) {
		await this._waitForPgConnection();

		const res = await this.pgClient.query(`
            SELECT *
            FROM requests
            WHERE completed_at IS NULL
            AND url = $1
            AND tool = $2
        `, [url, tool]);

		return res.rowCount > 0 ? res.rows[0] : null;
	}

	/**
	 * @param {string} url Base URL of the project. Every request that start with this URL will be returned.
	 * @returns {Promise<object[]>}
	 */
	async getRequestsMatchingUrl(url) {
		await this._waitForPgConnection();

		const res = await this.pgClient.query(`
            SELECT *
            FROM requests
            WHERE completed_at IS NULL
            AND url LIKE $1
        `, [url + "%"]);

		return res.rowCount > 0 ? res.rows : [];
	}

	async updateRequestPriority(requestId, newPriority) {
		await this._waitForPgConnection();
		await this.pgClient.query(`
            UPDATE requests
            SET priority = $1
            WHERE id = $2
        `, [newPriority, requestId]);
	}

	async pendingCount() {
		await this._waitForPgConnection();

		const res = await this.pgClient.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NOT NULL
            AND completed_at IS NULL
        `);

		return res.rows[0].count;
	}

	async nonAssignedCount() {
		await this._waitForPgConnection();

		const res = await this.pgClient.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NULL
        `);

		return res.rows[0].count;
	}

	async getAverageProcessingTimes() {
		await this._waitForPgConnection();

		const timesByTool = {
			lowPriority: {},
			highPriority: {},
			average: {},
		};
		const lowPriorityResult = await this.pgClient.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) * 1000) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority = 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const highPriorityResult = await this.pgClient.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) * 1000) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority > 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const averageResult = await this.pgClient.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) * 1000) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            GROUP BY tool
            LIMIT 10000;
        `);

		for (const row of lowPriorityResult.rows) {
			timesByTool.lowPriority[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		for (const row of highPriorityResult.rows) {
			timesByTool.highPriority[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		for (const row of averageResult.rows) {
			timesByTool.average[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		return timesByTool;
	}
}

module.exports = () => new Queue();
