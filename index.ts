#!/usr/bin/env bun
import { readdir, mkdir } from "node:fs/promises";
import { intro, outro, isCancel, cancel, log, text, select, spinner } from '@clack/prompts';
import { Mistral } from '@mistralai/mistralai';
import { join, basename } from 'path';
import { existsSync } from 'fs';

const apiKey = Bun.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error("MISTRAL_API_KEY environment variable is not set.\nCreate an .env file with your Mistral API key");
  process.exit(1);
}

const mistral = new Mistral({ apiKey: apiKey });

const pdfsPath = "./pdf";
const ocrPath = "./ocr";

if (!existsSync(pdfsPath)) {
  await mkdir(pdfsPath, { recursive: true });
}
if (!existsSync(ocrPath)) {
  await mkdir(ocrPath, { recursive: true });
}

intro(`Mistral OCR`);

async function main() {
  let continueRunning = true;

  while (continueRunning) {
    const operation = await select({
      message: 'What do you want to do?',
      options: [
        { value: 'upload', label: 'Upload PDF to Mistral' },
        { value: 'ocr', label: 'OCR uploaded PDF' },
        { value: 'convert', label: 'Convert OCR data into Markdown' },
        { value: 'delete', label: 'Delete uploaded PDF' },
        { value: 'exit', label: 'Exit' },
      ],
    });

    if (isCancel(operation)) {
      cancel('Operation cancelled');
      continueRunning = false;
      continue;
    }

    if (operation === 'exit') {
      continueRunning = false;
      continue;
    }

    async function getUploadedList() {
      return await mistral.files.list({ purpose: "ocr" });
    }

    async function uploadPDF(filePath: string) {
      const file = Bun.file(filePath);
      const fileName = basename(filePath);

      const s = spinner();
      s.start(`Uploading ${fileName}`);

      try {
        await mistral.files.upload({
          file: {
            fileName: fileName,
            content: file,
          },
          purpose: "ocr"
        });
        s.stop(`Successfully uploaded ${fileName}`);
        return true;
      } catch (error: any) {
        s.stop(`Failed to upload ${fileName}: ${error.message}`);
        return false;
      }
    }

    async function deletePDF(fileId: string) {
      const s = spinner();
      s.start(`Deleting file ${fileId}`);

      try {
        await mistral.files.delete({ fileId: fileId });
        s.stop(`Successfully deleted file ${fileId}`);
        return true;
      } catch (error: any) {
        s.stop(`Failed to delete file ${fileId}: ${error.message}`);
        return false;
      }
    }

    async function ocrPDF(fileId: string, fileName: string) {
      const s = spinner();
      s.start(`Processing OCR for ${fileName}`);

      try {
        const signedUrl = await mistral.files.getSignedUrl({
          fileId: fileId
        });

        const ocrResponse = await mistral.ocr.process({
          model: "mistral-ocr-latest",
          document: {
            type: "document_url",
            documentUrl: signedUrl.url
          },
          includeImageBase64: false,
          imageLimit: 0
        });

        const baseFileName = fileName.split('.')[0];
        const fileDir = join(ocrPath, baseFileName);

        if (!existsSync(fileDir)) {
          await mkdir(fileDir, { recursive: true });
        }

        await Bun.write(`${fileDir}/${fileName}.json`, JSON.stringify(ocrResponse, null, 2));
        s.stop(`OCR processing complete for ${fileName}`);
        return fileDir;
      } catch (error: any) {
        s.stop(`Failed to process OCR: ${error.message}`);
        return null;
      }
    }

    async function convertOCR(filePath: string) {
      const s = spinner();
      s.start(`Converting OCR data into Markdown pages`);

      try {
        const file = Bun.file(filePath);

        const fullFileName = basename(filePath);
        const baseFileName = fullFileName.split('.')[0];
        const fileDir = join(ocrPath, baseFileName);

        const pagesDir = join(fileDir, 'pages');
        if (!existsSync(pagesDir)) {
          await mkdir(pagesDir, { recursive: true });
        }

        const contents = await file.json();

        if (!existsSync(fileDir)) {
          await mkdir(fileDir, { recursive: true });
        }

        let pageCount = 0;
        for (const page of contents.pages) {
          const index = page.index;
          const markdown = page.markdown;

          const filename = `${pagesDir}/page_${index}.md`;
          await Bun.write(filename, markdown);
          pageCount++;
        }

        s.stop(`Successfully converted OCR data into ${pageCount} pages in ${pagesDir}`);
        return true;
      } catch (error: any) {
        s.stop(`Failed to convert OCR data: ${error.message}`);
        return false;
      }
    }

    switch (operation) {
      case 'upload': {
        const pdfs = await readdir(pdfsPath);
        if (pdfs.length === 0) {
          log.info(`No PDFs found in ${pdfsPath}. Please add PDFs to this directory.`);
          continue;
        }

        const selectedPdf = await select({
          message: 'Select a PDF to upload:',
          options: pdfs.map(pdf => ({
            value: pdf,
            label: pdf
          })),
        });

        if (isCancel(selectedPdf)) {
          cancel('Upload cancelled');
          continue;
        }

        const filePath = join(pdfsPath, selectedPdf as string);
        await uploadPDF(filePath);
        continue;
      }

      case 'delete': {
        const s = spinner();
        s.start('Fetching uploaded files');

        try {
          const files = await getUploadedList();
          s.stop('Files fetched successfully');

          if (files.data.length === 0) {
            log.info('No uploaded files found.');
            continue;
          }

          const selectedFile = await select({
            message: 'Select a file to delete:',
            options: files.data.map(file => ({
              value: file.id,
              label: `${file.filename} (${file.id})`
            })),
          });

          if (isCancel(selectedFile)) {
            cancel('Delete operation cancelled');
            continue;
          }

          await deletePDF(selectedFile as string);
        } catch (error: any) {
          s.stop(`Failed to fetch files: ${error.message}`);
        }
        continue;
      }

      case 'ocr': {
        const s = spinner();
        s.start('Fetching uploaded files');

        try {
          const files = await getUploadedList();
          s.stop('Files fetched successfully');

          if (files.data.length === 0) {
            log.info('No uploaded files found. Please upload a PDF first.');
            continue;
          }

          const selectedFile = await select({
            message: 'Select a file to OCR:',
            options: files.data.map(file => ({
              value: `${file.id}:${file.filename}`,
              label: file.filename
            })),
          });

          if (isCancel(selectedFile)) {
            cancel('OCR operation cancelled');
            continue;
          }

          const [fileId, fileName] = (selectedFile as string).split(':');
          const outputDir = await ocrPDF(fileId, fileName);

          if (outputDir) {
            log.info(`OCR results saved to ${outputDir}/${fileName}.json`);
          }
        } catch (error: any) {
          s.stop(`Failed to perform OCR: ${error.message}`);
        }
        continue;
      }

      case 'convert': {
        try {
          const ocrFiles = [];
          const directories = await readdir(ocrPath);

          for (const dir of directories) {
            const dirPath = join(ocrPath, dir);
            try {
              const stats = await Bun.file(dirPath).stat();
              if (stats.isDirectory()) {
                const files = await readdir(dirPath);
                for (const file of files) {
                  if (file.endsWith('.json')) {
                    ocrFiles.push(join(dirPath, file));
                  }
                }
              }
            } catch (error) {
              // Skip if not a directory
            }
          }

          if (ocrFiles.length === 0) {
            log.info('No OCR JSON files found. Please process an uploaded PDF with OCR first.');
            continue;
          }

          const selectedFile = await select({
            message: 'Select an OCR data to format into Markdown pages:',
            options: ocrFiles.map(file => ({
              value: file,
              label: basename(file)
            })),
          });

          if (isCancel(selectedFile)) {
            cancel('Formatting operation cancelled');
            continue;
          }

          await convertOCR(selectedFile as string);
        } catch (error: any) {
          console.error(`Failed to convert OCR data: ${error.message}`);
        }
        continue;
      }
    }
  }

  outro(`Mistral OCR session completed!`);
}

await main();