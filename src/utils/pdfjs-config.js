/**
 * PDF.js configuration for Vite
 * This configures the worker source to avoid 404 errors in development and production
 */
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker based on environment
if (import.meta.env.DEV) {
    // Development mode: use local worker
    const workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
} else {
    // Production mode: use CDN worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export default pdfjsLib;
