import assert from 'node:assert/strict';
import test from 'node:test';

import { readAiConfig } from '../src/aiConfig';
import { aiRequestInputHash } from '../src/aiProvider';

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('unconfigured project AI uses the upgraded model and balanced reasoning', () => {
  withEnvironment({ OPENAI_MODEL: undefined, OPENAI_REASONING_EFFORT: undefined }, () => {
    const config = readAiConfig();
    assert.equal(config.model, 'gpt-6.1-sol');
    assert.equal('reasoningEffort' in config && config.reasoningEffort, 'medium');
  });
});

test('changing reasoning effort invalidates a previous model-response cache', () => {
  withEnvironment({ OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_REASONING_EFFORT: 'low' }, () => {
    const low = aiRequestInputHash('narrative', '同一份创作简报');
    process.env.OPENAI_REASONING_EFFORT = 'high';
    const high = aiRequestInputHash('narrative', '同一份创作简报');
    assert.notEqual(low, high);
    assert.equal(aiRequestInputHash('narrative', '同一份创作简报'), high);
  });
});

test('explicit project model and reasoning overrides are preserved', () => {
  withEnvironment({ OPENAI_MODEL: ' custom-model ', OPENAI_REASONING_EFFORT: ' high ' }, () => {
    const config = readAiConfig();
    assert.equal(config.model, 'custom-model');
    assert.equal('reasoningEffort' in config && config.reasoningEffort, 'high');
  });
});

test('unsupported reasoning settings fail before an API request', () => {
  withEnvironment({ OPENAI_REASONING_EFFORT: 'ultra' }, () => {
    assert.throws(() => readAiConfig(), /OPENAI_REASONING_EFFORT/);
  });
});
