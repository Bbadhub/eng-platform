/**
 * Lightweight Circuit Breaker Implementation (RES-002)
 *
 * Prevents cascading failures by stopping requests to failing services
 * and allowing them time to recover.
 *
 * States:
 *   - CLOSED: Normal operation, requests pass through
 *   - OPEN: Service is failing, requests fail fast
 *   - HALF_OPEN: Testing if service recovered
 *
 * Thresholds (configurable):
 *   - failureThreshold: 5 consecutive failures → OPEN
 *   - successThreshold: 2 consecutive successes → CLOSED
 *   - timeout: 30000ms (30s) request timeout
 *   - resetTimeout: 60000ms (60s) before trying HALF_OPEN
 */

const STATES = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Circuit is open (failing fast)
  HALF_OPEN: 'HALF_OPEN'  // Testing if service recovered
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = STATES.CLOSED;

    // Configurable thresholds
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30s request timeout
    this.resetTimeout = options.resetTimeout || 60000; // 60s before HALF_OPEN

    // Counters
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // Stats
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0,
      totalTimeouts: 0
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result of function or rejection if circuit is open
   */
  async execute(fn) {
    this.stats.totalRequests++;

    // Check circuit state
    if (this.state === STATES.OPEN) {
      // Check if we should try HALF_OPEN
      if (Date.now() >= this.nextAttemptTime) {
        this.state = STATES.HALF_OPEN;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN (testing recovery)`);
      } else {
        this.stats.totalRejected++;
        const waitTime = Math.ceil((this.nextAttemptTime - Date.now()) / 1000);
        throw new Error(`Circuit breaker OPEN for ${this.name} (retry in ${waitTime}s)`);
      }
    }

    try {
      // Execute with timeout
      const result = await this._executeWithTimeout(fn, this.timeout);
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async _executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => {
          this.stats.totalTimeouts++;
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout)
      )
    ]);
  }

  /**
   * Handle successful request
   */
  _onSuccess() {
    this.failures = 0;
    this.successes++;
    this.stats.totalSuccesses++;

    // If in HALF_OPEN and reached success threshold, close circuit
    if (this.state === STATES.HALF_OPEN && this.successes >= this.successThreshold) {
      this.state = STATES.CLOSED;
      this.successes = 0;
      console.log(`[CircuitBreaker:${this.name}] ✓ Circuit CLOSED (service recovered)`);
    }
  }

  /**
   * Handle failed request
   */
  _onFailure(error) {
    this.successes = 0;
    this.failures++;
    this.stats.totalFailures++;
    this.lastFailureTime = Date.now();

    // Log error details
    const errorMsg = error.message || error.toString();
    console.error(`[CircuitBreaker:${this.name}] Failure ${this.failures}/${this.failureThreshold}: ${errorMsg}`);

    // If reached failure threshold or in HALF_OPEN, open circuit
    if (this.failures >= this.failureThreshold || this.state === STATES.HALF_OPEN) {
      this.state = STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      this.failures = 0;

      const resetIn = Math.ceil(this.resetTimeout / 1000);
      console.error(`[CircuitBreaker:${this.name}] ⚠ Circuit OPEN (will retry in ${resetIn}s)`);
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      stats: this.stats,
      nextAttemptTime: this.nextAttemptTime,
      isHealthy: this.state === STATES.CLOSED
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
  }
}

module.exports = { CircuitBreaker, STATES };
