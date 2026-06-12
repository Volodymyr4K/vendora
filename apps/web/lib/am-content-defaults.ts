import type { AmContentV1, LocalizedValue } from "./am-content";

const l = (de: string, en: string): LocalizedValue => ({ de, en });
const fixed = (value: string): LocalizedValue => ({ de: value, en: value });

export const AM_CONTENT_DEFAULTS: AmContentV1 = {
    version: 1,
    ui: {
        common: {
            noImage: l("Kein Bild", "No image"),
            standard: l("Standard", "Standard"),
            featured: l("Vorgestellt", "Featured"),
            est: l("Gegr.", "Est."),
            close: l("Schließen", "Close"),
            itemsLabel: l("Einträge", "items"),
            notificationLabel: l("Hinweis", "Notification"),
        },
        nav: {
            catalog: l("Katalog", "Catalog"),
            authors: l("Autoren", "Authors"),
            about: l("Über uns", "About"),
            media: l("Presse", "Media"),
            preorder: l("Vorbestellungen", "Preorders"),
            noResults: l("Keine Ergebnisse", "No results found"),
            homeCrumb: l("Startseite", "Home"),
            journalTag: l("Journal", "Journal"),
        },
        search: {
            search: l("Suche...", "Search..."),
            recentSearches: l("Letzte Suchen", "Recent searches"),
            clearHistory: l("Löschen", "Clear"),
            emptyArchive: l("Leeres Archiv", "Empty archive"),
            trending: l("Angesagte Sammlungen", "Trending Collections"),
            quickLinks: {
                philosophy: l("Philosophie", "Philosophy"),
                art: l("Kunsttheorie", "Art Theory"),
                newest: l("Neueingänge", "New Arrivals"),
            },
        },
        cart: {
            yourOrder: l("Ihre Bestellung", "Your Order"),
            empty: l("Warenkorb ist leer", "Cart is empty"),
            summary: l("Bestellübersicht", "Order Summary"),
            total: l("Gesamt", "Total"),
            remove: l("Entfernen", "Remove"),
            itemNo: l("Pos. Nr.", "Item No."),
        },
        catalog: {
            archiveInventory: l("Archiv / Inventar", "Archive / Inventory"),
            titleAll: l("Alle Bücher", "All Books"),
            categoryLabel: l("Kategorie", "Category"),
            sortBy: l("Sortieren nach", "Sort by"),
            viewGrid: l("Raster", "Grid"),
            viewList: l("Liste", "List"),
            showingResults: l("Zeige {count} Ergebnisse", "Showing {count} results"),
            openSystem: l("Systemkatalog öffnen", "Open system catalog"),
            sortOptions: {
                default: l("Standard", "Default"),
                newest: l("Neueste zuerst", "Newest First"),
                priceAsc: l("Preis: Niedrig bis Hoch", "Price: Low to High"),
                priceDesc: l("Preis: Hoch bis Niedrig", "Price: High to Low"),
                alphaAsc: l("A-Z", "A-Z"),
            },
            filters: {
                title: l("Filter", "Filters"),
                priceRange: l("Preisspanne", "Price Range"),
                apply: l("Ergebnisse anzeigen ({count})", "View Results ({count})"),
                availability: l("Verfügbarkeit", "Availability"),
                inStock: l("Nur auf Lager", "In Stock Only"),
                format: l("Format", "Format"),
                authors: l("Autoren", "Authors"),
                noResults: l("Keine Ergebnisse gefunden", "No Results Found"),
            },
        },
        product: {
            addToCart: l("In den Warenkorb", "Add to Cart"),
            makePreorder: l("Jetzt vorbestellen", "Preorder Now"),
            preorder: l("Vorbestellung", "Preorder"),
            new: l("Neu", "New"),
            bestseller: l("Hit", "Hit"),
            outOfStock: l("Ausverkauft", "Out of Stock"),
            byAuthor: l("von", "by"),
            inStock: l("Auf Lager", "In Stock"),
            details: {
                year: l("Jahr", "Year"),
                pages: l("Seiten", "Pages"),
            },
            youMayLike: l("Das könnte Ihnen auch gefallen", "You May Also Like"),
            backToCatalog: l("Zurück zum Katalog", "Back to Catalog"),
            format: {
                hardcover: l("Hardcover", "Hardcover"),
                paperback: l("Taschenbuch", "Paperback"),
                digital: l("Digital", "Digital"),
                specialEdition: l("Sonderausgabe", "Special Edition"),
            },
        },
    },
    header: {
        brand: {
            text: fixed("Berlin Press"),
        },
        nav: [
            { id: "catalog", label: l("Katalog", "Catalog"), href: "/catalog" },
            { id: "authors", label: l("Autoren", "Authors"), href: "/authors" },
            { id: "about", label: l("Über uns", "About"), href: "/about" },
            { id: "media", label: l("Presse", "Media"), href: "/media" },
        ],
    },
    homepage: {
        newArrivalsHeadingEnabled: true,
        viewAllLinkEnabled: true,
        hero: {
            eyebrow: l("Gegr. 2026 Berlin", "Est. 2026 Berlin"),
            title: l("Radikales\nDenken.", "Radical\nThinking."),
            subtitle: l(
                "Wir kreieren Bücher, die nicht nur im Regal stehen, sondern die Architektur Ihres Denkens verändern.",
                "We create books that don't just sit on a shelf, but change the architecture of your thinking."),
            ctaText: l("Zum Katalog", "Go to Catalog"),
            ctaHref: "/catalog",
            imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
            imageAlt: fixed("Berlin Press cover"),
        },
        ticker: [{ id: "ticker-1", text: fixed("The Art of Publishing — The Poetry of Form — The Aesthetics of Thought — Objects of Desire — ") }],
        featured: {
            label: l("Vorgestellt", "Featured"),
            title: fixed("The Berlin Review"),
        },
        stats: [
            { id: "countries", value: "12", label: l("Länder", "Countries") },
            { id: "delivery", value: "3d", label: l("Durchschn. Lieferzeit", "Avg. Delivery") },
        ],
        newArrivalsTitle: l("Neuheiten", "New Arrivals"),
        marqueeVertical: l("Neue Kollektion • Weltweiter Versand • Exklusive Ausgaben • ", "New Collection • Worldwide Shipping • Exclusive Editions • "),
        editorialTitle: l("Globale Reichweite", "Global Reach"),
        editorialDesc: l(
            "Wir versenden weltweit. Unsere Bücher sind zum Reisen gemacht, um gehalten und unterwegs gelesen zu werden.",
            "We ship worldwide. Our books are designed to travel, to be held, to be read in transit."),
        editorialImageUrl: "https://images.unsplash.com/photo-1592496431122-2349e0fbc666?auto=format&fit=crop&q=80&w=1200",
        editorialImageAlt: fixed("Editorial visual"),
        viewAllLabel: l("Alle Neuheiten ansehen", "See all new"),
        viewAllHref: "/catalog",
    },
    about: {
        eyebrow: l("Über uns", "About"),
        title: l("Über uns", "About Us"),
        text: l(
            "Unabhängiger Verlag im Herzen Europas mit einem globalen Blick auf Kultur.",
            "Independent publisher in the heart of Europe with a global view on culture."),
        missionTitle: l("Mission", "Mission"),
        p1: l(
            "Berlin Press wurde in Berlin als Plattform für den Dialog zwischen Kulturen und Generationen gegründet. Wir glauben, dass ein Buch nicht nur ein Informationsträger ist, sondern ein Kunstobjekt und ein Werkzeug zum Denken.",
            "Berlin Press was founded in Berlin as a platform for dialogue between cultures and generations. We believe that a book is not just a carrier of information, but an art object and a tool for thinking."),
        p2: l(
            "Unser Katalog vereint Übersetzungen moderner Klassiker, mutige Debüts und tiefe Forschungen in der Kunsttheorie. Wir streben nach höchster Qualität in Druck und Design.",
            "Our catalog combines translations of modern classics, bold debuts, and deep research in art theory. We strive for the highest quality in printing and design."),
        teamTitle: l("Team", "Team"),
        hqLabel: l("Berlin Hauptsitz", "Berlin HQ"),
        heroImageUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&q=80&w=1000",
        heroImageAlt: fixed("Library interior"),
        facts: [
            { id: "experience", value: "20+", label: l("Jahre Erfahrung", "Years of experience") },
            { id: "books", value: "150+", label: l("Veröffentlichte Bücher", "Books published") },
        ],
        teamMembers: [
            {
                id: "member-1",
                name: fixed("Maxine Muster"),
                role: l("Chefredakteur", "Editor-in-Chief"),
                imageUrl: "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&q=80&w=400&h=500",
            },
            {
                id: "member-2",
                name: fixed("Sophia Lenz"),
                role: l("Art Director", "Art Director"),
                imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400&h=500",
            },
            {
                id: "member-3",
                name: fixed("Markus Weber"),
                role: l("Rechte & Lizenzen", "Rights & Licenses"),
                imageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=400&h=500",
            },
        ],
    },
    media: {
        title: l("Presse & Blogger", "Press & Bloggers"),
        subtitle: l("Materialien für Presse, Rezensionen und Interviews.", "Materials for press, reviews, and interviews."),
        kitTitle: l("Pressemappe", "Press Kit"),
        kitDesc: l(
            "Laden Sie unser Brandbook, hochauflösende Logos und offizielle Verlagsfotos herunter.",
            "Download our brandbook, high-resolution logos, and official publisher photos."),
        downloadText: l("Herunterladen", "Download"),
        reviewTitle: l("Rezensionsexemplar anfordern", "Request Review Copy"),
        reviewDesc: l(
            "Wir stellen Buchrezensenten, Journalisten und Bloggern mit einem Publikum von über 5000 Abonnenten digitale und gedruckte Exemplare neuer Bücher zur Verfügung.",
            "We provide digital and printed copies of new books to book reviewers, journalists, and bloggers with an audience of over 5000 subscribers."),
        contactPrText: l("PR-Manager kontaktieren", "Contact PR Manager"),
        mentionsTitle: l("Aktuelle Erwähnungen", "Recent Mentions"),
        interviewTitle: {
            de: "Interviewanfragen",
            en: "Interview Requests",
        },
        interviewDesc: {
            de: "Autor:innen‑Interviews, Verlagsprofile und Medienanfragen.",
            en: "Author interviews, publishing house features, and media inquiries.",
        },
        interviewCta: {
            de: "Anfrage senden",
            en: "Send Request",
        },
        mentions: [
            {
                id: "mention-berlin-review",
                outlet: "The Berlin Review",
                title: "New Wave of Intellectual Literature in Germany",
                date: "Oct 2023",
                icon: "globe",
                href: "#",
            },
            {
                id: "mention-bookculture",
                outlet: "Bookculture Blog",
                title: "Anna Stern on ‘Shadows of Berlin’: Big Interview",
                date: "Sep 2023",
                icon: "user",
                href: "#",
            },
            {
                id: "mention-art-text",
                outlet: "Art & Text",
                title: "Best Covers of the Year: Editor’s Choice",
                date: "Aug 2023",
                icon: "badge",
                href: "#",
            },
        ],
    },
    footer: {
        brandTitle: fixed("Berlin Press"),
        brandText: l(
            "Unabhängiger Verlag in Berlin.\nWir suchen neue Stimmen und bewahren\ndie Traditionen der Buchkultur.",
            "Independent publisher in Berlin.\nWe seek new voices and preserve\nthe traditions of book culture."),
        directoryTitle: l("Verzeichnis", "Directory"),
        directoryLinks: [
            { id: "catalog", label: l("Katalog", "Catalog"), href: "/catalog" },
            { id: "authors", label: l("Autoren", "Authors"), href: "/authors" },
            { id: "about", label: l("Über uns", "About"), href: "/about" },
            { id: "media", label: l("Presse", "Media"), href: "/media" },
        ],
        subscribeTitle: l("Abonnieren Sie das", "Subscribe to the"),
        subscribeSpan: l("Radikale Archiv", "Radical Archive"),
        emailPlaceholder: l("E-MAIL ADRESSE", "EMAIL ADDRESS"),
        submitLabel: l("Senden", "Submit"),
        socialTitle: l("Sozialindex", "Social Index"),
        socialLinks: [
            { id: "telegram", label: fixed("Telegram"), externalHref: "https://t.me/berlinpress" },
            { id: "instagram", label: fixed("Instagram"), externalHref: "#" },
        ],
        legalLinks: [
            { id: "impressum", label: l("Impressum", "Impressum (Legal)"), href: "/impressum" },
            { id: "privacy", label: l("Datenschutzerklärung", "Privacy Policy"), href: "/privacy" },
            { id: "terms", label: l("AGB", "Terms of Service (AGB)"), href: "/terms" },
        ],
        copyright: "© 2026 Berlin Press",
    },
    journal: {
        title: fixed("The Berlin Review"),
        subtitle: l(
            "Wir versenden weltweit. Unsere Bücher sind zum Reisen gemacht, um gehalten und unterwegs gelesen zu werden.",
            "We ship worldwide. Our books are designed to travel, to be held, to be read in transit."),
        items: [
            {
                id: "1",
                date: { en: "12 Feb 2026", de: "12 Feb 2026"},
                title: {
                    en: "Berlin Press at Art Book Fair",
                    de: "Berlin Press auf der Art Book Fair",
                },
                preview: {
                    en: "We showcase our new releases and meet authors at the largest book fair.",
                    de: "Wir präsentieren unsere Neuerscheinungen und treffen Autorinnen und Autoren auf der größten Buchmesse.",
                },
            },
            {
                id: "2",
                date: { en: "05 Feb 2026", de: "05 Feb 2026"},
                title: {
                    en: "Opening of the New Season",
                    de: "Eröffnung der neuen Saison",
                },
                preview: {
                    en: "Presentation of a new series of philosophical essays and meetings with readers.",
                    de: "Präsentation einer neuen Reihe philosophischer Essays und Treffen mit Leserinnen und Lesern.",
                },
            },
            {
                id: "3",
                date: { en: "20 Jan 2026", de: "20 Jan 2026"},
                title: {
                    en: "Interview with the Editor-in-Chief",
                    de: "Interview mit dem Chefredakteur",
                },
                preview: {
                    en: "On the future of print books in a digital era and the industry's new challenges.",
                    de: "Über die Zukunft des gedruckten Buches im digitalen Zeitalter und die neuen Herausforderungen der Branche.",
                },
            },
        ],
        archiveToast: fixed("ACCESS RESTRICTED: ARCHIVE 2026"),
    },
    authors: {
        title: l("Autoren", "Authors"),
        subtitle: l(
            "Wir suchen radikale Ideen, neue Stimmen und Texte, die die Architektur des Denkens verändern.",
            "We seek radical ideas, new voices, and texts that change the architecture of thinking."),
        manifestoLabel: l("Manifest", "Manifest"),
        whatWePublishTitle: l("Was wir veröffentlichen", "What We Publish"),
        p1: l(
            "Berlin Press ist spezialisiert auf intellektuelle Prosa, Sachbücher in Geisteswissenschaften, Kunst und Philosophie. Wir glauben an das Buch als ästhetisches Objekt.",
            "Berlin Press specializes in intellectual prose, non-fiction in humanities, art, and philosophy. We believe in the book as an aesthetic object."),
        p2: l(
            "Wir beschränken uns nicht auf Genres, sind aber immer an der Tiefe der Recherche, der Einzigartigkeit der Stimme des Autors und der Relevanz des Themas für den modernen Kontext interessiert.",
            "We do not limit ourselves to genres, but we are always interested in the depth of research, the uniqueness of the author's voice, and the relevance of the topic to the modern context."),
        proseTitle: l("Prosa", "Prose"),
        proseSub: l("Belletristik & Essays", "Fiction & Essays"),
        poetryTitle: l("Lyrik", "Poetry"),
        poetrySub: l("Zeitgenössisch", "Contemporary"),
        essaysTitle: l("Essays", "Essays"),
        essaysSub: l("Kritik & Kultur", "Critical & Cultural"),
        processTitle: l("Einreichungsprozess", "Submission Process"),
        steps: [
            {
                id: "step1",
                title: l("Vorbereitung", "Preparation"),
                desc: l(
                    "Exposé (bis zu 2 Seiten), Autoreninfo und Publikationsliste. Manuskriptauszug (20-30 Seiten).",
                    "Synopsis (up to 2 pages), author info and publication list. Manuscript excerpt (20-30 pages)."),
            },
            {
                id: "step2",
                title: l("Einreichung", "Submission"),
                desc: l(
                    "Senden Sie Materialien über unser Formular. Geben Sie die Art der Zusammenarbeit an.",
                    "Send materials via our form. Specify the type of cooperation."),
            },
            {
                id: "step3",
                title: l("Prüfung", "Review"),
                desc: l(
                    "Wir antworten innerhalb von 1-2 Monaten. Aufgrund der hohen Anzahl an Einsendungen begutachten wir keine abgelehnten Texte.",
                    "We reply within 1-2 months. Due to the high volume of submissions, we do not review rejected texts."),
            },
        ],
        ctaText: l("Bereit, ein Manuskript einzureichen?", "Ready to submit a manuscript?"),
        ctaSub: l(
            "Wir sind immer auf der Suche nach neuen Namen. Werden Sie Teil von Berlin Press.",
            "We are always looking for new names. Become part of Berlin Press."),
        ctaButtonText: l("Zum Antragsformular", "Go to Application Form"),
        ctaNote: l("* Wir akzeptieren Dateien im PDF- oder Word-Format", "* We accept files in PDF or Word format"),
        ctaHref: "#",
    },
};
