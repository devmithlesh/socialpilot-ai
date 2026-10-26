import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../config/logger';
import { publishDueScheduledPosts } from '../services/scheduling.service';

/** Wraps a job so overlapping runs are skipped and failures never crash the process. */
function guarded(name: string, job: () => Promise<void>): () => void {
  let running = false;
  return () => {
    if (running) return;
    running = true;
    job()
      .catch((err: Error) => logger.error(`Scheduled job failed: ${name}`, { error: err.message }))
      .finally(() => {
        running = false;
      });
  };
}

/** Starts background jobs. Returns a function that stops them for graceful shutdown. */
export function startSchedulers(): () => void {
  const tasks: ScheduledTask[] = [
    cron.schedule('* * * * *', guarded('publish-due-posts', publishDueScheduledPosts)),
  ];

  logger.info('Schedulers started');
  return () => tasks.forEach((task) => task.stop());
}
