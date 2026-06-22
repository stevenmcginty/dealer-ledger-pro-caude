

export const formatCurrency = (amount: number | undefined | null): string => {
  if (typeof amount !== 'number') {
    return '£0.00';
  }
  const isNegative = amount < 0;
  const absoluteAmount = Math.abs(amount);
  
  const fixedAmount = absoluteAmount.toFixed(2);
  const parts = fixedAmount.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  const finalAmount = `£${integerPart}.${parts[1]}`;
  
  // Return with a minus sign for negative values, which is standard.
  return isNegative ? `-${finalAmount}` : finalAmount;
};

/**
 * Heuristic: does this bank-statement line look like money moving between the
 * business's OWN accounts (e.g. a sweep into a savings account, or a move between
 * two bank accounts)? Used to default the reconciliation modal to "Transfer" so
 * own-account moves aren't mis-booked as income or an expense.
 *
 * Deliberately conservative — it only fires on strong own-account signals, NOT on
 * the bare word "transfer", because genuine customer/supplier payments in this app
 * are frequently described as "bank transfer" / "faster payment transfer" and must
 * never be auto-excluded from the accounts. The user can always toggle it manually.
 */
export const isLikelyOwnAccountTransfer = (description?: string): boolean =>
    /\b(savings|internal transfer|own account|own acct|money market|reserve account)\b/i.test(description || '');

export const toYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatDate = (date: string | number | Date, options?: Intl.DateTimeFormatOptions): string => {
  try {
    // If it's a 'YYYY-MM-DD' string, we must treat it as UTC to avoid timezone shifts.
    // e.g. new Date('2024-10-16') becomes '2024-10-16T00:00:00.000Z', which in a UTC-4 timezone is Oct 15th.
    // This explicitly creates a UTC date from the parts, which toLocaleDateString then correctly displays.
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split('-').map(Number);
        const d = new Date(Date.UTC(year, month - 1, day));
        return d.toLocaleDateString('en-GB', { timeZone: 'UTC', ...(options || { day: '2-digit', month: 'short', year: 'numeric' }) });
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString('en-GB', options || { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return 'Invalid Date';
  }
};

export const robustDateParser = (dateStr: string): string | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    // Try DD/MM/YYYY
    let parts = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (parts) {
        let day = parseInt(parts[1], 10);
        let month = parseInt(parts[2], 10);
        let year = parseInt(parts[3], 10);
        if (year < 100) year += 2000;
        if (day <= 31 && month <= 12) {
             const d = new Date(Date.UTC(year, month - 1, day));
             if(!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
    }

    // Try parsing as is, it might be YYYY-MM-DD or another valid format
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
};

export const isWithinDays = (dateStr1: string, dateStr2: string, days: number): boolean => {
    if (!dateStr1 || !dateStr2) return false;
    try {
        const d1 = new Date(dateStr1);
        const d2 = new Date(dateStr2);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    } catch (e) { console.error("Date parsing error:", e); return false; }
};

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

export const compressImage = (file: File, options: { maxWidth: number; quality: number }): Promise<File> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > options.maxWidth) {
                height = (height * options.maxWidth) / width;
                width = options.maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Failed to get canvas context."));
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob( (blob) => {
                    if (!blob) return reject(new Error("Canvas toBlob returned null."));
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', options.quality );
             URL.revokeObjectURL(img.src);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
    });
};

export const generateStockNumber = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    let result = '';
    for (let i = 0; i < 2; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    for (let i = 0; i < 4; i++) {
        result += nums.charAt(Math.floor(Math.random() * nums.length));
    }
    return result;
};

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};