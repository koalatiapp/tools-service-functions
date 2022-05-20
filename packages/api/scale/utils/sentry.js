const { SENTRY_DSN } = process.env;

if (SENTRY_DSN) {
	const Sentry = require("@sentry/node");
	// eslint-disable-next-line no-unused-vars
	const Tracing = require("@sentry/tracing");

	Sentry.init({
		dsn: SENTRY_DSN,
		tracesSampleRate: .1,
	});
}
