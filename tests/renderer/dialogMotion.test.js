import assert from 'node:assert/strict';
import test from 'node:test';
import { createDialogMotion } from '../../src/renderer/infrastructure/dialogMotion.js';

function fixture(reduced = false) {
  const jobs = [];
  const listeners = new Set();
  const media = { matches: reduced, addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) };
  const dialog = { open: false, dataset: {}, shows: 0, closes: 0,
    showModal() { this.open = true; this.shows++; },
    close() { this.open = false; this.closes++; },
    animate(frames, timing) {
      let finish, cancel;
      const finished = new Promise((resolve, reject) => { finish = resolve; cancel = () => reject(new Error('cancelled')); });
      const animation = { frames, timing, finished, finish, cancel };
      jobs.push(animation);
      return animation;
    },
  };
  const motion = createDialogMotion(() => dialog, {
    media, readStyle: () => ({ opacity: '0.6', transform: 'matrix(1, 0, 0, 1, 0, 4)', getPropertyValue: () => '' }),
  });
  return { dialog, motion, jobs, media, listeners };
}

test('dialog opens immediately and stays interactive while its entrance is animated', async () => {
  const { dialog, motion, jobs } = fixture();
  const result = motion.open();
  assert.equal(dialog.open, true);
  assert.equal(dialog.shows, 1);
  assert.equal(dialog.dataset.motionState, 'entering');
  assert.ok(jobs[0].timing.duration > 0);
  jobs[0].finish();
  assert.equal(await result, true);
  assert.equal(dialog.dataset.motionState, undefined);
  motion.dispose();
});

test('dialog stays mounted until its exit finishes and duplicate closes share the operation', async () => {
  const { dialog, motion, jobs } = fixture();
  const entrance = motion.open(); jobs[0].finish(); await entrance;
  const first = motion.close();
  assert.equal(motion.close(), first);
  assert.equal(dialog.open, true);
  assert.equal(dialog.dataset.motionState, 'leaving');
  assert.ok(jobs[1].timing.duration < jobs[0].timing.duration);
  jobs[1].finish();
  assert.equal(await first, true);
  assert.equal(dialog.open, false);
  assert.equal(dialog.closes, 1);
  motion.dispose();
});

test('reopening interrupts an exit from the current frame and stale completion cannot close it', async () => {
  const { dialog, motion, jobs } = fixture();
  const entrance = motion.open(); jobs[0].finish(); await entrance;
  const leaving = motion.close();
  const reopening = motion.open();
  assert.equal(await leaving, false);
  assert.equal(jobs[2].frames[0].opacity, '0.6');
  assert.equal(jobs[2].frames[0].transform, 'matrix(1, 0, 0, 1, 0, 4)');
  jobs[2].finish();
  assert.equal(await reopening, true);
  assert.equal(dialog.open, true);
  assert.equal(dialog.shows, 1);
  assert.equal(dialog.closes, 0);
  motion.dispose();
});

test('unmount cancels animation and closes immediately without a late close or listener leak', async () => {
  const { dialog, motion, jobs, listeners } = fixture();
  const pending = motion.open();
  assert.equal(listeners.size, 1);
  motion.dispose();
  assert.equal(await pending, false);
  assert.equal(dialog.open, false);
  assert.equal(dialog.closes, 1);
  assert.equal(listeners.size, 0);
  jobs[0].finish();
  assert.equal(await motion.open(), false);
  assert.equal(dialog.closes, 1);
});

test('reduced motion opens and closes without animation or timing delays', async () => {
  const { dialog, motion, jobs } = fixture(true);
  assert.equal(await motion.open(), true);
  assert.equal(dialog.open, true);
  assert.equal(await motion.close(), true);
  assert.equal(dialog.open, false);
  assert.equal(jobs.length, 0);
  motion.dispose();
});

test('enabling reduced motion during an animation settles its final state', async () => {
  const { dialog, motion, media, listeners } = fixture();
  const opening = motion.open();
  media.matches = true;
  for (const listener of listeners) listener({ matches: true });
  assert.equal(await opening, true);
  assert.equal(dialog.open, true);
  assert.equal(await motion.close(), true);
  assert.equal(dialog.open, false);
  motion.dispose();
});
