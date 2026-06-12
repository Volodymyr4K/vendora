/**
 * DNS Instructions Modal
 * 
 * Shows all DNS records including provider-specific additionalRecords
 */

'use client';

interface DnsRecord {
    type: string;
    name?: string;
    value: string;
    description?: string;
}

interface DnsInstructions {
    txtRecord?: DnsRecord;
    cnameRecord?: DnsRecord;
    additionalRecords?: DnsRecord[];
}

interface DnsInstructionsModalProps {
    domain: string;
    dnsInstructions: DnsInstructions;
    onClose: () => void;
}

export function DnsInstructionsModal({ domain, dnsInstructions, onClose }: DnsInstructionsModalProps) {
    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto mx-4">
                <h2 className="text-xl font-bold mb-4">DNS Setup Instructions</h2>

                <p className="text-sm text-gray-600 mb-6">
                    Add these DNS records to <strong>{domain}</strong> via your domain provider (e.g., Cloudflare, Namecheap)
                </p>

                {/* TXT Record - Ownership */}
                {dnsInstructions.txtRecord && (
                    <DnsRecordCard
                        number={1}
                        title="TXT Record (Ownership Verification)"
                        record={dnsInstructions.txtRecord}
                        onCopy={copyToClipboard}
                    />
                )}

                {/* CNAME Record - Infrastructure */}
                {dnsInstructions.cnameRecord && (
                    <DnsRecordCard
                        number={2}
                        title="CNAME Record (Infrastructure)"
                        record={dnsInstructions.cnameRecord}
                        onCopy={copyToClipboard}
                    />
                )}

                {/* Additional Provider Records (e.g., vc-domain-verify) */}
                {dnsInstructions.additionalRecords?.map((record, idx) => (
                    <DnsRecordCard
                        key={idx}
                        number={3 + idx}
                        title={`${record.type} Record (${record.description || 'Provider Specific'})`}
                        record={record}
                        onCopy={copyToClipboard}
                    />
                ))}

                <div className="mt-6 p-4 bg-blue-50 rounded">
                    <h3 className="font-semibold mb-2">⏱️ DNS Propagation</h3>
                    <p className="text-sm text-gray-700">
                        DNS changes can take up to 48 hours to propagate worldwide.
                        However, most changes are visible within 5-15 minutes.
                    </p>
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper component for consistent record display
function DnsRecordCard({ number, title, record, onCopy }: {
    number: number;
    title: string;
    record: DnsRecord;
    onCopy: (text: string) => void;
}) {
    return (
        <div className="mb-4 p-4 bg-gray-50 rounded">
            <h3 className="font-semibold mb-3">{number}. {title}</h3>
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-sm font-medium">Type:</span>
                        <code className="ml-2 px-2 py-1 bg-white rounded text-sm">{record.type}</code>
                    </div>
                </div>
                {record.name && (
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-sm font-medium">Name:</span>
                            <code className="ml-2 px-2 py-1 bg-white rounded text-sm">{record.name}</code>
                        </div>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <div className="flex-1">
                        <span className="text-sm font-medium">Value:</span>
                        <code className="ml-2 px-2 py-1 bg-white rounded text-sm break-all">
                            {record.value}
                        </code>
                    </div>
                    <button
                        onClick={() => onCopy(record.value)}
                        className="ml-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0"
                    >
                        Copy
                    </button>
                </div>
                {record.description && (
                    <p className="text-xs text-gray-500 italic">
                        💡 {record.description}
                    </p>
                )}
            </div>
        </div>
    );
}
