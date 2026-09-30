/* eslint-disable */
/** Generated `api` utility. Regenerate with `npx convex dev`. */
import type * as MacalyGoogle from "../MacalyGoogle.js";
import type * as ResendOTP from "../ResendOTP.js";
import type * as auth from "../auth.js";
import type * as authUsers from "../authUsers.js";
import type * as googleAuth from "../googleAuth.js";
import type * as http from "../http.js";
import type * as macaly from "../macaly.js";
import type * as wird from "../wird.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  MacalyGoogle: typeof MacalyGoogle;
  ResendOTP: typeof ResendOTP;
  auth: typeof auth;
  authUsers: typeof authUsers;
  googleAuth: typeof googleAuth;
  http: typeof http;
  macaly: typeof macaly;
  wird: typeof wird;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
