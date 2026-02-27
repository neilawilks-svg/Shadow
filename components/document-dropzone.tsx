"use client";

import { type DragEvent, useCallback, useMemo, useState } from "react";

interface UploadResult {
  count: number;
  documents?: Array<{ id: string }>;
}

interface DocumentDropzoneProps {
  onDocumentsChanged?: (newDocumentIds?: string[]) => void;
}

export function DocumentDropzone({ onDocumentsChanged }: DocumentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cleanupAi, setCleanupAi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const hint = useMemo(() => {
    if (isUploading) {
      return "Processing uploads and refreshing local vault...";
    }
    return "Drop agenda docs, notes, decks, PDFs, or ZIP bundles here.";
  }, [isUploading]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setError(null);
      setIsUploading(true);
      let total = 0;
      const newDocumentIds: string[] = [];

      try {
        for (const file of files) {
          const form = new FormData();
          form.set("file", file);
          form.set("cleanupAi", String(cleanupAi));

          const response = await fetch("/api/documents/upload", {
            method: "POST",
            body: form,
          });

          if (!response.ok) {
            throw new Error(`Upload failed for ${file.name}.`);
          }

          const payload = (await response.json()) as UploadResult;
          total += payload.count ?? 0;
          for (const record of payload.documents ?? []) {
            if (record?.id) {
              newDocumentIds.push(record.id);
            }
          }
        }

        setStatusMessage(`Uploaded ${files.length} file(s). ${total} document record(s) updated.`);
        onDocumentsChanged?.(newDocumentIds);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Upload failed.");
      } finally {
        setIsUploading(false);
      }
    },
    [cleanupAi, onDocumentsChanged],
  );

  const handleBootstrap = useCallback(async () => {
    setError(null);
    setIsUploading(true);

    try {
      const response = await fetch("/api/documents/ingest/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanupAi }),
      });

      if (!response.ok) {
        throw new Error("Unable to bootstrap from local new-files directory.");
      }

      const payload = (await response.json()) as UploadResult;
      setStatusMessage(`Bootstrap complete. ${payload.count ?? 0} document record(s) refreshed.`);
      onDocumentsChanged?.((payload.documents ?? []).map((item) => item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bootstrap ingest failed.");
    } finally {
      setIsUploading(false);
    }
  }, [cleanupAi, onDocumentsChanged]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = [...event.dataTransfer.files].filter((file) => file.size > 0);
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border border-dashed p-4 transition ${
          isDragging
            ? "border-[color:var(--accent-1)] bg-[color:var(--surface-2)]"
            : "border-[color:var(--line)] bg-[color:var(--field-bg)]"
        }`}
      >
        <p className="text-sm font-semibold text-[color:var(--ink-1)]">Document Intake</p>
        <p className="mb-3 text-xs text-[color:var(--ink-3)]">{hint}</p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-2 text-sm text-[color:var(--ink-2)]">
            Select files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                void uploadFiles(files);
                event.currentTarget.value = "";
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => void handleBootstrap()}
            className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-2 text-sm text-[color:var(--ink-2)]"
            disabled={isUploading}
          >
            Bootstrap from new-files
          </button>

          <label className="inline-flex items-center gap-2 text-xs text-[color:var(--ink-3)]">
            <input
              type="checkbox"
              checked={cleanupAi}
              onChange={(event) => setCleanupAi(event.target.checked)}
              className="h-4 w-4"
            />
            AI cleanup pass
          </label>
        </div>
      </div>

      {statusMessage ? <p className="text-xs text-[color:var(--good-ink)]">{statusMessage}</p> : null}
      {error ? <p className="text-xs text-[color:var(--warn-ink)]">{error}</p> : null}
    </div>
  );
}
