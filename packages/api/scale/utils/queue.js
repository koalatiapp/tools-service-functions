class Queue {
	constructor(pool) {
		if (typeof pool != "object") {
			throw new Error(`The Queue constructor expects a Postgres Pool object, but received ${typeof pool}`);
		}

		this.pool = pool;
	}

	async getUnprocessedMatchingRequest(url, tool) {
		const res = await this.pool.query(`
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
		const res = await this.pool.query(`
            SELECT *
            FROM requests
            WHERE completed_at IS NULL
            AND url LIKE $1
        `, [url + "%"]);
		return res.rowCount > 0 ? res.rows : [];
	}

	async updateRequestPriority(requestId, newPriority) {
		await this.pool.query(`
            UPDATE requests
            SET priority = $1
            WHERE id = $2
        `, [newPriority, requestId]);
	}

	async pendingCount() {
		const res = await this.pool.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NOT NULL
            AND completed_at IS NULL
        `);
		return res.rows[0].count;
	}

	async pendingCountByHostname() {
		const res = await this.pool.query(`
			SELECT REPLACE(hostname, 'www.', '') AS "hostname", COUNT(*) AS "count"
			FROM requests
			WHERE processed_at IS null
			AND completed_at IS NULL
			GROUP BY REPLACE(hostname, 'www.', '')
        `);
		return res.rowCount > 0 ? res.rows : [];
	}

	async nonAssignedCount() {
		const res = await this.pool.query(`
            SELECT COUNT(*) AS "count"
            FROM requests
            WHERE processed_at IS NULL
        `);
		return res.rows[0].count;
	}

	async getAverageProcessingTimes() {
		const timesByTool = {
			lowPriority: {},
			highPriority: {},
			average: {},
		};
		const lowPriorityResult = await this.pool.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) * 1000) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority = 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const highPriorityResult = await this.pool.query(`
            SELECT tool, ROUND(AVG(processing_time)) AS processing_time, ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) * 1000) AS completion_time
            FROM requests
            WHERE completed_at IS NOT NULL
            AND priority > 1
            GROUP BY tool
            LIMIT 10000;
        `);
		const averageResult = await this.pool.query(`
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

let queueInstance = null;
/**
 * @returns {Queue}
 */
module.exports = (pool) => {
	if (!queueInstance) {
		queueInstance = new Queue(pool);
	}
	return queueInstance;
};
