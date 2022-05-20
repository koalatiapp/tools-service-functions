const { createApiClient } = require('dots-wrapper');
const digitalOceanApi = createApiClient({ token: undefined });

exports.main = async (request) => {
	await digitalOceanApi.account.getAccount();

	return {
		headers:  { 'content-type': 'application/json; charset=UTF-8' },
		body: JSON.stringify({
			success: true
		})
	};
};
