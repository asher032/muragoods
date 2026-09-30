import { connectMongoose } from '@/app/lib/db/clusters';

/**
 * Mongoose connection for the SITE's own models (users, orders, content).
 *
 * This module is now a thin delegate. The connection string is resolved
 * inside `@/app/lib/db/clusters`, which is the only place in the app that
 * reads a Mongo URI — so no component, route or log line can pick it up by
 * accident, and "which cluster is the site on" is a single question with a
 * single answer in the codebase.
 *
 * The site is bound to the `muragoods` cluster because the site owns canonical
 * identity. Bot data is read through the same clusters module with the raw
 * driver, which is what keeps the two pools genuinely separate rather than
 * one connection string quietly serving both.
 */
export default function dbConnect() {
  return connectMongoose('muragoods');
}
