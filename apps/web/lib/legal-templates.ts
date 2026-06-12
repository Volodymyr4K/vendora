export const LEGAL_TEMPLATES = {
  impressum: {
    de: {
      title: "Impressum",
      subtitle: "Anbieterkennzeichnung",
      intro:
        "Bitte ersetzen Sie die folgenden Angaben durch Ihre korrekten rechtlichen Informationen (Firma, Adresse, Vertretungsberechtigte, Register, etc.).",
      blocks: [
        {
          title: "Anbieter",
          lines: ["Berlin Press", "Musterstraße 1", "10115 Berlin", "Deutschland"],
        },
        {
          title: "Kontakt",
          lines: ["E-Mail: hello@berlin-press.example", "Telefon: +49 (0) 000 000000"],
        },
        {
          title: "Verantwortlich für den Inhalt",
          lines: ["Name Nachname", "Adresse wie oben"],
        },
      ],
      note:
        "Hinweis: Dieses Impressum ist eine Vorlage. Lassen Sie Ihr Impressum bei Bedarf rechtlich prüfen (insbesondere in DE/AT/CH).",
      updated: "Letzte Aktualisierung: 21. Februar 2026",
    },
    en: {
      title: "Impressum",
      subtitle: "Legal notice",
      intro:
        "Please replace the details below with your correct legal information (company, address, representatives, registry info, etc.).",
      blocks: [
        {
          title: "Provider",
          lines: ["Berlin Press", "Example Street 1", "10115 Berlin", "Germany"],
        },
        {
          title: "Contact",
          lines: ["Email: hello@berlin-press.example", "Phone: +49 (0) 000 000000"],
        },
        {
          title: "Responsible for content",
          lines: ["Name Surname", "Address as above"],
        },
      ],
      note:
        "Note: This Impressum is a template. Consider legal review depending on your jurisdiction (especially DE/AT/CH).",
      updated: "Last updated: February 21, 2026",
    },
  },
  terms: {
    de: {
      title: "Terms",
      subtitle: "Allgemeine Nutzungsbedingungen",
      intro:
        "Diese Seite enthält grundlegende Informationen zu den Nutzungsbedingungen. Bitte ersetzen Sie den Text durch Ihre finalen, rechtlich geprüften Bedingungen.",
      sections: [
        {
          title: "1. Geltungsbereich",
          body:
            "Diese Bedingungen gelten für die Nutzung dieser Website und ihrer Inhalte. Weitere, spezifische Bedingungen können für Bestellungen oder Services gelten.",
        },
        {
          title: "2. Inhalte & Urheberrecht",
          body:
            "Alle Inhalte (Texte, Bilder, Grafiken) sind urheberrechtlich geschützt. Eine Nutzung außerhalb der gesetzlichen Schranken bedarf der vorherigen Zustimmung.",
        },
        {
          title: "3. Haftung",
          body:
            "Wir bemühen uns um korrekte und aktuelle Informationen. Eine Haftung für Vollständigkeit, Richtigkeit und Verfügbarkeit ist im gesetzlich zulässigen Umfang ausgeschlossen.",
        },
        {
          title: "4. Kontakt",
          body:
            "Für Fragen zu diesen Bedingungen kontaktieren Sie uns bitte über die im Impressum angegebenen Kontaktdaten.",
        },
      ],
      updated: "Letzte Aktualisierung: 21. Februar 2026",
    },
    en: {
      title: "Terms",
      subtitle: "Terms of use",
      intro:
        "This page provides a basic outline of terms of use. Please replace this text with your final, legally reviewed terms.",
      sections: [
        {
          title: "1. Scope",
          body:
            "These terms apply to the use of this website and its content. Additional terms may apply to orders or specific services.",
        },
        {
          title: "2. Content & copyright",
          body:
            "All content (texts, images, graphics) is protected by copyright. Any use beyond what is permitted by law requires prior permission.",
        },
        {
          title: "3. Liability",
          body:
            "We strive to provide accurate and up-to-date information. Liability for completeness, correctness, and availability is excluded to the extent permitted by law.",
        },
        {
          title: "4. Contact",
          body:
            "If you have questions about these terms, please contact us using the details listed in the Impressum.",
        },
      ],
      updated: "Last updated: February 21, 2026",
    },
  },
  privacy: {
    de: {
      title: "Privacy",
      subtitle: "Privacy & cookies",
      intro:
        "Wir respektieren Ihre Privatsphäre. Diese Seite beschreibt in Kurzform, welche Daten beim Besuch der Website verarbeitet bzw. in Ihrem Browser gespeichert werden.",
      cookiesTitle: "Cookies",
      cookiesIntro:
        "Wir verwenden ein funktionales Cookie, um Ihre Sprachpräferenz zu speichern, damit Sie diese nicht bei jedem Besuch erneut auswählen müssen.",
      cookiesPurpose: "Zweck",
      cookiesPurposeValue: "Speichert die ausgewählte Sprache (z. B. en/de).",
      cookiesLifetime: "Laufzeit",
      cookiesLifetimeValue: "Bis zu 1 Jahr.",
      cookiesType: "Typ",
      cookiesTypeValue: "Funktional / technisch erforderlich.",
      note:
        "Wir verwenden derzeit keine Werbe- oder Analyse-Cookies. Diese Seite ist eine vereinfachte Information und ersetzt keine rechtliche Beratung.",
      updated: "Letzte Aktualisierung: 21. Februar 2026",
    },
    en: {
      title: "Privacy",
      subtitle: "Privacy & cookies",
      intro:
        "We respect your privacy. This page briefly describes what data is processed and what is stored in your browser when you use the website.",
      cookiesTitle: "Cookies",
      cookiesIntro:
        "We use a functional cookie to remember your language preference so you don’t have to re-select it on each visit.",
      cookiesPurpose: "Purpose",
      cookiesPurposeValue: "Stores the selected language (e.g. en/de).",
      cookiesLifetime: "Lifetime",
      cookiesLifetimeValue: "Up to 1 year.",
      cookiesType: "Type",
      cookiesTypeValue: "Functional / strictly necessary.",
      note:
        "We do not use advertising or analytics cookies at the moment. This is a simplified notice and not legal advice.",
      updated: "Last updated: February 21, 2026",
    },
  },
} as const;

