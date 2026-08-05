import type { Migration } from './index.js';

/**
 * Per-agent-group pip package list on `container_configs`, parallel to
 * `packages_apt` / `packages_npm`. Empty-array default matches those columns
 * so existing rows behave as "no pip packages" without a backfill.
 */
export const migration022: Migration = {
  version: 22,
  name: 'container-config-packages-pip',
  up(db) {
    db.exec(`ALTER TABLE container_configs ADD COLUMN packages_pip TEXT NOT NULL DEFAULT '[]';`);
  },
};
