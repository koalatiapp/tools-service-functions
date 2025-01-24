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

	async deleteOldRequests() {
		await this._waitForDatabaseConnection();
		await this.database.query(`
            DELETE
			FROM requests
			WHERE processed_at IS NOT NULL
			AND processed_at < (NOW() - interval 2 week)
        `);
	}
}

module.exports = () => new Queue();
