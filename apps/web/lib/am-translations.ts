import "server-only";

import type { AmLocale } from "./am-locale";

type TranslationTree = {
  [key: string]: string | TranslationTree | { title: string; text: string }[];
};

export const AM_TRANSLATIONS: Record<AmLocale, TranslationTree> = {
  en: {
    common: {
        est: "Est.",
        close: "Close",
        sold_out: "Sold Out",
        preorder_badge: "Pre-Order",
        featured: "Featured",
        no_image: "No image",
        standard: "Standard",
    },
    nav: {
      catalog: "Catalog",
      new: "New",
      bestsellers: "Bestseller",
      preorder: "Preorders",
      authors: "Authors",
      services: "Services",
      about: "About",
      media: "Media",
      search: "Search...",
      recent_searches: "Recent searches",
      clear_history: "Clear",
      no_results: "No results found",
      empty_archive: "Empty archive",
      trending: "Trending Collections",
      quick_links: {
          philosophy: "Philosophy",
          art: "Art Theory",
          new: "New Arrivals"
      }
    },
    checkout: {
      title: "Checkout",
      step1: "Details",
      step2: "Shipping",
      step3: "Payment",
      email: "Email",
      firstName: "First Name",
      lastName: "Last Name",
      phone: "Phone",
      address: "Address",
      city: "City",
      zip: "ZIP Code",
      country: "Country",
      shipping_method: "Shipping Method",
      standard: "Standard",
      express: "Express",
      est_standard: "Est. 3-5 Days",
      est_express: "Est. 1-2 Days",
      payment_method: "Payment",
      card: "Stripe / Card",
      paypal: "PayPal",
      invoice: "Invoice / Bank Transfer",
      place_order: "Place Order",
      back: "Back",
      next: "Next",
      success_title: "Order Placed",
      success_desc: "Thank you for your order. Confirmation has been sent to your email.",
      cc_number: "Card Number",
      cc_holder: "Cardholder Name",
      cc_holder_ph: "NAME ON CARD",
      cc_expiry: "Expiry",
      cc_cvc: "CVC",
      secure_notice: "Transactions are 256-bit encrypted and secured.",
      processing: "Processing...",
      we_accept: "We accept Visa, Mastercard & PayPal",
      payment_error: "Payment failed. Please try another card.",
      paypal_desc: "You will be redirected to PayPal to complete your purchase securely.",
      invoice_desc: "We will send an invoice and payment details to your email.",
      total_paid: "Total Paid",
      order_id: "Order ID",
    },
    product: {
        preorder: "Preorder",
        new: "New",
        bestseller: "Hit",
        in_stock: "In Stock",
        out_of_stock: "Out of Stock",
        add_to_cart: "Add to Cart",
        make_preorder: "Preorder Now",
        description: "Description",
        specs: "Specifications",
        delivery: "Shipping",
        you_may_like: "You May Also Like",
        home_crumb: "Home",
        catalog_crumb: "Catalog",
        details: {
          isbn: "ISBN",
          lang: "Language",
          year: "Year",
          pages: "Pages",
          publisher: "Publisher",
          weight: "Weight",
          dimensions: "Format",
        },
        not_found: "Product Not Found",
        select_variant: "Select Edition",
        format: "Format",
        format_hardcover: "Hardcover",
        format_paperback: "Paperback",
        format_digital: "Digital",
        format_special_edition: "Special Edition",
        language: "Language",
        by_author: "by",
        variant_unavailable: "Variant unavailable",
      },
    home: {
      hero_title_1: "Radical",
      hero_title_2: "Thinking.",
      hero_subtitle: "We create books that don't just sit on a shelf, but change the architecture of your thinking.",
      hero_cta: "Go to Catalog",
      new_arrivals: "New Arrivals",
      all_new: "See all new",
      preorder_title: "Preorder\nOpen",
      preorder_subtitle: "Reserve the most anticipated releases of the season at a special price.",
      view_all: "View All",
      journal: "Journal",
      read_more: "Read",
      newsletter_title: "AM Newsletter",
      newsletter_desc: "Curated selection of news, essays, and private announcements. No spam.",
      newsletter_placeholder: "Your Email",
      subscribe: "Subscribe",
      coming_soon: "Coming Soon",
      marquee_v: "New Collection • Worldwide Shipping • Exclusive Editions • ",
      marquee_h: "The Art of Publishing — The Poetry of Form — The Aesthetics of Thought — Objects of Desire — ",
      global_reach: "Global Reach",
      global_desc: "We ship worldwide. Our books are designed to travel, to be held, to be read in transit.",
      stats_countries: "Countries",
      stats_delivery: "Avg. Delivery",
    },
    footer: {
      desc: "Independent publisher in Berlin.\nWe seek new voices and preserve\nthe traditions of book culture.",
      sections: {
        catalog: "Catalog",
        info: "Information",
        contacts: "Contacts",
      },
      links: {
        all: "Full Catalog",
        author_projects: "Author Projects",
        shipping: "Shipping & Payment",
        privacy: "Privacy Policy",
        terms: "Terms of Service (AGB)",
        impressum: "Impressum (Legal)",
      },
      subscribe_title: "Subscribe to the",
      subscribe_span: "Radical Archive",
      social_index: "Social Index",
      directory: "Directory",
      email_ph: "EMAIL ADDRESS",
      submit: "Submit",
      impressum: "Impressum",
    },
    catalog: {
      archive_inventory: "Archive / Inventory",
      category_label: "Category",
      open_system: "Open system catalog",
      title_all: "All Books",
      title_preorder: "Preorders",
      title_new: "New Arrivals",
      title_bestseller: "Bestsellers",
      title_search: "Search Results",
      showing_results: "Showing {count} results",
      reset: "Reset",
      sort_by: "Sort by",
      view_grid: "Grid",
      view_list: "List",
      sort_options: {
        default: "Default",
        newest: "Newest First",
        price_asc: "Price: Low to High",
        price_desc: "Price: High to Low",
        alpha_asc: "A-Z"
      },
      filters: {
        title: "Filters",
        in_stock: "In Stock Only",
        editions: "Editions",
        publisher: "Publisher",
        author_project: "Author Project",
        age_rating: "Age Rating",
        genres: "Genres",
        authors: "Authors",
        price_range: "Price Range",
        format: "Format",
        availability: "Availability",
        view_results: "View Results ({count})",
        no_results: "No Results Found",
        try_adjusting: "Try adjusting your filters",
        clear_all: "Clear All Filters",
      },
    },
    cart: {
      title: "Your Cart",
      your_order: "Your Order",
      empty: "Cart is empty",
      empty_desc: "Looks like you haven't chosen your next book yet.",
      back_to_catalog: "Back to Catalog",
      go_to_catalog: "Go to Catalog",
      continue_shopping: "Continue Shopping",
      checkout: "Checkout",
      summary: "Order Summary",
      goods: "Items",
      delivery: "Shipping",
      free: "Free",
      total: "Total",
      free_shipping_left: "Left for free shipping",
      delete_confirm: "Remove item?",
      delete_msg: "Do you really want to remove '{name}' from the cart?",
      cancel: "Cancel",
      delete: "Remove",
      viewed_recently: "Recently Viewed",
      item_no: "Item No.",
    },
    services: {
      title: "Publishing Application",
      subtitle: "Fill out the form below for a publishing cost estimate or manuscript review.",
      protocol_title: "Process Protocol",
      protocol_steps: {
        1: "Submission of digital manuscript (PDF/DOCX)",
        2: "Technical review & Cost estimation (2-3 Days)",
        3: "Contract & Production Start"
      },
      form: {
        name: "Name / Organization",
        email: "Contact Email",
        type: "Service Type",
        type_options: {
          publishing: "Full Cycle Publishing",
          editing: "Editing & Proofreading",
          design: "Design & Layout",
          printing: "Print Run",
          distribution: "Distribution",
        },
        description: "Project Description",
        description_placeholder: "Tell us about your book: genre, length, target audience, special requests...",
        file: "Manuscript File",
        file_desc: "PDF or DOCX, max 50MB",
        upload_btn: "Select File",
        submit: "Submit Application",
        success_title: "Application Received",
        success_desc: "We will contact you within 3 business days.",
        back: "Return",
      }
    },
    modal: {
      cookies: "We use cookies to improve the site experience. By continuing, you agree to our privacy policy.",
      accept: "Accept",
      region_detecting: "Detecting your region...",
      region_confirm: "Is your region — {region}?",
      region_desc: "This helps us calculate shipping costs.",
      yes_correct: "Yes, correct",
      choose_other: "Choose another",
      continue_anyway: "Continue without selection",
      choose_region: "Select Region",
      back: "Back",
      age_title: "Warning! 18+",
      age_desc: "You are entering an adult content section. Please confirm you are 18+.",
      age_no: "No, I am younger",
      age_yes: "Yes, I am 18+",
    },
    static: {
        impressum: {
            title: "Impressum (Legal Notice)",
            subtitle: "Legal Information",
            text: "Berlin Press\nInhaberin: Maxine Muster\nEinzelunternehmen\nMusterstraße 1\n10115 Berlin\nDeutschland\n\nContact:\nE-Mail: hello@berlin-press.example\nPhone: +49 30 123456\n\nVAT ID: Pending\n\nResponsible for content acc. to § 55 Abs. 2 RStV:\nMaxine Muster, Musterstraße 1, 10115 Berlin"
        },
        terms: {
            title: "Terms & Conditions (AGB)",
            subtitle: "General Terms of Business",
            intro: "Note: The German version of these terms is legally binding. Please see the DE language switch.",
            text: "Please switch to the German version of the site to view the full legally binding General Terms and Conditions (AGB)."
        },
        privacy: {
            title: "Privacy Policy (Datenschutzerklärung)",
            updated: "Last updated: 2026",
            intro: "We take the protection of your personal data very seriously. Below you will find detailed information about how we collect, use, and protect your data in compliance with the General Data Protection Regulation (GDPR).",
            sections: [
                { 
                    title: "1. Responsible Body (Controller)", 
                    text: "The data controller responsible for this website is:\n\nBerlin Press\nOwner: Maxine Muster\nMusterstraße 1, 10115 Berlin\nGermany\n\nEmail: hello@berlin-press.example\nPhone: +49 30 123456" 
                },
                { 
                    title: "2. Data Collection and Processing", 
                    text: "When you visit our website, the web server automatically saves data in so-called server log files, which your browser transmits to us. These include:\n- Browser type and version\n- Operating system used\n- Referrer URL (the previously visited page)\n- Host name of the accessing computer (IP address)\n- Time of the server request\n\nThese data are necessary for technical reasons to display the website and ensure stability and security (legal basis: Art. 6 Para. 1 lit. f GDPR)." 
                },
                { 
                    title: "3. Cookies", 
                    text: "Our website uses cookies. These are small text files that are stored on your device. We use only technically necessary session cookies (e.g., to store the contents of your shopping cart or login status).\n\nYou can set your browser so that you are informed about the setting of cookies and allow cookies only in individual cases, exclude the acceptance of cookies for certain cases or in general, and activate the automatic deletion of cookies when closing the browser." 
                },
                { 
                    title: "4. Contact Forms and E-mail", 
                    text: "If you send us inquiries via the contact form or e-mail, your details from the inquiry form, including the contact details you provided there, will be stored by us for the purpose of processing the inquiry and in case of follow-up questions. We do not pass on this data without your consent." 
                },
                { 
                    title: "5. Processing for Contract Fulfillment", 
                    text: "We process personal data (e.g., name, address, email, payment details) only to the extent necessary for the establishment, content design, or change of the legal relationship (inventory data). This is done on the basis of Art. 6 Para. 1 lit. b GDPR, which permits the processing of data for the fulfillment of a contract or pre-contractual measures.\n\nWe use your data to:\n- Process and deliver your orders\n- Issue invoices\n- Contact you regarding order status" 
                },
                { 
                    title: "6. Payment Providers", 
                    text: "We use third-party service providers to process payments. We do not store full credit card details on our servers.\n\n6.1. PayPal\nWhen paying via PayPal, data is transferred to PayPal (Europe) S.à r.l. et Cie, S.C.A., 22-24 Boulevard Royal, L-2449 Luxembourg. Data transfer is based on Art. 6 Para. 1 lit. a GDPR (consent) and Art. 6 Para. 1 lit. b GDPR (processing for contract fulfillment).\n\n6.2. Stripe\nFor credit card payments, processing is carried out via Stripe Payments Europe, Ltd., c/o A&L Goodbody, Ifsc, North Wall Quay, Dublin 1, Ireland. Your payment data is transmitted to Stripe solely for payment processing." 
                },
                { 
                    title: "7. Retention Periods", 
                    text: "We store your personal data only as long as necessary to achieve the purposes for which it was collected or as provided by law (e.g., retention periods under commercial and tax law - 10 years for invoices)." 
                },
                { 
                    title: "8. Data Transfer to Third Parties", 
                    text: "Data is only transferred to third parties within the framework of legal requirements. We only pass on user data to third parties if this is necessary for contract purposes (e.g., to logistics companies for goods delivery) or based on legitimate interests in the economic and effective operation of our business." 
                },
                { 
                    title: "9. User Rights", 
                    text: "Under applicable law, you have the right:\n- To request information about your stored personal data (Art. 15 GDPR).\n- To rectification of incorrect data (Art. 16 GDPR).\n- To deletion of data (Art. 17 GDPR), unless retention obligations prevent this.\n- To restriction of processing (Art. 18 GDPR).\n- To data portability (Art. 20 GDPR).\n- To withdraw consent at any time (Art. 7 Para. 3 GDPR)." 
                },
                { 
                    title: "10. Data Security", 
                    text: "We use the SSL (Secure Socket Layer) procedure in conjunction with the highest level of encryption supported by your browser to protect data transmission. You can recognize an encrypted connection by the address line of the browser changing from http:// to https:// and by the lock symbol in your browser line." 
                },
                { 
                    title: "11. Right to Complain", 
                    text: "In the event of violations of data protection law, you have the right to lodge a complaint with the competent supervisory authority. The competent authority for data protection issues is the State Data Protection Officer of the federal state of Berlin (Berliner Beauftragte für Datenschutz und Informationsfreiheit)." 
                }
            ]
        },
        authors: {
          title: "For Authors",
          subtitle: "We seek radical ideas, new voices, and texts that change the architecture of thinking.",
          manifesto: "Manifest",
          what_we_publish: "What We Publish",
          p1: "Berlin Press specializes in intellectual prose, non-fiction in humanities, art, and philosophy. We believe in the book as an aesthetic object.",
          p2: "We do not limit ourselves to genres, but we are always interested in the depth of research, the uniqueness of the author's voice, and the relevance of the topic to the modern context.",
          prose: "Prose",
          prose_sub: "Fiction & Essays",
          poetry: "Poetry",
          poetry_sub: "Contemporary",
          essays: "Essays",
          essays_sub: "Critical & Cultural",
          process_title: "Submission Process",
          step1_t: "Preparation",
          step1_d: "Synopsis (up to 2 pages), author info and publication list. Manuscript excerpt (20-30 pages).",
          step2_t: "Submission",
          step2_d: "Send materials via our form. Specify the type of cooperation.",
          step3_t: "Review",
          step3_d: "We reply within 1-2 months. Due to the high volume of submissions, we do not review rejected texts.",
          ready: "Ready to submit a manuscript?",
          ready_sub: "We are always looking for new names. Become part of Berlin Press.",
          format_note: "* We accept files in PDF or Word format",
          go_to_form: "Go to Application Form"
        },
        about: {
          title: "About Us",
          subtitle: "Independent publisher in the heart of Europe with a global view on culture.",
          mission: "Mission",
          experience: "Years of experience",
          books_published: "Books published",
          p1: "Berlin Press was founded in Berlin as a platform for dialogue between cultures and generations. We believe that a book is not just a carrier of information, but an art object and a tool for thinking.",
          p2: "Our catalog combines translations of modern classics, bold debuts, and deep research in art theory. We strive for the highest quality in printing and design.",
          team: "Team",
          hq: "Berlin HQ",
          role1: "Editor-in-Chief",
          role2: "Art Director",
          role3: "Rights & Licenses",
        },
        media: {
          title: "Press & Bloggers",
          subtitle: "Materials for press, reviews, and interviews.",
          kit_title: "Press Kit",
          kit_desc: "Download our brandbook, high-resolution logos, and official publisher photos.",
          download: "Download",
          review_title: "Request Review Copy",
          review_desc: "We provide digital and printed copies of new books to book reviewers, journalists, and bloggers with an audience of over 5000 subscribers.",
          contact_pr: "Contact PR Manager",
          mentions: "Recent Mentions",
        }
    },
    error: {
        not_found: {
            title: "404",
            subtitle: "Page Not Found",
            desc: "It seems you have wandered into an archive section that does not exist or has been moved.",
            back: "Back to Home"
        }
    }
  },
  de: {
    common: {
        est: "Gegr.",
        close: "Schließen",
        sold_out: "Ausverkauft",
        preorder_badge: "Vorbestellung",
        featured: "Vorgestellt",
        no_image: "Kein Bild",
        standard: "Standard",
    },
    nav: {
      catalog: "Katalog",
      new: "Neuheiten",
      bestsellers: "Bestseller",
      preorder: "Vorbestellungen",
      authors: "Autoren",
      services: "Dienstleistungen",
      about: "Über uns",
      media: "Presse",
      search: "Suche...",
      recent_searches: "Letzte Suchen",
      clear_history: "Löschen",
      no_results: "Keine Ergebnisse",
      empty_archive: "Leeres Archiv",
      trending: "Angesagte Sammlungen",
      quick_links: {
          philosophy: "Philosophie",
          art: "Kunsttheorie",
          new: "Neueingänge"
      }
    },
    checkout: {
      title: "Kasse",
      step1: "Details",
      step2: "Versand",
      step3: "Zahlung",
      email: "E-Mail",
      firstName: "Vorname",
      lastName: "Nachname",
      phone: "Telefon",
      address: "Adresse",
      city: "Stadt",
      zip: "PLZ",
      country: "Land",
      shipping_method: "Versandart",
      standard: "Standard",
      express: "Express",
      est_standard: "Ca. 3-5 Tage",
      est_express: "Ca. 1-2 Tage",
      payment_method: "Zahlungsmethode",
      card: "Stripe / Karte",
      paypal: "PayPal",
      invoice: "Rechnung / Überweisung",
      place_order: "Bestellung aufgeben",
      back: "Zurück",
      next: "Weiter",
      success_title: "Bestellung aufgegeben",
      success_desc: "Vielen Dank für Ihre Bestellung. Eine Bestätigung wurde an Ihre E-Mail gesendet.",
      cc_number: "Kartennummer",
      cc_holder: "Karteninhaber",
      cc_holder_ph: "NAME AUF KARTE",
      cc_expiry: "Ablaufdatum",
      cc_cvc: "CVC",
      secure_notice: "Transaktionen sind 256-Bit verschlüsselt und gesichert.",
      processing: "Verarbeitung...",
      we_accept: "Wir akzeptieren Visa, Mastercard & PayPal",
      payment_error: "Zahlung fehlgeschlagen. Bitte versuchen Sie eine andere Karte.",
      paypal_desc: "Sie werden zu PayPal weitergeleitet, um Ihren Einkauf sicher abzuschließen.",
      invoice_desc: "Wir senden Ihnen eine Rechnung und Zahlungsinformationen per E-Mail.",
      total_paid: "Gesamtbetrag",
      order_id: "Bestellnummer",
    },
    product: {
        preorder: "Vorbestellung",
        new: "Neu",
        bestseller: "Hit",
        in_stock: "Auf Lager",
        out_of_stock: "Ausverkauft",
        add_to_cart: "In den Warenkorb",
        make_preorder: "Jetzt vorbestellen",
        description: "Beschreibung",
        specs: "Spezifikationen",
        delivery: "Versand",
        you_may_like: "Das könnte Ihnen auch gefallen",
        home_crumb: "Startseite",
        catalog_crumb: "Katalog",
        details: {
          isbn: "ISBN",
          lang: "Sprache",
          year: "Jahr",
          pages: "Seiten",
          publisher: "Verlag",
          weight: "Gewicht",
          dimensions: "Format",
        },
        not_found: "Produkt nicht gefunden",
        select_variant: "Ausgabe wählen",
        format: "Format",
        format_hardcover: "Hardcover",
        format_paperback: "Taschenbuch",
        format_digital: "Digital",
        format_special_edition: "Sonderausgabe",
        language: "Sprache",
        by_author: "von",
        variant_unavailable: "Variante nicht verfügbar",
      },
    home: {
      hero_title_1: "Radikales",
      hero_title_2: "Denken.",
      hero_subtitle: "Wir kreieren Bücher, die nicht nur im Regal stehen, sondern die Architektur Ihres Denkens verändern.",
      hero_cta: "Zum Katalog",
      new_arrivals: "Neuheiten",
      all_new: "Alle Neuheiten ansehen",
      preorder_title: "Vorbestellung\nOffen",
      preorder_subtitle: "Reservieren Sie die am meisten erwarteten Neuerscheinungen der Saison zum Sonderpreis.",
      view_all: "Alle ansehen",
      journal: "Journal",
      read_more: "Lesen",
      newsletter_title: "AM Newsletter",
      newsletter_desc: "Kuratierte Auswahl an Nachrichten, Essays und privaten Ankündigungen. Kein Spam.",
      newsletter_placeholder: "Ihre E-Mail",
      subscribe: "Abonnieren",
      coming_soon: "Demnächst",
      marquee_v: "Neue Kollektion • Weltweiter Versand • Exklusive Ausgaben • ",
      marquee_h: "The Art of Publishing — The Poetry of Form — The Aesthetics of Thought — Objects of Desire — ",
      global_reach: "Globale Reichweite",
      global_desc: "Wir versenden weltweit. Unsere Bücher sind zum Reisen gemacht, um gehalten und unterwegs gelesen zu werden.",
      stats_countries: "Länder",
      stats_delivery: "Durchschn. Lieferzeit",
    },
    footer: {
      desc: "Unabhängiger Verlag in Berlin.\nWir suchen neue Stimmen und bewahren\ndie Traditionen der Buchkultur.",
      sections: {
        catalog: "Katalog",
        info: "Information",
        contacts: "Kontakte",
      },
      links: {
        all: "Gesamter Katalog",
        author_projects: "Autorenprojekte",
        shipping: "Versand & Zahlung",
        privacy: "Datenschutzerklärung",
        terms: "AGB",
        impressum: "Impressum",
      },
      subscribe_title: "Abonnieren Sie das",
      subscribe_span: "Radikale Archiv",
      social_index: "Sozialindex",
      directory: "Verzeichnis",
      email_ph: "E-MAIL ADRESSE",
      submit: "Senden",
      impressum: "Impressum",
    },
    catalog: {
      archive_inventory: "Archiv / Inventar",
      category_label: "Kategorie",
      open_system: "Systemkatalog öffnen",
      title_all: "Alle Bücher",
      title_preorder: "Vorbestellungen",
      title_new: "Neuheiten",
      title_bestseller: "Bestseller",
      title_search: "Suchergebnisse",
      showing_results: "Zeige {count} Ergebnisse",
      reset: "Zurücksetzen",
      sort_by: "Sortieren nach",
      view_grid: "Raster",
      view_list: "Liste",
      sort_options: {
        default: "Standard",
        newest: "Neueste zuerst",
        price_asc: "Preis: Niedrig bis Hoch",
        price_desc: "Preis: Hoch bis Niedrig",
        alpha_asc: "A-Z"
      },
      filters: {
        title: "Filter",
        in_stock: "Nur auf Lager",
        editions: "Ausgaben",
        publisher: "Verlag",
        author_project: "Autorenprojekt",
        age_rating: "Altersfreigabe",
        genres: "Genres",
        authors: "Autoren",
        price_range: "Preisspanne",
        format: "Format",
        availability: "Verfügbarkeit",
        view_results: "Ergebnisse anzeigen ({count})",
        no_results: "Keine Ergebnisse gefunden",
        try_adjusting: "Versuchen Sie, Ihre Filter anzupassen",
        clear_all: "Alle Filter löschen",
      },
    },
    cart: {
      title: "Ihr Warenkorb",
      your_order: "Ihre Bestellung",
      empty: "Warenkorb ist leer",
      empty_desc: "Sieht so aus, als hätten Sie Ihr nächstes Buch noch nicht ausgewählt.",
      back_to_catalog: "Zurück zum Katalog",
      go_to_catalog: "Zum Katalog",
      continue_shopping: "Einkauf fortsetzen",
      checkout: "Zur Kasse",
      summary: "Bestellübersicht",
      goods: "Artikel",
      delivery: "Versand",
      free: "Kostenlos",
      total: "Gesamt",
      free_shipping_left: "Verbleibend für kostenlosen Versand",
      delete_confirm: "Artikel entfernen?",
      delete_msg: "Möchten Sie '{name}' wirklich aus dem Warenkorb entfernen?",
      cancel: "Abbrechen",
      delete: "Entfernen",
      viewed_recently: "Zuletzt angesehen",
      item_no: "Pos. Nr.",
    },
    services: {
      title: "Publikationsantrag",
      subtitle: "Füllen Sie das untenstehende Formular für einen Kostenvoranschlag oder eine Manuskriptprüfung aus.",
      protocol_title: "Prozessprotokoll",
      protocol_steps: {
        1: "Einreichung des digitalen Manuskripts (PDF/DOCX)",
        2: "Technische Prüfung & Kostenvoranschlag (2-3 Tage)",
        3: "Vertrag & Produktionsbeginn"
      },
      form: {
        name: "Name / Organisation",
        email: "Kontakt E-Mail",
        type: "Dienstleistungsart",
        type_options: {
          publishing: "Vollständige Veröffentlichung",
          editing: "Lektorat & Korrektorat",
          design: "Design & Layout",
          printing: "Druckauflage",
          distribution: "Vertrieb",
        },
        description: "Projektbeschreibung",
        description_placeholder: "Erzählen Sie uns von Ihrem Buch: Genre, Länge, Zielgruppe, besondere Wünsche...",
        file: "Manuskriptdatei",
        file_desc: "PDF oder DOCX, max. 50MB",
        upload_btn: "Datei auswählen",
        submit: "Antrag einreichen",
        success_title: "Antrag erhalten",
        success_desc: "Wir werden uns innerhalb von 3 Werktagen bei Ihnen melden.",
        back: "Zurück",
      }
    },
    modal: {
      cookies: "Wir verwenden Cookies, um das Website-Erlebnis zu verbessern. Durch die weitere Nutzung stimmen Sie unserer Datenschutzerklärung zu.",
      accept: "Akzeptieren",
      region_detecting: "Region wird erkannt...",
      region_confirm: "Ist Ihre Region — {region}?",
      region_desc: "Dies hilft uns bei der Berechnung der Versandkosten.",
      yes_correct: "Ja, richtig",
      choose_other: "Andere wählen",
      continue_anyway: "Ohne Auswahl fortfahren",
      choose_region: "Region auswählen",
      back: "Zurück",
      age_title: "Warnung! 18+",
      age_desc: "Sie betreten einen Bereich mit Inhalten für Erwachsene. Bitte bestätigen Sie, dass Sie über 18 Jahre alt sind.",
      age_no: "Nein, ich bin jünger",
      age_yes: "Ja, ich bin 18+",
    },
    static: {
        impressum: {
            title: "Impressum",
            subtitle: "Angaben gemäß § 5 TMG",
            text: "Berlin Press\nInhaberin: Maxine Muster\nEinzelunternehmen\nMusterstraße 1\n10115 Berlin\nDeutschland\n\nKontakt:\nE-Mail: hello@berlin-press.example\nTelefon: +49 30 123456\n\nUmsatzsteuer-ID gemäß § 27 a Umsatzsteuergesetz: Wird nachgereicht\n\nVerantwortlich für den Inhalt nach § 55 Abs. 2 RStV:\nMaxine Muster, Musterstraße 1, 10115 Berlin"
        },
        terms: {
            title: "AGB",
            subtitle: "Allgemeine Geschäftsbedingungen",
            intro: "Maßgebliche Version (Deutsch)",
            sections: [
                { title: "1. Geltungsbereich", text: "Diese AGB gelten für alle Verträge zwischen Berlin Press, Inhaberin: Maxine Muster, Musterstraße 1, 10115 Berlin und ihren Kunden." },
                { title: "2. Vertragsgegenstand", text: "Verkauf von gedruckten Büchern, E-Books sowie Verlagsdienstleistungen." },
                { title: "3. Vertragsschluss", text: "Der Vertrag kommt durch Abschluss des Bestellvorgangs und erfolgreiche Zahlung zustande." },
                { title: "4. Preise und Zahlungsbedingungen", text: "Zahlung via PayPal oder Stripe (Kreditkarte). Vorkasse, sofern nicht anders vereinbart." },
                { title: "5. Lieferung und Bereitstellung", text: "Gedruckte Bücher per Versand. Digitale Inhalte per Download nach Zahlungseingang." },
                { title: "6. Widerrufsrecht", text: "14 Tage für gedruckte Bücher. Bei digitalen Inhalten erlischt das Recht bei Zustimmung zur sofortigen Ausführung." },
                { title: "7. Dienstleistungen", text: "Widerrufsrecht kann bei sofortiger Ausführung ausgeschlossen sein." },
                { title: "8. Urheberrecht", text: "Inhalte unterliegen dem Urheberrecht. Weitergabe nur im Rahmen vereinbarter Nutzungsrechte." },
                { title: "9. Haftung", text: "Haftung nur bei Vorsatz oder grober Fahrlässigkeit, außer bei Verletzung wesentlicher Pflichten." },
                { title: "10. Schlussbestimmungen", text: "Es gilt deutsches Recht. Sollten einzelne Bestimmungen unwirksam sein, bleiben die übrigen unberührt." }
            ]
        },
        privacy: {
            title: "Datenschutzerklärung",
            updated: "Stand: 2026",
            intro: "Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Nachfolgend finden Sie detaillierte Informationen darüber, wie wir Ihre Daten erfassen, nutzen und schützen, in Übereinstimmung mit der Datenschutz-Grundverordnung (DSGVO).",
            sections: [
                { 
                    title: "1. Verantwortliche Stelle", 
                    text: "Verantwortlich für die Datenverarbeitung auf dieser Website ist:\n\nBerlin Press\nInhaberin: Maxine Muster\nMusterstraße 1, 10115 Berlin\nDeutschland\n\nEmail: hello@berlin-press.example\nTelefon: +49 30 123456" 
                },
                { 
                    title: "2. Datenerfassung und -verarbeitung", 
                    text: "Beim Aufrufen unserer Website speichert der Webserver automatisch Daten in sogenannten Server-Log-Files, die Ihr Browser an uns übermittelt. Dies sind:\n- Browsertyp und -version\n- Verwendetes Betriebssystem\n- Referrer URL (die zuvor besuchte Seite)\n- Hostname des zugreifenden Rechners (IP-Adresse)\n- Uhrzeit der Serveranfrage\n\nDiese Daten sind technisch erforderlich, um die Website anzuzeigen sowie die Stabilität und Sicherheit zu gewährleisten (Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO)." 
                },
                { 
                    title: "3. Cookies", 
                    text: "Unsere Website verwendet Cookies. Das sind kleine Textdateien, die auf Ihrem Endgerät gespeichert werden. Wir setzen nur technisch notwendige Session-Cookies ein (z.B. zur Speicherung des Warenkorbinhalts oder des Login-Status).\n\nSie können Ihren Browser so einstellen, dass Sie über das Setzen von Cookies informiert werden und Cookies nur im Einzelfall erlauben, die Annahme von Cookies für bestimmte Fälle oder generell ausschließen sowie das automatische Löschen der Cookies beim Schließen des Browsers aktivieren." 
                },
                { 
                    title: "4. Kontaktformular und E-Mail", 
                    text: "Wenn Sie uns per Kontaktformular oder E-Mail Anfragen zukommen lassen, werden Ihre Angaben aus dem Anfrageformular inklusive der von Ihnen dort angegebenen Kontaktdaten zwecks Bearbeitung der Anfrage und für den Fall von Anschlussfragen bei uns gespeichert. Diese Daten geben wir nicht ohne Ihre Einwilligung weiter." 
                },
                { 
                    title: "5. Datenverarbeitung zur Vertragserfüllung", 
                    text: "Wir verarbeiten personenbezogene Daten (z.B. Name, Adresse, E-Mail, Zahlungsdaten) nur, soweit sie für die Begründung, inhaltliche Ausgestaltung oder Änderung des Rechtsverhältnisses erforderlich sind (Bestandsdaten). Dies erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO, der die Verarbeitung von Daten zur Erfüllung eines Vertrags oder vorvertraglicher Maßnahmen gestattet.\n\nWir nutzen Ihre Daten um:\n- Ihre Bestellungen abzuwickeln und zu liefern\n- Rechnungen zu stellen\n- Sie über den Bestellstatus zu informieren" 
                },
                { 
                    title: "6. Zahlungsdienstleister", 
                    text: "Zur Abwicklung von Zahlungen nutzen wir externe Dienstleister. Wir speichern keine vollständigen Kreditkartendaten auf unseren Servern.\n\n6.1. PayPal\nBei Zahlung via PayPal werden Daten an PayPal (Europe) S.à r.l. et Cie, S.C.A., 22-24 Boulevard Royal, L-2449 Luxembourg übermittelt. Die Datenübermittlung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) und Art. 6 Abs. 1 lit. b DSGVO (Verarbeitung zur Vertragserfüllung).\n\n6.2. Stripe\nBei Kreditkartenzahlung erfolgt die Abwicklung über Stripe Payments Europe, Ltd., c/o A&L Goodbody, Ifsc, North Wall Quay, Dublin 1, Ireland. Ihre Zahlungsdaten werden ausschließlich zur Zahlungsabwicklung an Stripe übermittelt." 
                },
                { 
                    title: "7. Speicherdauer", 
                    text: "Wir speichern Ihre personenbezogenen Daten nur so lange, wie es zur Erreichung der Zwecke erforderlich ist, für die sie erhoben wurden, oder wie es gesetzlich vorgesehen ist (z.B. Aufbewahrungsfristen nach Handels- und Steuerrecht - 10 Jahre für Rechnungen)." 
                },
                { 
                    title: "8. Weitergabe an Dritte", 
                    text: "Eine Übermittlung von Daten an Dritte erfolgt nur im Rahmen der gesetzlichen Vorgaben. Wir geben die Daten der Nutzer an Dritte nur dann weiter, wenn dies z.B. auf Grundlage des Art. 6 Abs. 1 lit. b DSGVO für Vertragszwecke erforderlich ist (z.B. an Logistikunternehmen zur Warenlieferung) oder auf Grundlage berechtigter Interessen an einem wirtschaftlichen und effektiven Betrieb unseres Geschäftsbetriebes." 
                },
                { 
                    title: "9. Rechte der Nutzer", 
                    text: "Sie haben nach geltendem Recht jederzeit das Recht:\n- Auf unentgeltliche Auskunft über Ihre gespeicherten personenbezogenen Daten (Art. 15 DSGVO).\n- Auf Berichtigung unrichtiger Daten (Art. 16 DSGVO).\n- Auf Löschung Ihrer Daten (Art. 17 DSGVO), sofern keine Aufbewahrungspflichten entgegenstehen.\n- Auf Einschränkung der Verarbeitung (Art. 18 DSGVO).\n- Auf Datenübertragbarkeit (Art. 20 DSGVO).\n- Auf Widerruf Ihrer Einwilligung zur Datenverarbeitung (Art. 7 Abs. 3 DSGVO)." 
                },
                { 
                    title: "10. Datensicherheit", 
                    text: "Wir nutzen aus Sicherheitsgründen und zum Schutz der Übertragung vertraulicher Inhalte eine SSL-bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie daran, dass die Adresszeile des Browsers von “http://” auf “https://” wechselt und an dem Schloss-Symbol in Ihrer Browserzeile." 
                },
                { 
                    title: "11. Beschwerderecht", 
                    text: "Im Falle von Verstößen gegen die DSGVO steht Ihnen ein Beschwerderecht bei einer Aufsichtsbehörde zu. Die zuständige Aufsichtsbehörde für datenschutzrechtliche Fragen ist der Landesdatenschutzbeauftragte des Bundeslandes Berlin (Berliner Beauftragte für Datenschutz und Informationsfreiheit)." 
                }
            ]
        },
        authors: {
          title: "Für Autoren",
          subtitle: "Wir suchen radikale Ideen, neue Stimmen und Texte, die die Architektur des Denkens verändern.",
          manifesto: "Manifest",
          what_we_publish: "Was wir veröffentlichen",
          p1: "Berlin Press ist spezialisiert auf intellektuelle Prosa, Sachbücher in Geisteswissenschaften, Kunst und Philosophie. Wir glauben an das Buch als ästhetisches Objekt.",
          p2: "Wir beschränken uns nicht auf Genres, sind aber immer an der Tiefe der Recherche, der Einzigartigkeit der Stimme des Autors und der Relevanz des Themas für den modernen Kontext interessiert.",
          prose: "Prosa",
          prose_sub: "Belletristik & Essays",
          poetry: "Lyrik",
          poetry_sub: "Zeitgenössisch",
          essays: "Essays",
          essays_sub: "Kritik & Kultur",
          process_title: "Einreichungsprozess",
          step1_t: "Vorbereitung",
          step1_d: "Exposé (bis zu 2 Seiten), Autoreninfo und Publikationsliste. Manuskriptauszug (20-30 Seiten).",
          step2_t: "Einreichung",
          step2_d: "Senden Sie Materialien über unser Formular. Geben Sie die Art der Zusammenarbeit an.",
          step3_t: "Prüfung",
          step3_d: "Wir antworten innerhalb von 1-2 Monaten. Aufgrund der hohen Anzahl an Einsendungen begutachten wir keine abgelehnten Texte.",
          ready: "Bereit, ein Manuskript einzureichen?",
          ready_sub: "Wir sind immer auf der Suche nach neuen Namen. Werden Sie Teil von Berlin Press.",
          format_note: "* Wir akzeptieren Dateien im PDF- oder Word-Format",
          go_to_form: "Zum Antragsformular"
        },
        about: {
          title: "Über uns",
          subtitle: "Unabhängiger Verlag im Herzen Europas mit einem globalen Blick auf Kultur.",
          mission: "Mission",
          experience: "Jahre Erfahrung",
          books_published: "Veröffentlichte Bücher",
          p1: "Berlin Press wurde in Berlin als Plattform für den Dialog zwischen Kulturen und Generationen gegründet. Wir glauben, dass ein Buch nicht nur ein Informationsträger ist, sondern ein Kunstobjekt und ein Werkzeug zum Denken.",
          p2: "Unser Katalog vereint Übersetzungen moderner Klassiker, mutige Debüts und tiefe Forschungen in der Kunsttheorie. Wir streben nach höchster Qualität in Druck und Design.",
          team: "Team",
          hq: "Berlin Hauptsitz",
          role1: "Chefredakteur",
          role2: "Art Director",
          role3: "Rechte & Lizenzen",
        },
        media: {
          title: "Presse & Blogger",
          subtitle: "Materialien für Presse, Rezensionen und Interviews.",
          kit_title: "Pressemappe",
          kit_desc: "Laden Sie unser Brandbook, hochauflösende Logos und offizielle Verlagsfotos herunter.",
          download: "Herunterladen",
          review_title: "Rezensionsexemplar anfordern",
          review_desc: "Wir stellen Buchrezensenten, Journalisten und Bloggern mit einem Publikum von über 5000 Abonnenten digitale und gedruckte Exemplare neuer Bücher zur Verfügung.",
          contact_pr: "PR-Manager kontaktieren",
          mentions: "Aktuelle Erwähnungen",
        }
      },
    error: {
        not_found: {
            title: "404",
            subtitle: "Seite nicht gefunden",
            desc: "Es scheint, als hätten Sie sich in einen Archivbereich verirrt, der nicht existiert oder verschoben wurde.",
            back: "Zur Startseite"
        }
    }
  }
};

function lookup(tree: TranslationTree, path: string): string | TranslationTree | { title: string; text: string }[] | null {
  const parts = path.split(".");
  let cursor: unknown = tree;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return (cursor as string | TranslationTree | { title: string; text: string }[] | null) ?? null;
}

export function getAmTranslator(locale: AmLocale) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const raw = lookup(AM_TRANSLATIONS[locale], key);
    if (typeof raw !== "string") return key;
    if (!vars) return raw;
    return Object.keys(vars).reduce((acc, k) => acc.replaceAll(`{${k}}`, String(vars[k])), raw);
  };
}
