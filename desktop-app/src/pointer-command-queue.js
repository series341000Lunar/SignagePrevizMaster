export class LatestWinsPointerQueue {
  constructor(send) {
    if (typeof send !== 'function') throw new TypeError('A pointer send function is required.');
    this.send = send;
    this.active = null;
    this.pending = null;
    this.replacements = 0;
  }

  request(command) {
    if (!command || !Number.isSafeInteger(command.requestId) || command.requestId <= 0) {
      throw new TypeError('Pointer commands require a positive integer requestId.');
    }
    if (this.active) {
      this.pending = command;
      this.replacements += 1;
      return { sent: false, pending: true };
    }
    return this.#dispatch(command);
  }

  settle(response) {
    if (!this.active || response?.requestId !== this.active.requestId) return false;
    this.active = null;
    const pending = this.pending;
    this.pending = null;
    if (pending) this.#dispatch(pending);
    return true;
  }

  reset() {
    this.active = null;
    this.pending = null;
  }

  snapshot() {
    return {
      activeRequestId: this.active?.requestId || null,
      pendingRequestId: this.pending?.requestId || null,
      replacements: this.replacements
    };
  }

  #dispatch(command) {
    if (!this.send(command)) return { sent: false, pending: false };
    this.active = command;
    return { sent: true, pending: false };
  }
}
