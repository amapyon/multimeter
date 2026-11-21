import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartToPng } from './chartPng';

type ChartOptions = Parameters<typeof chartToPng>[0];

function makeOptions(overrides: Partial<ChartOptions> = {}): ChartOptions {
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 800;
  chartCanvas.height = 300;
  return {
    chartCanvas,
    chartWidthCss: 800,
    dark: true,
    windowLabel: '1m',
    startSeconds: 1730000000,
    endSeconds: 1730000060,
    series: [{ label: 'V source', unit: 'V', color: '#34d399' }],
    ...overrides,
  };
}

describe('chartToPng', () => {
  let context: {
    fillRect: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    fillStyle: string;
    textBaseline: string;
    font: string;
  };
  let outputCanvas: HTMLCanvasElement | null;

  beforeEach(() => {
    outputCanvas = null;
    context = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      textBaseline: '',
      font: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      outputCanvas = this;
      callback(new Blob(['png'], { type: 'image/png' }));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns a PNG with the original graph canvas, including axes and ticks', async () => {
    const options = makeOptions();
    const png = await chartToPng(options);
    expect(png?.type).toBe('image/png');
    expect(context.drawImage).toHaveBeenCalledWith(options.chartCanvas, 0, expect.any(Number));
    expect(outputCanvas).not.toBeNull();
    expect((outputCanvas as HTMLCanvasElement | null)?.width).toBe(800);
    expect((outputCanvas as HTMLCanvasElement | null)?.height).toBeGreaterThan(300);
    expect(context.fillRect).toHaveBeenCalled();
  });

  it('writes the window, displayed time, name, and measurement unit', async () => {
    await chartToPng(makeOptions());
    const labels = context.fillText.mock.calls.map(args => String(args[0]));
    expect(labels).toContain('Multimeter chart');
    expect(labels).toContain('Window: 1m');
    expect(labels).toContain('V source (V)');
    expect(labels.some(label => label.startsWith('Captured:'))).toBe(true);
    expect(
      labels.some(label => label.startsWith('Displayed time:') && !label.includes('Unavailable')),
    ).toBe(true);
  });

  it('supports light theme, multiple series, and a truncation warning', async () => {
    await chartToPng(
      makeOptions({
        dark: false,
        truncated: true,
        series: [
          { label: 'Voltage', unit: 'V', color: '#059669' },
          { label: 'Current', unit: 'A', color: '#0284c7' },
        ],
      }),
    );
    const labels = context.fillText.mock.calls.map(args => String(args[0]));
    expect(labels).toContain('Voltage (V)');
    expect(labels).toContain('Current (A)');
    expect(labels.some(label => label.startsWith('Note: oldest live samples'))).toBe(true);
    expect(context.fillRect.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('shows unavailable range for missing timestamps and handles no series', async () => {
    await chartToPng(makeOptions({ series: [], startSeconds: Number.NaN, endSeconds: Number.NaN }));
    const labels = context.fillText.mock.calls.map(args => String(args[0]));
    expect(labels).toContain('Displayed time: Unavailable');
    expect(labels).toContain('No series');
  });

  it('scales the caption with the chart canvas pixel ratio', async () => {
    const chart = makeOptions({ chartWidthCss: 400 });
    await chartToPng(chart);
    expect((outputCanvas as HTMLCanvasElement | null)?.width).toBe(800);
    expect((outputCanvas as HTMLCanvasElement | null)?.height).toBeGreaterThan(400);
  });

  it('returns null if the canvas rendering context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    await expect(chartToPng(makeOptions())).resolves.toBeNull();
  });

  it('returns null when the browser cannot create a PNG blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null));
    await expect(chartToPng(makeOptions())).resolves.toBeNull();
  });
});
