import {
  createAppState,
  initMonkeyCache,
  setupWebSocket,
  setupEventListeners,
  startRenderLoop,
} from './utils.js';

const state = createAppState();
initMonkeyCache(state);
setupWebSocket(state);
setupEventListeners(state);
startRenderLoop(state);

