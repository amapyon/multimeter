import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, exportSessionCsv } from '@libreble/multimeter-recorder';
import { copyPng, exportCsv, exportPng } from './exporters';

vi.mock('@libreble/multimeter-recorder', () => ({
  exportSessionCsv: vi.fn(),
  downloadBlob: vi.fn(),
  slug: (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
}));

class FakeClipboardItem {
  constructor(readonly data: Record<string, Promise<Blob>>) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('chart exporters', () => {
  it('keeps the existing CSV export binding', () => {
    expect(exportCsv).toBe(exportSessionCsv);
  });

  it('downloads a generated PNG with a safe filename', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    await exportPng({ toPng: vi.fn().mockResolvedValue(png) }, 'Demo chart');
    expect(downloadBlob).toHaveBeenCalledWith(png, 'demo-chart.png');
  });

  it('does not download anything when the chart is missing', async () => {
    await exportPng(null, 'Demo chart');
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('does not download anything when the PNG cannot be generated', async () => {
    await exportPng({ toPng: vi.fn().mockResolvedValue(null) }, 'Demo chart');
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('reports when the chart ref is missing', async () => {
    await expect(copyPng(null)).rejects.toThrow('Chart is not ready');
  });

  it('reports when the browser clipboard image API is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    vi.stubGlobal('ClipboardItem', undefined);
    await expect(copyPng({ toPng: vi.fn() })).rejects.toThrow('PNG clipboard access');
  });

  it('copies the PNG using ClipboardItem and clipboard.write', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const write = vi.fn(async (items: FakeClipboardItem[]) => {
      expect(items).toHaveLength(1);
      expect(await items[0]!.data['image/png']).toBe(png);
    });
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    const toPng = vi.fn().mockResolvedValue(png);

    await copyPng({ toPng });
    expect(toPng).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
  });

  it('propagates a PNG-generation error to the user', async () => {
    const write = vi.fn(async (items: FakeClipboardItem[]) => {
      await items[0]!.data['image/png'];
    });
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);

    await expect(copyPng({ toPng: vi.fn().mockResolvedValue(null) })).rejects.toThrow(
      'Failed to create chart PNG',
    );
  });
});
