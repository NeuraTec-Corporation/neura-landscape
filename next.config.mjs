const config = {
	serverExternalPackages: [
		"@electric-sql/pglite",
		"pg",
		"sharp",
		"@vercel/blob",
		"better-auth",
	],
	outputFileTracingIncludes: { "/api/**/*": ["./db/migrations/*.sql"] },
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
					{ key: "Referrer-Policy", value: "no-referrer" },
				],
			},
		];
	},
};
export default config;
