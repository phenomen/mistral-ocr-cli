# Mistral OCR CLI

A CLI utility to OCR PDFs with Mistral and format data into Markdown pages.

## Usage

1. Create `.env` file with `MISTRAL_API_KEY="your_key"` ([get Mistral key](https://console.mistral.ai/)).

2. Put your PDFs into `/pdf` directory.

3. Run CLI in the same directory as `.env` and `/pdf`.

```bash
bunx mistral-ocr-cli
```
