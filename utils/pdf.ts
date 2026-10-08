// Shared html2canvas + jsPDF download flow used by the printable views.
// jspdf and html2canvas are heavy (~800KB combined), so they are imported
// dynamically and only load when a user actually exports a PDF.

interface CanvasOptions {
    scale?: number;
    useCORS?: boolean;
    backgroundColor?: string | null;
    width?: number;
    height?: number;
    [key: string]: unknown;
}

export interface DownloadPdfOptions {
    /** html2canvas capture options; defaults match the original per-component code. */
    canvas?: CanvasOptions;
    /** JPEG quality for the rasterised image. */
    quality?: number;
    /** Render everything on a single page (default paginates tall content). */
    singlePage?: boolean;
}

const loadPdfLibs = async () => {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
    ]);
    return { jsPDF, html2canvas };
};

type PdfLibs = Awaited<ReturnType<typeof loadPdfLibs>>;
type PdfDocument = InstanceType<PdfLibs['jsPDF']>;

/** Capture one element and draw it onto the PDF's current page (adding pages if it paginates). */
const drawElement = async (
    pdf: PdfDocument,
    html2canvas: PdfLibs['html2canvas'],
    element: HTMLElement,
    { canvas: canvasOptions, quality = 0.8, singlePage = false }: DownloadPdfOptions
) => {
    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        ...canvasOptions,
    });

    const imgData = canvas.toDataURL('image/jpeg', quality);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    if (singlePage) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
    } else {
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;
        while (heightLeft > 0) {
            position -= pdfPageHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfPageHeight;
        }
    }
};

const renderElementToPdf = async (element: HTMLElement, options: DownloadPdfOptions = {}) => {
    const { jsPDF, html2canvas } = await loadPdfLibs();
    const pdf = new jsPDF('p', 'mm', 'a4');
    await drawElement(pdf, html2canvas, element, options);
    return pdf;
};

/** One PDF page per element, each drawn like `singlePage` (its own capture, its own page). */
const renderElementsToPdf = async (elements: HTMLElement[], options: DownloadPdfOptions = {}) => {
    if (elements.length === 0) throw new Error('No elements to render to PDF.');
    const { jsPDF, html2canvas } = await loadPdfLibs();
    const pdf = new jsPDF('p', 'mm', 'a4');
    for (let i = 0; i < elements.length; i++) {
        if (i > 0) pdf.addPage();
        await drawElement(pdf, html2canvas, elements[i], { ...options, singlePage: true });
    }
    return pdf;
};

export const downloadElementAsPdf = async (
    element: HTMLElement,
    filename: string,
    options: DownloadPdfOptions = {}
) => {
    const pdf = await renderElementToPdf(element, options);
    pdf.save(filename);
};

/** Same render pipeline as downloadElementAsPdf, but returns the PDF bytes
 *  instead of saving them — used when the PDF is uploaded and sent. */
export const elementAsPdfBlob = async (
    element: HTMLElement,
    options: DownloadPdfOptions = {}
): Promise<Blob> => {
    const pdf = await renderElementToPdf(element, options);
    return pdf.output('blob');
};

/** Several elements as one PDF, one A4 page each, saved to `filename`. */
export const downloadElementsAsPdf = async (
    elements: HTMLElement[],
    filename: string,
    options: DownloadPdfOptions = {}
) => {
    const pdf = await renderElementsToPdf(elements, options);
    pdf.save(filename);
};

/** Several elements as one PDF, one A4 page each, as bytes for upload and send. */
export const elementsAsPdfBlob = async (
    elements: HTMLElement[],
    options: DownloadPdfOptions = {}
): Promise<Blob> => {
    const pdf = await renderElementsToPdf(elements, options);
    return pdf.output('blob');
};
