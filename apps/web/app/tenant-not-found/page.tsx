import Link from 'next/link';

export default function TenantNotFoundPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-paper">
            <div className="text-center px-4">
                <h1 className="text-6xl font-bold text-ink mb-4">🍱</h1>
                <h2 className="text-3xl font-semibold text-ink mb-2">
                    Restaurant Not Found
                </h2>
                <p className="text-muted mb-6 max-w-md mx-auto">
                    Sorry, we couldn't find this restaurant. Please check the URL or contact support.
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition"
                >
                    ← Go to Homepage
                </Link>
            </div>
        </div>
    );
}
