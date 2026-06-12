"use client";

import { useMemo, useState } from "react";

type Props = {
    formats: string[];
    languages: string[];
    labels: {
        format: string;
        language: string;
    };
};

export function AmProductVariants({ formats, languages, labels }: Props) {
    const normalizedFormats = useMemo(
        () => (formats.length ? formats : ["standard"]),
        [formats]
    );
    const normalizedLangs = useMemo(
        () => (languages.length ? languages : ["EN"]),
        [languages]
    );

    const [selectedFormat, setSelectedFormat] = useState(normalizedFormats[0]);
    const [selectedLanguage, setSelectedLanguage] = useState(normalizedLangs[0]);

    return (
        <div className="py-8 border-b border-line">
            <div className="mb-6">
                <span className="block text-[10px] uppercase text-muted mb-3 tracking-widest">{labels.format}</span>
                <div className="flex flex-wrap gap-3">
                    {normalizedFormats.map((format) => (
                        <button
                            key={format}
                            type="button"
                            onClick={() => setSelectedFormat(format)}
                            className={`px-4 py-2 border font-mono text-xs uppercase transition-all ${
                                selectedFormat === format
                                    ? "bg-ink text-paper border-ink"
                                    : "bg-paper text-ink border-line hover:bg-bg"
                            }`}
                        >
                            {format}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <span className="block text-[10px] uppercase text-muted mb-3 tracking-widest">{labels.language}</span>
                <div className="flex flex-wrap gap-3">
                    {normalizedLangs.map((lang) => (
                        <button
                            key={lang}
                            type="button"
                            onClick={() => setSelectedLanguage(lang)}
                            className={`px-4 py-2 border font-mono text-xs uppercase transition-all ${
                                selectedLanguage === lang
                                    ? "bg-ink text-paper border-ink"
                                    : "bg-paper text-ink border-line hover:bg-bg"
                            }`}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
