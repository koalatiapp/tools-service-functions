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

	async deleteOldRequests() {
		await this._waitForPgConnection();
		await this.pgClient.query(`
            DELETE
			FROM requests
			WHERE completed_at IS NOT NULL
			AND completed_at < (now()::timestamp - interval '2 week')
        `);
	}
}

module.exports = () => new Queue();
