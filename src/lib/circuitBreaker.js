// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Circuit Breaker v1.0
//  Prevents cascading failures and protects the bot from bad states
// ════════════════════════════════════════════════════════════════════════════

const logger = require('./logger');

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.timeoutMs = options.timeoutMs || 60000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
    
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    
    this.name = options.name || 'default';
    this.logger = options.logger || logger;
  }
  
  // Execute a protected function
  async execute(fn) {
    if (this.isOpen()) {
      throw new Error(`Circuit breaker "${this.name}" is OPEN`);
    }
    
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  // Check if circuit is open
  isOpen() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      const elapsed = now - this.lastFailureTime;
      
      // Auto-recover after timeout
      if (elapsed > this.timeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        this.logger.warn(`Circuit breaker "${this.name}" is now HALF_OPEN`);
        return false;
      }
      
      return true;
    }
    
    return false;
  }
  
  // Record a successful execution
  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      this.successCount++;
      
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.info(`Circuit breaker "${this.name}" is now CLOSED`);
      }
    } else {
      this.failureCount = 0; // Reset failures on success
    }
  }
  
  // Record a failure
  recordFailure() {
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.lastFailureTime = Date.now();
      this.halfOpenAttempts = 0;
      this.logger.warn(`Circuit breaker "${this.name}" is now OPEN (failed in half-open)`);
      return;
    }
    
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(`Circuit breaker "${this.name}" is now OPEN after ${this.failureCount} failures`);
    }
  }
  
  // Reset the circuit breaker
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.logger.info(`Circuit breaker "${this.name}" reset`);
  }
  
  // Get the current status
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.isOpen(),
    };
  }
}

// Create specialized circuit breakers
const circuitBreakers = {
  metaAPI: new CircuitBreaker({
    name: 'metaAPI',
    failureThreshold: 3,
    timeoutMs: 120000,
    halfOpenMaxAttempts: 2,
  }),
  
  priceFeed: new CircuitBreaker({
    name: 'priceFeed',
    failureThreshold: 5,
    timeoutMs: 60000,
    halfOpenMaxAttempts: 3,
  }),
  
  database: new CircuitBreaker({
    name: 'database',
    failureThreshold: 3,
    timeoutMs: 30000,
    halfOpenMaxAttempts: 2,
  }),
  
  telegram: new CircuitBreaker({
    name: 'telegram',
    failureThreshold: 10,
    timeoutMs: 300000, // 5 minutes
    halfOpenMaxAttempts: 2,
  }),
};

module.exports = {
  CircuitBreaker,
  circuitBreakers,
};
