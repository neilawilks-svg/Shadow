# Full Share Archive Procedure (Plaintext, Includes Secrets)

## Warning and Scope
This archive is a full plaintext snapshot of the entire project folder.

It includes:
- `.env` and any other hidden files
- `.git` history and metadata
- dependencies (`node_modules`)
- build/cache artifacts (`.next`, `.venv`, local generated artifacts)
- runtime/local data (`data/`, `local/`, `new-files/`)

Only share this archive over trusted channels with trusted recipients.

## Create the Archive
Run from the parent directory:

```bash
cd /Users/will.thieme/codex
ARCHIVE="morgan-virtual-board-full-share-$(date +%Y%m%d-%H%M%S).zip"
zip -r "$ARCHIVE" "morgan-virtual-board"
```

## Verify Required Contents

```bash
zipinfo -1 "$ARCHIVE" | rg '^morgan-virtual-board/\.env$'
zipinfo -1 "$ARCHIVE" | rg '^morgan-virtual-board/\.git/'
zipinfo -1 "$ARCHIVE" | rg '^morgan-virtual-board/node_modules/'
ls -lh "$ARCHIVE"
```

## Optional Deep Verification
List the first 40 entries:

```bash
zipinfo -1 "$ARCHIVE" | head -n 40
```

Check if archive can be scanned without extraction:

```bash
unzip -t "$ARCHIVE"
```

## Sharing Notes
- Expect a large archive due to `node_modules`, `.next`, `.venv`, and local artifacts.
- Recommended transfer options: internal cloud drive, enterprise file transfer, or approved secure artifact storage.
- Keep this as a point-in-time snapshot; regenerate if you need latest changes.
