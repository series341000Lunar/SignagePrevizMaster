'use strict';

window.LUUX_LIVE_LINK_CONFIG = Object.freeze({
  protocol: 'luux-live-link',
  protocolVersion: 1,
  endpoint: 'ws://localhost:34100',
  chunkSizeBytes: 2097152,
  backpressureHighWaterMarkBytes: 8388608,
  reconnectDelayMs: 1500,
  ackTimeoutMs: 120000,
  maxFrameBytes: 536870912
});
