/**
 * Database seed. Intentionally contains no sample leads, users or invented content.
 * It imports the website's existing built-in content into the CMS as drafts (idempotent).
 * Create the first Super Admin separately with: npm run admin:create
 */
import "../scripts/db/import-content";
