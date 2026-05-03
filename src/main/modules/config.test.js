import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { electronMock, fsMock, loggerMock } = vi.hoisted(() => ({
  electronMock: {
    app: {
      getPath: vi.fn((key) => {
        if (key === 'userData') {
          return 'C:\\test-user-data';
        }

        if (key === 'documents') {
          return 'C:\\test-documents';
        }

        return `C:\\test-${key}`;
      }),
      emit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
    },
  },
  fsMock: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('electron', () => electronMock);
vi.mock('fs', () => ({
  default: fsMock,
}));
vi.mock('../utils/logger', () => ({
  createLogSender: () => loggerMock,
}));

describe('config.getDataDir', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('logs blank dataDir fallback only once', async () => {
    const defaultConfigPath = path.join('C:\\test-user-data', 'config.json');
    const defaultDataDir = path.join('C:\\test-user-data', 'data');

    fsMock.existsSync.mockImplementation(
      (filePath) => filePath === defaultConfigPath,
    );
    fsMock.readFileSync.mockImplementation((filePath) => {
      if (filePath === defaultConfigPath) {
        return JSON.stringify({
          paths: {
            dataDir: '   ',
          },
        });
      }

      throw new Error(`Unexpected read: ${filePath}`);
    });

    const { getDataDir } = await import('./config');

    expect(getDataDir()).toBe(defaultDataDir);
    expect(getDataDir()).toBe(defaultDataDir);
    expect(getDataDir()).toBe(defaultDataDir);

    expect(loggerMock.debug).toHaveBeenCalledTimes(1);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      `[getDataDir] config.paths.dataDir is empty, using default: ${defaultDataDir}`,
    );
  });
});
