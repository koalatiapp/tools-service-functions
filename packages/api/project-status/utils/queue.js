const createDatabaseClient = require("./database.js");

class Queue {
	constructor()
	{
		this.database = null;
		this._databasePromise = createDatabaseClient()
			.then(client => this.database = client);
	}

	async _waitForDatabaseConnection()
	{
		await this._databasePromise;
	}

	async disconnect()
	{
		await this._waitForDatabaseConnection();
		await this.database.end();
	}

	async getUnprocessedMatchingRequest(url, tool) {
		await this._waitForDatabaseConnection();

		const [rows] = await this.database.query(`
            SELECT *
            FROM requests
            WHERE completed_at IS NULL
            AND url = ?
            AND tool = ?
        `, [url, tool]);

		return rows.length > 0 ? rows[0] : null;
	}

	/**
	 * @param {string} url Base URL of the project. Every request that start with this URL will be returned.
	 * @returns {Promise<object[]>}
	 */
	async getRequestsMatchingUrl(url) {
		await this._waitForDatabaseConnection();

		const [rows] = await this.database.query(`
            SELECT *
            FROM requests
            WHERE completed_at IS NULL
            AND url LIKE ?
        `, [url + "%"]);

		return rows.length > 0 ? rows : [];
	}

	async updateRequestPriority(requestId, newPriority) {
		await this._waitForDatabaseConnection();
		await this.database.query(`
            UPDATE requests
            SET priority = ?
            WHERE id = ?
        `, [newPriority, requestId]);
	}

	async pendingCount() {
		await this._waitForDatabaseConnection();

		const [rows] = await this.database.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NOT NULL
            AND completed_at IS NULL
        `);

		return rows[0].count;
	}

	async nonAssignedCount() {
		await this._waitForDatabaseConnection();

		const [rows] = await this.database.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NULL
        `);

		return rows[0].count;
	}

	async getAverageProcessingTimes() {
		await this._waitForDatabaseConnection();

		const timesByTool = {
			lowPriority: {},
			highPriority: {},
			average: {},
		};
		const [lowPriorityRows] = await this.database.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(TIMESTAMPDIFF(SECOND, completed_at, received_at))) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority = 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const [highPriorityRows] = await this.database.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(TIMESTAMPDIFF(SECOND, completed_at, received_at))) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority > 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const [averageRows] = await this.database.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(TIMESTAMPDIFF(SECOND, completed_at, received_at))) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            GROUP BY tool
            LIMIT 10000;
        `);

		for (const row of lowPriorityRows) {
			timesByTool.lowPriority[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		for (const row of highPriorityRows) {
			timesByTool.highPriority[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		for (const row of averageRows) {
			timesByTool.average[row.tool] = {
				processing_time: row.processing_time,
				completion_time: row.completion_time
			};
		}

		return timesByTool;
	}
}

module.exports = () => new Queue();
