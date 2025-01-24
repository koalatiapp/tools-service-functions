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
            WHERE url = ?
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
            WHERE url LIKE ?
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

		const timesByTool = {};
		const [processingTimeRows] = await this.database.query(`
            SELECT tool, average_processing_time AS processing_time
            FROM average_processing_times
        `);

		for (const row of processingTimeRows) {
			timesByTool[row.tool] = {
				processing_time: row.processing_time,
			};
		}

		return timesByTool;
	}
}

module.exports = () => new Queue();
