/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Adogtame edge infrastructure (ADO-13).
 *
 * - One CloudFront distribution (Router) per stage with its own domain.
 * - WAF defined but disabled to keep costs at zero (ENABLE_WAF). Once enabled,
 *   it only applies to the `prod` stage (I0.2 decision, cost).
 * - Public photo bucket served by CloudFront under `/fotos`; temporary uploads
 *   under `tmp/` expire after 1 day.
 * - One SNS topic per publishing service (Auth, Dogs, Requests). Each
 *   microservice owns its queues and subscribes to these topics.
 * - `/api/<service>` routes to each microservice HTTP API, so the web app
 *   and the API share the same domain (HttpOnly session cookie).
 */

const ROOT_DOMAIN = "vieerr.xyz";
const SERVICES = ["auth", "dogs", "requests", "recommendation"] as const;
const PUBLISHERS = ["Auth", "Dogs", "Requests"] as const;

// WAF costs about USD 9/month. Disabled until the project review needs it.
// Set to true to enable it on the `prod` stage (RNF-23).
const ENABLE_WAF = false;

export default $config({
  app(input) {
    return {
      name: "adogtame-infra",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: input?.stage === "prod",
      home: "aws",
      providers: {
        aws: { profile: "bier-personal", region: "us-east-1" },
      },
    };
  },
  async run() {
    const isProd = $app.stage === "prod";
    const base = isProd ? `adogtame.${ROOT_DOMAIN}` : `${$app.stage}.adogtame.${ROOT_DOMAIN}`;

    const photos = new sst.aws.Bucket("Photos", {
      access: "cloudfront",
      // Photos are uploaded first under tmp/ and moved when the dog is created.
      lifecycle: [{ id: "expire-temporary-uploads", prefix: "tmp/", expiresIn: "1 day" }],
    });

    const router = new sst.aws.Router("Edge", {
      domain: { name: base, dns: sst.aws.dns() },
      // RNF-23: block IPs above 500 requests in 5 minutes, plus AWS managed rules.
      waf: ENABLE_WAF && isProd ? { rateLimitPerIp: 500 } : undefined,
      transform: {
        // RNF-23 asks for 429 instead of the default 403 on rate limiting.
        waf: (args) => {
          args.rules = $output(args.rules).apply((rules) =>
            (rules ?? []).map((rule) =>
              rule.name === "RateLimitPerIP"
                ? { ...rule, action: { block: { customResponse: { responseCode: 429 } } } }
                : rule,
            ),
          );
        },
      },
    });

    router.routeBucket("/fotos", photos, {
      rewrite: { regex: "^/fotos/(.*)$", to: "/$1" },
    });

    for (const service of SERVICES) {
      router.route(`/api/${service}`, `https://${service}-api.${base}`, {
        rewrite: { regex: `^/api/${service}/(.*)$`, to: "/$1" },
      });
    }

    // Shared values that the other Adogtame apps read from SSM.
    new aws.ssm.Parameter("RouterDistributionId", {
      name: `/adogtame/${$app.stage}/router-distribution-id`,
      type: "String",
      value: router.distributionID,
    });
    new aws.ssm.Parameter("PhotosBucketName", {
      name: `/adogtame/${$app.stage}/photos-bucket-name`,
      type: "String",
      value: photos.name,
    });

    // Event topics (adog_ARCH.md §4.2). Messages carry a `tipo` attribute that
    // consumers use in their subscription filters.
    const topics: Record<string, string | $util.Output<string>> = {};
    for (const publisher of PUBLISHERS) {
      const topic = new sst.aws.SnsTopic(`${publisher}Events`);
      new aws.ssm.Parameter(`${publisher}EventsTopicArn`, {
        name: `/adogtame/${$app.stage}/topics/${publisher.toLowerCase()}-events-arn`,
        type: "String",
        value: topic.arn,
      });
      topics[`${publisher.toLowerCase()}EventsTopic`] = topic.arn;
    }

    return {
      ...topics,
      url: router.url,
      distributionId: router.distributionID,
      photosBucket: photos.name,
    };
  },
});
