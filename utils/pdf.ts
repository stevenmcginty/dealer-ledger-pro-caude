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

export const downloadElementAsPdf = async (
    element: HTMLElement,
    filename: string,
    { canvas: canvasOptions, quality = 0.8, singlePage = false }: DownloadPdfOptions = {}
) => {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
    ]);

    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        ...canvasOptions,
    });

    const imgData = canvas.toDataURL('image/jpeg', quality);
    const pdf = new jsPDF('p', 'mm', 'a4');
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
    pdf.save(filename);
};
