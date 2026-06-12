/**
 * Domain Display Component
 * 
 * Shows Unicode domain with homograph warning if needed
 */

'use client';

interface DomainDisplayProps {
    domain: string;
}

export function DomainDisplay({ domain }: DomainDisplayProps) {
    // Simple Unicode check - full implementation would use punycode
    const isPunycode = domain.startsWith('xn--');

    // Simple mixed-script detection
    const hasMixedScript = /[а-яА-Я]/.test(domain) && /[a-zA-Z]/.test(domain);

    return (
        <div>
            <div className="font-medium">{domain}</div>
            {hasMixedScript && (
                <div className="text-xs text-orange-600 mt-1 flex items-center">
                    <span className="mr-1">⚠️</span>
                    Mixed script detected (potential security risk)
                </div>
            )}
            {isPunycode && (
                <div className="text-xs text-gray-500 mt-1">
                    Punycode domain
                </div>
            )}
        </div>
    );
}
