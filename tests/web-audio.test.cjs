const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  clampWebVolumeBoost,
  connectWebAudioVolumeBoost,
} = require('../.test-build/src/utils/webAudioVolumeBoost.js');

test('web volume boost clamps to 100%-200% and routes through a compressor', () => {
  assert.equal(clampWebVolumeBoost(100), 100);
  assert.equal(clampWebVolumeBoost(157), 157);
  assert.equal(clampWebVolumeBoost(250), 200);
  assert.equal(clampWebVolumeBoost(Number.NaN), 100);

  const connections = [];
  const makeNode = () => ({
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    gain: { value: 1 },
    connect(destination) { connections.push(destination); },
    disconnect() {},
  });
  const compressor = makeNode();
  const context = {
    destination: { name: 'destination' },
    createGain: makeNode,
    createDynamicsCompressor: () => compressor,
    createMediaElementSource: () => makeNode(),
  };
  const graph = connectWebAudioVolumeBoost({}, context);

  assert.deepEqual(compressor, {
    threshold: { value: -3 },
    knee: { value: 0 },
    ratio: { value: 20 },
    attack: { value: 0.003 },
    release: { value: 0.25 },
    gain: { value: 1 },
    connect: compressor.connect,
    disconnect: compressor.disconnect,
  });
  assert.equal(connections.length, 3);
  assert.equal(connections[2], context.destination);
  assert.equal(graph.gain.gain.value, 1);
  graph.disconnect();
});