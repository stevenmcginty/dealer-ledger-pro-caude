export type UpdateStatus = 'idle' | 'checking' | 'updating' | 'up-to-date' | 'ready';
export type VersionCompare = 'newer' | 'same' | 'unknown';

export const compareAppVersion = (remote: string | null | undefined, built: string): VersionCompare => {
    if (!remote) return 'unknown';
    if (remote !== built) return 'newer';
    return 'same';
};

export const updateButtonLabel = (status: UpdateStatus): string => {
    switch (status) {
        case 'ready':
            return 'Update available · Tap to install';
        case 'checking':
            return 'Checking…';
        case 'updating':
            return 'Updating…';
        case 'up-to-date':
            return 'Up to date';
        default:
            return 'Check for updates';
    }
};
