import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK,
  buildDownloadPlanForWork,
  parseBatchDownloadInput,
  shouldManualReviewByTaskCount,
} from './audio-download-utils';

describe('asmr-core/audio-download-utils', () => {
  it('parses RJ/VJ/BJ codes, numeric ids, urls and multiple codes per line', () => {
    const result = parseBatchDownloadInput(`
RJ123456
https://asmr.one/work/VJ7654321/demo
BJ223344 RJ1234567
1234567
invalid-line
RJ123456
`);

    expect(result.workItems.map((item) => item.displayCode)).toEqual([
      'RJ123456',
      'VJ7654321',
      'BJ223344',
      'RJ1234567',
    ]);
    expect(result.invalidItems).toEqual([
      {
        input: 'invalid-line',
        reason: '未识别为 RJ/VJ/BJ 编号，或数字位数不在 6-8 位范围内',
      },
    ]);
  });

  it('keeps prefixed work code when building filtered tasks', () => {
    const { tasks, overflowPaths } = buildDownloadPlanForWork({
      workCode: 'VJ7654321',
      downloadDir: 'C:/Downloads',
      filesData: [
        {
          folderPath: '本編',
          fileName: 'track01.mp3',
          downloadUrl: 'https://example.com/track01.mp3',
        },
        {
          folderPath: '本編',
          fileName: 'track01.wav',
          downloadUrl: 'https://example.com/track01.wav',
        },
      ],
    });

    expect(overflowPaths).toEqual([]);
    expect(tasks).toEqual([
      {
        downloadUrl: 'https://example.com/track01.mp3',
        outPath: 'VJ7654321/本編/track01.mp3',
      },
    ]);
  });
  it('falls back to manual review when one work produces more than 20 tasks', () => {
    expect(
      shouldManualReviewByTaskCount(
        Array.from(
          { length: DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK + 1 },
          (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` }),
        ),
      ),
    ).toBe(true);

    expect(
      shouldManualReviewByTaskCount(
        Array.from(
          { length: DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK },
          (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` }),
        ),
      ),
    ).toBe(false);
  });

  it('supports a custom per-work threshold', () => {
    expect(
      shouldManualReviewByTaskCount(
        Array.from({ length: 4 }, (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` })),
        3,
      ),
    ).toBe(true);

    expect(
      shouldManualReviewByTaskCount(
        Array.from({ length: 3 }, (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` })),
        3,
      ),
    ).toBe(false);
  });

});
