/**
 * Turn the on-screen printable invoice into PDF bytes.
 *
 * The visible #printable-content is styled for the screen (mm padding, min/max
 * heights); the PDF needs the fixed A4 pixel box and the big bottom padding that
 * the download button has always used. Both paths — download, and upload-and-send
 * to the customer — go through here so the customer receives the same PDF the
 * desk would have printed.
 *
 * When the view shows the terms page (#printable-terms, only there when the desk
 * ticked "Add terms page"), it is cloned the same way and becomes page 2.
 * Without it the PDF is the single page it has always been.
 */

import { downloadElementsAsPdf, elementsAsPdfBlob } from '../../utils/pdf';

// A4 at 96dpi: 794px x 1123px
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

// Page 1 keeps the big bottom padding its footer (bank details, signature,
// warranty terms) has always needed. Page 2's footer is only the company details.
const INVOICE_PADDING = '23px 38px 265px 38px';
const TERMS_PADDING = '23px 38px 113px 38px';

// JPEG at 1.0 barely compresses, so an 8-megapixel A4 page landed near the 5 MB
// cap Gmail puts on a send once base64 has grown it by a third. 0.85 is the same
// page to the eye on text and roughly a third of the bytes.
const PDF_OPTIONS = {
    canvas: { scale: 3, width: A4_WIDTH, height: A4_HEIGHT },
    quality: 0.85,
    singlePage: true,
} as const;

const a4Clone = (element: HTMLElement, padding: string): HTMLElement => {
    const clone = element.cloneNode(true) as HTMLElement;

    clone.style.width = A4_WIDTH + 'px';
    clone.style.height = A4_HEIGHT + 'px';
    clone.style.padding = padding;
    clone.style.boxSizing = 'border-box';
    clone.style.position = 'relative';
    clone.style.overflow = 'hidden';
    return clone;
};

/** Clone #printable-content (and #printable-terms, if shown) into the off-screen #pdf-renderer, sized for PDF. */
const withPreparedClones = async <T>(fn: (pages: HTMLElement[]) => Promise<T>): Promise<T> => {
    const elementToPrint = document.getElementById('printable-content');
    const termsPage = document.getElementById('printable-terms');
    const pdfRenderer = document.getElementById('pdf-renderer');

    if (!elementToPrint || !pdfRenderer) {
        throw new Error('Required elements for PDF generation are not found.');
    }

    const pages = [a4Clone(elementToPrint, INVOICE_PADDING)];
    if (termsPage) {
        const terms = a4Clone(termsPage, TERMS_PADDING);
        terms.style.marginTop = '0'; // the on-screen gap between the pages is not part of page 2
        pages.push(terms);
    }

    pdfRenderer.innerHTML = '';
    pdfRenderer.style.position = 'absolute';
    pdfRenderer.style.left = '-9999px';
    pdfRenderer.style.top = '0';
    pdfRenderer.style.width = A4_WIDTH + 'px';
    pdfRenderer.style.height = A4_HEIGHT + 'px';
    pages.forEach(page => pdfRenderer.appendChild(page));
    pdfRenderer.classList.remove('hidden');

    try {
        return await fn(pages);
    } finally {
        pdfRenderer.innerHTML = '';
        pdfRenderer.classList.add('hidden');
    }
};

export const downloadPrintablePdf = (filename: string): Promise<void> =>
    withPreparedClones(pages => downloadElementsAsPdf(pages, filename, PDF_OPTIONS));

/** The same render, as bytes — for uploading and sending to the customer. */
export const printablePdfBlob = (): Promise<Blob> =>
    withPreparedClones(pages => elementsAsPdfBlob(pages, PDF_OPTIONS));
