# Mistral OCR CLI

A CLI utility to OCR PDFs with Mistral and format data into Markdown pages.

1. Install deps (requires [Bun](https://bun.sh/))

```bash
bun install
```

2. Create `.env` file with `MISTRAL_API_KEY` ([get Mistral key](https://console.mistral.ai/))

3. Put your PDFs into `./pdf`

4. Run CLI

```bash
bun run index.ts
```
