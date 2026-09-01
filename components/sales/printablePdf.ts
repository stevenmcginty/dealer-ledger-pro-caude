/**
 * Turn the on-screen printable invoice into PDF bytes.
 *
 * The visible #printable-content is styled for the screen (mm padding, min/max
 * heights); the PDF needs the fixed A4 pixel box and the big bottom padding that
 * the download button has always used. Both paths — download, and upload-and-send
 * to the customer — go through here so the customer receives the same PDF the
 * desk would have printed.
 */

import { downloadElementAsPdf, elementAsPdfBlob } from '../../utils/pdf';

// A4 at 96dpi: 794px x 1123px
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

// JPEG at 1.0 barely compresses, so an 8-megapixel A4 page landed near the 5 MB
// cap Gmail puts on a send once base64 has grown it by a third. 0.85 is the same
// page to the eye on text and roughly a third of the bytes.
const PDF_OPTIONS = {
    canvas: { scale: 3, width: A4_WIDTH, height: A4_HEIGHT },
    quality: 0.85,
    singlePage: true,
} as const;

/** Clone #printable-content into the off-screen #pdf-renderer, sized for PDF. */
const withPreparedClone = async <T>(fn: (clone: HTMLElement) => Promise<T>): Promise<T> => {
    const elementToPrint = document.getElementById('printable-content');
    const pdfRenderer = document.getElementById('pdf-renderer');

    if (!elementToPrint || !pdfRenderer) {
        throw new Error('Required elements for PDF generation are not found.');
    }

    const clone = elementToPrint.cloneNode(true) as HTMLElement;

    clone.style.width = A4_WIDTH + 'px';
    clone.style.height = A4_HEIGHT + 'px';
    clone.style.padding = '23px 38px 265px 38px';
    clone.style.boxSizing = 'border-box';
    clone.style.position = 'relative';
    clone.style.overflow = 'hidden';

    pdfRenderer.innerHTML = '';
    pdfRenderer.style.position = 'absolute';
    pdfRenderer.style.left = '-9999px';
    pdfRenderer.style.top = '0';
    pdfRenderer.style.width = A4_WIDTH + 'px';
    pdfRenderer.style.height = A4_HEIGHT + 'px';
    pdfRenderer.appendChild(clone);
    pdfRenderer.classList.remove('hidden');

    try {
        return await fn(clone);
    } finally {
        pdfRenderer.innerHTML = '';
        pdfRenderer.classList.add('hidden');
    }
};

export const downloadPrintablePdf = (filename: string): Promise<void> =>
    withPreparedClone(clone => downloadElementAsPdf(clone, filename, PDF_OPTIONS));

/** The same render, as bytes — for uploading and sending to the customer. */
export const printablePdfBlob = (): Promise<Blob> =>
    withPreparedClone(clone => elementAsPdfBlob(clone, PDF_OPTIONS));
