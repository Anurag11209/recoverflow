import { logger } from '@recoverflow/shared';
import {
  processPaymentEvent,
  runDueAttempt,
  type DueAttempt,
  type ProcessDeps,
  type ProcessOutcome,
  type RunDueAttemptDeps,
} from '@recoverflow/recovery-engine';
import type { WorkerConfig } from './config';
import type { WorkerServices } from './deps';
import type { ClaimableRow } from './adapters/processing-store';

export interface Worker {
  /** Fill available slots once from the claimable queue, then await them. */
  runOnce(): Promise<void>;
  /** Process claimable rows until the queue is drained and nothing is in flight. */
  drainToCompletion(maxTicks?: number): Promise<void>;
  /** Start the continuous poll loop (non-blocking). */
  start(): void;
  /** Stop claiming, drain in-flight work (bounded by shutdownTimeoutMs), resolve. */
  stop(): Promise<void>;
}

export function createWorker(opts: { services: WorkerServices; config: WorkerConfig }): Worker {
  const { services, config } = opts;
  const log = logger.child({ component: 'worker' });

  const inFlight = new Set<Promise<void>>();
  const inFlightIds = new Set<string>();
  let shuttingDown = false;
  let loopDone: Promise<void> | null = null;
  let wakeSleep: (() => void) | null = null;

  function buildDeps(childLog: ProcessDeps['logger']): ProcessDeps {
    return {
      processingStore: services.processingStore,
      recoveryStore: services.recoveryStore,
      messageStore: services.messageStore,
      messagingProvider: services.messagingProvider,
      messagingProviderName: services.messagingProviderName,
      tokenStore: services.tokenStore,
      clock: services.clock,
      buildPaymentUpdateUrl: services.buildPaymentUpdateUrl,
      logger: childLog,
    };
  }

  function buildLadderDeps(childLog: RunDueAttemptDeps['logger']): RunDueAttemptDeps {
    return {
      recoveryStore: services.recoveryStore,
      messageStore: services.messageStore,
      messagingProvider: services.messagingProvider,
      messagingProviderName: services.messagingProviderName,
      tokenStore: services.tokenStore,
      clock: services.clock,
      buildPaymentUpdateUrl: services.buildPaymentUpdateUrl,
      logger: childLog,
    };
  }

  /** Track a fire-and-forget unit of work against the shared concurrency budget. */
  function track(run: Promise<void>): void {
    const tracked = run.finally(() => {
      inFlight.delete(tracked);
    });
    inFlight.add(tracked);
  }

  function launchEvent(row: ClaimableRow): void {
    const key = `evt:${row.paymentEventId}`;
    inFlightIds.add(key);
    // Child logger => every line for this event carries merchant + event ids,
    // including processPaymentEvent's own internal logs (it uses this logger).
    const childLog = log.child({ paymentEventId: row.paymentEventId, merchantId: row.merchantId });
    const startedAt = Date.now();
    track(
      (async () => {
        try {
          const outcome: ProcessOutcome = await processPaymentEvent(
            buildDeps(childLog),
            row.paymentEventId,
          );
          const durationMs = Date.now() - startedAt;
          if (outcome.status === 'SKIPPED') {
            childLog.info(
              { event: 'skipped', reason: outcome.reason, durationMs },
              'event skipped',
            );
          } else if (outcome.status === 'FAILED') {
            childLog.error(
              { event: 'failed', eventType: outcome.eventType, err: outcome.error, durationMs },
              'event failed (will retry or dead-letter)',
            );
          } else {
            childLog.info(
              { event: 'done', eventType: outcome.eventType, durationMs },
              'event processed',
            );
          }
        } catch (err) {
          // processPaymentEvent captures handler errors as state and does not throw;
          // this guards against an unexpected store/infra error so one bad row can
          // never kill the loop.
          childLog.error(
            { event: 'worker_error', err: err instanceof Error ? err.message : String(err) },
            'unexpected error processing event',
          );
        } finally {
          inFlightIds.delete(key);
        }
      })(),
    );
  }

  function launchAttempt(due: DueAttempt): void {
    const key = `att:${due.attempt.id}`;
    inFlightIds.add(key);
    const childLog = log.child({
      recoveryCaseId: due.case.id,
      merchantId: due.case.merchantId,
      attemptNumber: due.attempt.attemptNumber,
      recoveryAttemptId: due.attempt.id,
    });
    const startedAt = Date.now();
    track(
      (async () => {
        try {
          const outcome = await runDueAttempt(buildLadderDeps(childLog), due);
          childLog.info(
            { event: `ladder_${outcome.status}`, durationMs: Date.now() - startedAt },
            'retry ladder attempt handled',
          );
        } catch (err) {
          childLog.error(
            { event: 'ladder_error', err: err instanceof Error ? err.message : String(err) },
            'unexpected error executing retry attempt',
          );
        } finally {
          inFlightIds.delete(key);
        }
      })(),
    );
  }

  async function fillSlots(): Promise<number> {
    if (shuttingDown) return 0;
    let launched = 0;

    // 1) Failed-payment events awaiting first processing.
    let slots = config.concurrency - inFlight.size;
    if (slots > 0) {
      const rows = await services.processingStore.listClaimable(slots);
      for (const row of rows) {
        if (inFlight.size >= config.concurrency) break;
        if (inFlightIds.has(`evt:${row.paymentEventId}`)) continue; // already running here
        launchEvent(row);
        launched += 1;
      }
    }

    // 2) Retry-ladder attempts that are now due (status, scheduledAt index).
    slots = config.concurrency - inFlight.size;
    if (slots > 0) {
      const due = await services.recoveryStore.listDueAttempts(services.clock.now(), slots);
      for (const d of due) {
        if (inFlight.size >= config.concurrency) break;
        if (inFlightIds.has(`att:${d.attempt.id}`)) continue; // already running here
        launchAttempt(d);
        launched += 1;
      }
    }

    return launched;
  }

  async function runOnce(): Promise<void> {
    await fillSlots();
    await Promise.allSettled([...inFlight]);
  }

  async function drainToCompletion(maxTicks = 10_000): Promise<void> {
    let ticks = 0;
    while (ticks < maxTicks) {
      ticks += 1;
      const launched = await fillSlots();
      if (inFlight.size === 0) {
        if (launched === 0) break; // nothing running and nothing left to claim
        continue;
      }
      // Wait for at least one slot to free, then re-poll (a row may have become
      // eligible, e.g. a zero-backoff retry).
      await Promise.race([...inFlight]);
    }
    await Promise.allSettled([...inFlight]);
  }

  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (shuttingDown) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        wakeSleep = null;
        resolve();
      }, ms);
      wakeSleep = () => {
        clearTimeout(timer);
        wakeSleep = null;
        resolve();
      };
    });
  }

  async function loop(): Promise<void> {
    log.info(
      {
        event: 'worker_started',
        concurrency: config.concurrency,
        pollIntervalMs: config.pollIntervalMs,
        maxAttempts: config.maxAttempts,
      },
      'worker started',
    );
    while (!shuttingDown) {
      try {
        await fillSlots();
      } catch (err) {
        log.error(
          { event: 'poll_error', err: err instanceof Error ? err.message : String(err) },
          'poll failed; will retry next interval',
        );
      }
      await interruptibleSleep(config.pollIntervalMs);
    }
  }

  return {
    runOnce,
    drainToCompletion,
    start(): void {
      shuttingDown = false;
      loopDone = loop();
    },
    async stop(): Promise<void> {
      log.info(
        { event: 'worker_stopping', inFlight: inFlight.size },
        'shutdown: stop claiming, drain in-flight',
      );
      shuttingDown = true;
      if (wakeSleep) wakeSleep(); // interrupt the poll sleep so the loop exits promptly
      if (loopDone) await loopDone;
      const drained = Promise.allSettled([...inFlight]).then(() => 'drained' as const);
      const timedOut = new Promise<'timeout'>((r) =>
        setTimeout(() => r('timeout'), config.shutdownTimeoutMs),
      );
      const result = await Promise.race([drained, timedOut]);
      if (result === 'timeout') {
        log.error(
          { event: 'shutdown_timeout', inFlight: inFlight.size },
          'drain exceeded shutdownTimeoutMs; exiting with in-flight work',
        );
      } else {
        log.info({ event: 'worker_stopped' }, 'drained cleanly');
      }
    },
  };
}
