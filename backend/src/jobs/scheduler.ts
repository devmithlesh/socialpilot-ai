import cron, { ScheduledTask } from 'node-cron';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { publishDueScheduledPosts } from '../services/scheduling.service';
import { generateDailyDraftsForOptedInUsers } from '../services/daily-post.service';

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

  if (cron.validate(config.DAILY_POST_CRON)) {
    tasks.push(
      cron.schedule(config.DAILY_POST_CRON, guarded('daily-drafts', generateDailyDraftsForOptedInUsers))
    );
  } else {
    logger.warn('DAILY_POST_CRON is invalid; daily drafts are disabled', { value: config.DAILY_POST_CRON });
  }

  logger.info('Schedulers started', { dailyPostCron: config.DAILY_POST_CRON });
  return () => tasks.forEach((task) => task.stop());
}
