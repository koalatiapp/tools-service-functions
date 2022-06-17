const { Client } = require("pg");
const { PG_DATABASE_CA_CERT } = process.env;
const config = {
	query_timeout: 10000,
};

if (PG_DATABASE_CA_CERT) {
	const certBuffer = Buffer.from(PG_DATABASE_CA_CERT, "base64");

	console.log("Using CA certificate from PG_DATABASE_CA_CERT environment variable.");

	config.ssl = {
		rejectUnauthorized: false,
		ca: certBuffer.toString(),
	};
}

let clientCount = 1;
let openCount = 0;

module.exports = async () => {
	const clientId = clientCount;
	clientCount += 1;

	const client = new Client(config);

	try {
		await client.connect();
		openCount++;

		console.log(`established postgres connection ${clientId} (${openCount} open connections)`);
	} catch (err) {
		console.error(`postgres connection error (${clientId})`, err);
		throw err;
	}

	client.on("error", err => console.error("postgres error:", err.stack));
	client.on("notice", msg => console.warn("postgres notice:", msg));
	client.on("end", () => {
		openCount--;
		console.log(`closed postgres connection ${clientId} (${openCount} open connections)`);
	});

	return client;
};
