import { fullSync, incrementalSync } from '../lib/sync';

async function main() {
  const args = process.argv.slice(2);
  const syncType = args[0] || 'full';

  try {
    if (syncType === 'full') {
      await fullSync();
    } else if (syncType === 'incremental') {
      // Use last hour as default for incremental sync
      const lastSyncTime = new Date(Date.now() - 60 * 60 * 1000);
      await incrementalSync(lastSyncTime);
    } else {
      console.error('Invalid sync type. Use "full" or "incremental"');
      process.exit(1);
    }
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main(); 