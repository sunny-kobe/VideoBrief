import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeSignalMediaUrls, stripSignalMarkup } from '../src/dailySignalServer';

test('removes RSS markup before a summary enters a brief', () => {
  assert.equal(stripSignalMarkup('<img src="hero.png"><p>Gemini Omni makes video creation easier.</p>'), 'Gemini Omni makes video creation easier.');
});

test('keeps the largest variant of one topical image', () => {
  const values = dedupeSignalMediaUrls([
    'https://storage.example.com/hero.max-600x600.format-webp.webp',
    'https://storage.example.com/hero.width-1300.png',
    'https://storage.example.com/second.width-800.png',
  ]);
  assert.deepEqual(values, [
    'https://storage.example.com/hero.width-1300.png',
    'https://storage.example.com/second.width-800.png',
  ]);
});

