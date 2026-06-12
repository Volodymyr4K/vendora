/**
 * Status Badge Component
 * 
 * Visual indicator for domain verification status
 */

interface StatusBadgeProps {
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const styles = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        VERIFIED: 'bg-green-100 text-green-800',
        FAILED: 'bg-red-100 text-red-800'
    };

    const icons = {
        PENDING: '⏳',
        VERIFIED: '✅',
        FAILED: '❌'
    };

    const labels = {
        PENDING: 'Pending',
        VERIFIED: 'Verified',
        FAILED: 'Failed'
    };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
            <span className="mr-1">{icons[status]}</span>
            {labels[status]}
        </span>
    );
}
