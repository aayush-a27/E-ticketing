import { expireHolds } from '../modules/seat-holds/seatHolds.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_INTERVAL_MS = 30_000;

let timer = null;
let running = false;

/**
 * Returns lapsed holds to the pool.
 *
 * This is housekeeping, not the mechanism: a seat whose hold has expired is
 * already claimable, because the acquisition filter reclaims it on sight. The
 * job exists so the seat map reads correctly and inventory counts stay honest
 * between claims.
 *
 * Safe to run on every instance — each release is guarded by the hold's id and
 * state — so it needs no distributed lock. The in-process guard below only
 * stops one instance overlapping with itself on a slow pass.
 */
export function startExpireHoldsJob({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (timer) return timer;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireHolds();
    } catch (error) {
      logger.error({ err: error }, 'Seat hold expiry pass failed');
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  // Must not keep the process alive on shutdown.
  timer.unref?.();

  logger.info({ intervalMs }, 'Seat hold expiry job started');
  return timer;
}

export function stopExpireHoldsJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
