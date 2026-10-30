import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  optimizeAndDedupAudioTasks,
  buildFolderMaps,
} from '../src/main/modules/asmr-core/audio-download-utils.js';

function parseAudioNodesFromTree(tree, currentPath = '') {
  const filesData = [];
  if (Array.isArray(tree)) {
    tree.forEach((fileName) => {
      filesData.push({
        folderPath: currentPath,
        fileName,
        downloadUrl: 'https://example.com/' + encodeURIComponent(fileName),
      });
    });
  } else if (typeof tree === 'object' && tree !== null) {
    for (const [key, val] of Object.entries(tree)) {
      const nextPath = currentPath ? currentPath + '/' + key : key;
      filesData.push(...parseAudioNodesFromTree(val, nextPath));
    }
  }
  return filesData;
}

const DATASET_PATH =
  process.env.DATASET_PATH || path.resolve('scripts/tracks_dataset.jsonl');
const BASELINE_SNAPSHOT_PATH = path.resolve('scripts/baseline-3000-snapshot.json');

const REVERSE_PATTERN = /反転|入替|reverse|左右逆|lr|rl|inversion/i;

export async function generateBaselineSnapshot() {
  const stream = fs.createReadStream(DATASET_PATH, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let nonReverseSampleCount = 0;
  const snapshot = {};

  for await (const line of rl) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    const filesData = parseAudioNodesFromTree(data.tree);
    const hasReverse = filesData.some((f) =>
      REVERSE_PATTERN.test(f.folderPath + '/' + f.fileName)
    );

    if (!hasReverse && nonReverseSampleCount < 3000) {
      nonReverseSampleCount++;
      const { folderMap, urlMap } = buildFolderMaps(filesData);
      const tasks = optimizeAndDedupAudioTasks({
        workCode: data.rj,
        folderMap,
        urlMap,
        filterVideoFormats: true,
      });
      snapshot[data.rj] = tasks.map((t) => t.outPath);
    }
  }

  fs.writeFileSync(BASELINE_SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf-8');
  console.log(`Baseline snapshot saved to ${BASELINE_SNAPSHOT_PATH} (${nonReverseSampleCount} works)`);
}

export async function verifyRegressionAgainstBaseline() {
  if (!fs.existsSync(BASELINE_SNAPSHOT_PATH)) {
    console.log('Generating baseline snapshot first...');
    await generateBaselineSnapshot();
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_SNAPSHOT_PATH, 'utf-8'));
  const stream = fs.createReadStream(DATASET_PATH, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let diffCount = 0;
  let testedCount = 0;
  const diffs = [];

  let reverseTotal = 0;
  let reverseLeakedCount = 0;
  let reverseCleanCount = 0;
  let reverseOrphanCount = 0;

  for await (const line of rl) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    const filesData = parseAudioNodesFromTree(data.tree);
    const hasReverse = filesData.some((f) =>
      REVERSE_PATTERN.test(f.folderPath + '/' + f.fileName)
    );

    const { folderMap, urlMap } = buildFolderMaps(filesData);
    const tasks = optimizeAndDedupAudioTasks({
      workCode: data.rj,
      folderMap,
      urlMap,
      filterVideoFormats: true,
    });
    const currentOutputs = tasks.map((t) => t.outPath);

    if (baseline[data.rj]) {
      testedCount++;
      const expectedOutputs = baseline[data.rj];
      const match =
        expectedOutputs.length === currentOutputs.length &&
        expectedOutputs.every((val, idx) => val === currentOutputs[idx]);

      if (!match) {
        diffCount++;
        if (diffs.length < 5) {
          diffs.push({
            rj: data.rj,
            expected: expectedOutputs,
            current: currentOutputs,
          });
        }
      }
    }

    if (hasReverse) {
      reverseTotal++;
      const hasRevTask = tasks.some((t) =>
        /反転|入替|reverse|左右逆|lr逆/i.test(t.outPath)
      );
      const hasNormTask = tasks.some(
        (t) => !/反転|入替|reverse|左右逆|lr逆/i.test(t.outPath)
      );

      if (hasRevTask && hasNormTask) {
        reverseLeakedCount++;
      } else if (hasRevTask && !hasNormTask) {
        reverseOrphanCount++;
      } else {
        reverseCleanCount++;
      }
    }
  }

  console.log('=== REGRESSION VERIFICATION RESULTS ===');
  console.log(`Non-reverse baseline sample tested: ${testedCount}`);
  console.log(`Non-reverse differences (must be 0): ${diffCount}`);
  if (diffCount > 0) {
    console.error('CRITICAL: Baseline regression detected!', JSON.stringify(diffs, null, 2));
  } else {
    console.log('SUCCESS: 100% match with baseline! No regressions on normal works.');
  }

  console.log('\n=== REVERSE WORKS FILTERING METRICS ===');
  console.log(`Total works with reverse: ${reverseTotal}`);
  console.log(`Cleanly filtered (normal only): ${reverseCleanCount}`);
  console.log(`Orphan reverse retained: ${reverseOrphanCount}`);
  console.log(`Leaked reverse count: ${reverseLeakedCount}`);

  return { diffCount, reverseLeakedCount, reverseCleanCount };
}

if (process.argv[1]?.endsWith('verify-reversal-regression.js')) {
  if (process.argv.includes('--generate-baseline')) {
    generateBaselineSnapshot();
  } else {
    verifyRegressionAgainstBaseline();
  }
}
