'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
  useTheme,
} from '@dashdb/ui';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { downloadBlob, downloadText } from '@/lib/download';
import { renderDiagramSvg, type DiagramImageOptions } from '../export/diagram-svg';
import { diagramToPng } from '../export/image-export';
import { fileSlug } from '../formats';
import { useEditor } from '../store';

type ImageFormat = 'png' | 'svg';

export function ExportImageDialog() {
  const open = useEditor((s) => s.dialog === 'exportImage');
  const closeDialog = useEditor((s) => s.closeDialog);
  const doc = useEditor((s) => s.doc);
  const { resolvedTheme } = useTheme();
  const [format, setFormat] = useState<ImageFormat>('png');
  const [theme, setTheme] = useState<DiagramImageOptions['theme'] | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState(false);
  const ids = { format: useId(), theme: useId(), transparent: useId(), watermark: useId() };

  const colors = theme ?? (resolvedTheme === 'dark' ? 'dark' : 'light');
  const image = useMemo(
    () =>
      open && doc
        ? renderDiagramSvg(doc.schema, doc.layout, { theme: colors, transparent, watermark })
        : null,
    [open, doc, colors, transparent, watermark],
  );

  // The preview is an <img>: an SVG shown that way cannot run scripts or load anything.
  const previewUrl = useMemo(
    () => (image ? URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml' })) : null),
    [image],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const download = async () => {
    if (!image || !doc) return;
    const name = `${fileSlug(doc.name)}.${format}`;
    if (format === 'svg') {
      downloadText(name, image.svg, 'image/svg+xml');
      return;
    }
    setBusy(true);
    try {
      downloadBlob(name, await diagramToPng(image));
    } catch {
      toast.error('Could not create the PNG. Try SVG instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export diagram</DialogTitle>
          <DialogDescription>Download the diagram as a PNG or SVG image.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <div
            className="flex h-72 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(var(--highlight)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
            data-testid="image-preview"
          >
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
              <img src={previewUrl} alt="Diagram preview" className="max-h-full max-w-full" />
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={ids.format} className="text-sm font-medium">
                Format
              </label>
              <Select
                value={format}
                onValueChange={(value) => {
                  if (value === 'png' || value === 'svg') setFormat(value);
                }}
              >
                <SelectTrigger id={ids.format} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (2× resolution)</SelectItem>
                  <SelectItem value="svg">SVG (vector)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.theme} className="text-sm font-medium">
                Colors
              </label>
              <Select
                value={colors}
                onValueChange={(value) => {
                  if (value === 'light' || value === 'dark') setTheme(value);
                }}
              >
                <SelectTrigger id={ids.theme} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={ids.transparent} className="text-sm">
                Transparent background
              </label>
              <Switch id={ids.transparent} checked={transparent} onCheckedChange={setTransparent} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={ids.watermark} className="text-sm">
                DashDB watermark
              </label>
              <Switch id={ids.watermark} checked={watermark} onCheckedChange={setWatermark} />
            </div>
            {image && (
              <p className="text-xs text-text-muted">
                {image.width} × {image.height} px
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button disabled={!image || busy} onClick={() => void download()}>
            <DownloadIcon aria-hidden /> Download {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
