/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as email_config from "../email/config.js";
import type * as email_resend from "../email/resend.js";
import type * as email_templates_passwordReset from "../email/templates/passwordReset.js";
import type * as email_templates_theme from "../email/templates/theme.js";
import type * as email_useCases_sendPasswordResetEmail from "../email/useCases/sendPasswordResetEmail.js";
import type * as favorites from "../favorites.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as metrics from "../metrics.js";
import type * as normalization from "../normalization.js";
import type * as prices from "../prices.js";
import type * as stations from "../stations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  catalog: typeof catalog;
  crons: typeof crons;
  "email/config": typeof email_config;
  "email/resend": typeof email_resend;
  "email/templates/passwordReset": typeof email_templates_passwordReset;
  "email/templates/theme": typeof email_templates_theme;
  "email/useCases/sendPasswordResetEmail": typeof email_useCases_sendPasswordResetEmail;
  favorites: typeof favorites;
  http: typeof http;
  ingestion: typeof ingestion;
  metrics: typeof metrics;
  normalization: typeof normalization;
  prices: typeof prices;
  stations: typeof stations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
