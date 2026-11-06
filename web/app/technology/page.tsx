import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How MAILicious works",
  description: "What each MAILicious check does, how it works and where it stops.",
};

type Section = { id: string; title: string; does: string; how: string[]; limit: string };

const SECTIONS: Section[] = [
  {
    id: "sender",
    title: "Sender authentication",
    does: "Reads the receiving mail server's own verdict on whether the sender is genuine. A pasted body alone can never show this.",
    how: [
      "SPF, DKIM and DMARC come only from the top Authentication-Results header, because that one is written by the receiver. Anything below it can be forged by the sender.",
      "Methods are read from the start of each semicolon-separated segment, so an address containing \"dmarc=pass\" can't pose as a result. If a method appears twice the worst verdict wins, and an unknown word counts as a failure.",
      "If a header comment is broken, the whole header is rescanned, but that scan can only make a result worse. A \"pass\" found there proves nothing.",
      "A DMARC failure, or SPF and DKIM both failing, gives AUTH_FAIL at High. One weaker failure gives AUTH_WEAK at Medium.",
      "A sender counts as proven only with DMARC passing, one From header holding one address, and every DMARC pass aligned to that From domain.",
      "A Reply-To on a different domain is flagged, and so is one we can't read. On a proven no-reply address it drops to a low note, unless the mail asks you to reply.",
    ],
    limit: "It needs real headers. The extension, Show original and .eml files have them; plain pasted text doesn't. DMARC proves who owns the domain, not who is typing, so a hacked account passes.",
  },
  {
    id: "trust",
    title: "Trust tiers",
    does: "Changes the answer depending on how far the sender is proven, so genuine college mail isn't buried in warnings and a hacked account still is.",
    how: [
      "Unproven: every rule applies. Only a DMARC-proved From address earns trust; a sender typed into the form proves nothing.",
      "Proven personal college account: no relief. If it pushes an offer or link, the student is asked to confirm with HACKED_ACCOUNT at Medium.",
      "Proven college office, recognised by its account name, or a proven sender the placement cell marked genuine: soft flags are removed, a fee becomes a Medium payment notice and an image-only body drops to Low.",
      "Marked fake by the placement cell: BLOCKED_SENDER at High.",
      "Proof never clears an OTP, ID or malware flag. A proven college account asking for an OTP or ID gets HACKED_ACCOUNT at High.",
    ],
    limit: "Office accounts are matched by a name pattern on one hard-coded college domain, so other colleges would need their own setup.",
  },
  {
    id: "rules",
    title: "Rules engine",
    does: "Instant offline checks for what the mail asks you to do, who sent it and where its links go. It needs no keys.",
    how: [
      "Each flag sets a minimum risk level, and the final level is the highest risk found.",
      "Text is checked sentence by sentence. A sentence is cleared only when every verb or every object is directly negated, so \"Don't worry, just share your OTP\" and \"no fee, but transfer Rs 500\" still flag.",
      "The sender is compared with a small list of companies and free-mail hosts. Lookalike domains are caught by edit distance of 2 or less, and rn is read as m.",
      "Link rules catch bare IP addresses, shorteners, disguised characters and links whose visible text names a different site.",
      "Attachments are judged by file name: programs are High, and web pages, archives and macro files are Medium.",
    ],
    limit: "Rules match words, not meaning, so they miss scams with no fee or OTP request. They're deliberately cautious and would rather flag a real mail than miss a scam.",
  },
  {
    id: "links",
    title: "Link, short-link and Google Form inspection",
    does: "Finds where a short link really goes and what a Google Form really asks for.",
    how: [
      "The server only ever connects to a fixed list of shorteners, forms.gle and docs.google.com forms. A scammer's link can't reach internal addresses or their own tracking server.",
      "Redirects are followed by hand, up to 3 hops, with one 5 second limit per link. Each hop must pass the same host check.",
      "Up to 5 links are checked, forms first, so decoy short links can't push a form past the limit. Repeated links count once.",
      "Any form address is rewritten to its read-only page with no query, because a GET on formResponse can submit the form.",
      "The form's own data blob is read, not the page text, because every Google Form carries a \"Never submit passwords\" footer that would flag them all.",
      "A form asking for an OTP, password, ID, bank details or payment gets FORM_ASKS_DATA at High. A form that never mentions the claimed company gets FORM_MISMATCH at Medium.",
    ],
    limit: "Only Google Forms are read, and forms that need sign-in can't be. Any mention counts, so a form saying \"we never ask for your OTP\" flags too. Checking a short link counts as a click on the shortener's stats.",
  },
  {
    id: "ai",
    title: "AI signals, prompt-injection defence and redaction",
    does: "Gemini catches meaning the rules can't, such as a payment that's called a kit charge, and pulls out the company and role.",
    how: [
      "The mail is written by the scammer, so we assume it may try to instruct the model. It sits between markers holding a random UUID, so it can't close the block early, and the prompt says to treat it as data.",
      "The model must answer in a fixed JSON schema. Signals come from a closed list of seven, and each maps to a flag with our own wording, so a mail can't write its own verdict.",
      "AI can add risk but can't lower a rule's flag. A company name that looks like a link or a sentence is refused.",
      "Text is redacted before it's sent: PAN-shaped IDs, password values, codes near words like OTP, and long digit runs. Pay amounts stay, for the pay check.",
      "Up to 8,000 characters are sent. Three models are tried in order, with 6 seconds each and 15 seconds for the AI overall. Any failure falls back to rules and links, marked limited.",
    ],
    limit: "Redaction is best effort, and a multi-word password can slip through. Whether the AI ran does change two soft cases: a non-job money mention stays a notice only if the AI didn't run, and a courier's door code drops to Medium only if it did. An AI outage lowers detection.",
  },
  {
    id: "company",
    title: "Company lookup",
    does: "Finds the company's real website and flags a sender who isn't on it.",
    how: [
      "It runs for job mail only, to protect the search quota, and only when the Gemini and Tavily keys are set.",
      "Tavily returns up to 5 results, and Gemini answers only from those results, treating them as data.",
      "A domain counts only if a real search result sits on it, and it isn't a job board, social network or shared host, so the model can't invent one.",
      "A summary with anything link-like in it is replaced with our own wording, so it can't send a student anywhere. Found sites are cached for an hour per server.",
      "A sender not on the company's site gets COMPANY_DOMAIN_MISMATCH at Medium.",
    ],
    limit: "\"Couldn't confirm\" means we found no official site, not that it's fake. \"Confirmed\" only means the company has its own website, and a scammer can build one. Companies with a second domain can get a wrong Medium.",
  },
  {
    id: "intel",
    title: "Threat intelligence",
    does: "Asks public registries and reputation services about the sender's domain and the mail's links, never the scammer's own site.",
    how: [
      "Domain age comes from RDAP: under 30 days is High and under 180 days is Medium.",
      "Google DNS shows whether the domain has a mail server (no MX gives Medium) and whether it publishes a DMARC policy.",
      "Google Safe Browsing checks links, and VirusTotal checks up to 3 unfamiliar domains. Two or more vendors flagging one gives KNOWN_MALICIOUS at High.",
      "Query strings are dropped first, so a personal token in a link isn't sent to a third party.",
      "Each lookup has 4 seconds. One that fails is shown as skipped and adds no flags. Known-safe domains are skipped.",
    ],
    limit: "Safe Browsing and VirusTotal need optional keys. A brand-new scam link may not be listed anywhere yet, and a clean result only means it isn't on the lists we checked.",
  },
  {
    id: "extension",
    title: "Gmail extension internals",
    does: "Checks each mail you open and warns at the moment of risk, with no Google sign-in, OAuth or MCP server.",
    how: [
      "A Manifest V3 content script watches Gmail with a MutationObserver, batches changes for 400 ms, and reads the open mail's text, sender, links and attachment names.",
      "For real headers it fetches Gmail's own Show original page (view=om). That's same-origin, so it needs no extra login or permission.",
      "That page is read as text with a regular expression, because Gmail enforces Trusted Types, which can block DOMParser on a string. Only the headers are kept.",
      "Mail content comes from scammers, so it's only ever shown with textContent. The card sits in a Shadow DOM, apart from Gmail's styles.",
      "A background worker makes the network call, and only while the switch is on.",
      "A failed check never looks like an all-clear: it retries, then says so on the mail. Clicking a link in a High or unchecked mail is intercepted and paused.",
      "Typing into a reply is checked for card, Aadhaar and PAN patterns, and for an OTP-like number when the mail was flagged.",
    ],
    limit: "It relies on Gmail's page structure, which Google can change without notice. If a selector breaks, it goes quiet and doesn't warn. The link warning and reply warning have only been tested on a fake page. The inbox dot is judged on the row alone.",
  },
  {
    id: "popup",
    title: "Toolbar report and badge",
    does: "Keeps Gmail uncluttered by leaving one short line or banner on the mail, and puts the full, plain-English report in the extension's popup, with a verdict badge on the toolbar icon.",
    how: [
      "When a verdict arrives, the content script sends the background worker a slim report: level, reasons, next step and checks. It never includes the mail's text.",
      "The worker keeps it in chrome.storage.session, keyed by tab, so it stays in memory and disappears when the browser closes.",
      "chrome.action badges are set per tab: a tick, ! or !! in green, amber or red. Going back to the inbox clears the badge.",
      "The popup reads that tab's report, leads with what was found, and folds passed checks away, each with a line on why it matters. It renders with textContent only, because reports can quote scammers.",
    ],
    limit: "The popup can't open itself, so a student has to click the icon. Risky mail therefore keeps its in-page banner, to warn at the moment it matters.",
  },
  {
    id: "drill",
    title: "Scam Drill",
    does: "Trains the student's own eye with five fictional mails: guess real or fake, then see the exact tell.",
    how: [
      "It's a client-side React state machine with fixed fictional content, so nothing is sent anywhere and no answers are stored.",
      "Each mail carries its own explanation, so the lesson is what to look for, not only the score.",
    ],
    limit: "Five mails is a taster, not a course, and they're fixed, so repeat plays teach less.",
  },
  {
    id: "radar",
    title: "Live Campus Radar",
    does: "Shows real, aggregated totals of what MAILicious is seeing: mails checked, flagged, senders blocked and attack types.",
    how: [
      "Each check logs only its level and attack type in Supabase, with no sender and no mail text.",
      "GET /api/radar sums the latest 2,000 events, caches the answer for 30 seconds so page views can't hammer the database, and calls connection() so Next never freezes it at build time.",
      "The table has row-level security with no public policies, so only the server's secret key can read it. Browsers only ever see the totals.",
    ],
    limit: "Numbers include our own testing, so they show activity, not a measured campus scam rate. Totals cover the latest 2,000 events only.",
  },
  {
    id: "campus",
    title: "Campus reporting and blocklist",
    does: "One student's report reaches the placement cell, and one coordinator's decision protects every student.",
    how: [
      "A report stores the sender's domain, or the full address for free mail and college accounts, because those domains are shared. It holds no mail text and is limited to 10 a minute per IP.",
      "Reports only join the coordinator's queue. Nothing is blocked until a person marks it fake.",
      "Verdicts are cached for 60 seconds, so a fake mark reaches every check within about a minute.",
      "Tables use row-level security with no policies, so only the server's secret key can read or write them.",
      "The dashboard password is compared in constant time and limited to 30 tries a minute per IP.",
      "If Supabase is missing or down, checks carry on without it.",
    ],
    limit: "The dashboard uses one shared password, not accounts, which suits a pilot. Rate limits are counted per server instance, so they slow abuse rather than stop it. Dashboard totals count the latest 2,000 events.",
  },
  {
    id: "scam-dna",
    title: "Scam DNA",
    does: "Recognises a scam's script, so a scammer who changes their address, the company name or the amount is still caught. It's what makes one report outlast a blocklist.",
    how: [
      "Each mail becomes a 64-bit SimHash. Zero-width characters are removed and styled letters flattened, then links and addresses are dropped, because those are what scammers change first.",
      "Words every placement mail shares, like internship and offer, are left out, so the fingerprint describes the script rather than the topic. Single words count three times as much as word pairs, because a rewrite keeps its words longer than their order.",
      "Two mails count as one script when at most 14 of the 64 bits differ. Every pair of unrelated test mails is further apart than that, and a test enforces it. In our test, the closest pair was 18 bits apart and the reworded versions 11 to 12.",
      "A report stores only the fingerprint, which can't be turned back into the mail. Once the placement cell marks that sender fake, its two most-reported fingerprints from before that verdict join the campus list.",
      "The server signs each fingerprint for a day, and only for a mail whose own words look risky, so a report can't simply claim a real mail's fingerprint.",
      "A match gives SCAM_DNA at High when the mail's own words are risky too, and Medium when they aren't, so a match alone can never call a clean mail fake. Proven college offices and proven senders the cell marked genuine are exempt.",
    ],
    limit: "A complete rewrite gets a new fingerprint and has to be caught by the other checks. Someone could add scam wording to a real mail to get its fingerprint signed, so a person must still mark that sender fake, the match can only reach Check first, and marking the sender genuine undoes it.",
  },
  {
    id: "letter-xray",
    title: "Offer Letter X-ray",
    does: "Tests a PDF offer letter itself, because that's often the part that convinces a student. It runs entirely in the browser, so the letter is never uploaded.",
    how: [
      "The GSTIN's last character is a check digit. It's recomputed with the GST base-36 formula, so a made-up number nearly always fails.",
      "A CIN spells out its own facts: listed or unlisted, state, year founded and company type. Each part is tested, and a missing CIN is noted, because Indian companies must print it on business letters.",
      "The file's own metadata shows what made it. A design or online PDF tool such as Canva is a warning, and the creation date is compared with the date written on the letter.",
      "The text is searched for UPI IDs, payment demands, free-mail contacts and requests for OTPs or ID. Any payment demand fails the letter.",
      "The raw file is scanned for scripts, launch actions and embedded files, which a PDF reader would normally hide.",
      "Text comes from pdf.js, loaded only when a letter is opened. Anything past 200,000 characters isn't read, and the letter then gets a warning, so padding can't earn a clean result.",
    ],
    limit: "A valid GSTIN or CIN only proves the number is well formed, not that it belongs to this company, so confirm at gst.gov.in or mca.gov.in. Careful forgers can copy a real number and clear the metadata, and a letter that's only an image can't be read.",
  },
  {
    id: "damage-control",
    title: "Damage Control",
    does: "Helps after a student has already paid, shared a code or clicked. Most tools stop at the warning, and this is the moment a student most needs clear steps.",
    how: [
      "The student taps what happened, and the steps for each answer are merged, deduplicated and sorted into right now, within the hour, and today.",
      "Paying money puts the 1930 national cybercrime helpline first, then the bank, then cybercrime.gov.in.",
      "A complaint is written from what the student entered, ready to copy into the portal or share on WhatsApp.",
      "From the extension, the sender and attack type arrive in the address's #fragment, which browsers never send to any server.",
      "It's built into the website and opens only on request, so it adds no alarms.",
    ],
    limit: "It's guidance, not legal or financial advice, and it can't recover money itself. How much a bank or the helpline can do depends on the case and on how quickly it's reported.",
  },
];

const ACCURACY = [
  ["Rules only, set 2, blind", "80%", "15%"],
  ["Rules only, set 3, blind", "70%", "5%"],
  ["Rules plus AI, set 3, paced", "100%", "0%, not blind: the AI prompt was written after seeing the misses"],
  ["Rules plus AI, set 4, blind, every kind of mail", "90%", "55%, of which 4 were a test error. This found the money rule firing on bills and tickets, since fixed"],
  ["Rules plus AI, set 5, blind, every kind of mail", "85%", "25% after setting aside a sender-format bug, since fixed. The false-alarm fixes after this run haven't been re-measured"],
];

const PRIVACY = [
  ["Sent to our server", "While the switch is on, every mail you open, not just placement mail: its text, sender, links, attachment names and headers."],
  ["Sent to Google's AI", "Up to 8,000 characters of redacted mail text, and the sender."],
  ["Sent to other services", "Tavily gets the company name. Safe Browsing gets links without query strings. VirusTotal gets link domains. RDAP and Google DNS get the sender's domain."],
  ["Stored in the database", "Each check's risk level and attack type, reported senders, and the placement cell's verdicts. No mail text."],
  ["Stored in the extension", "The on/off switch and two counters, in local browser storage."],
];

const heading = "font-display text-2xl font-bold sm:text-3xl";
const label = "mt-5 font-bold";

export default function TechnologyPage() {
  return (
    <main>
      <div className="bg-night text-white">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <Link href="/" className="font-bold text-flame hover:text-white">
            ← Back to MAILicious
          </Link>
          <h1 className="mt-8 font-display text-4xl font-bold sm:text-5xl">How MAILicious works</h1>
          <p className="mt-4 text-lg">What each check does, how it works and where it stops, taken from the code.</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <nav aria-labelledby="contents" className="border border-rule bg-sheet p-5">
          <h2 id="contents" className="font-display text-xl font-bold">
            Contents
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-7">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="underline hover:text-pad">
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#accuracy" className="underline hover:text-pad">
                Accuracy testing
              </a>
            </li>
            <li>
              <a href="#privacy" className="underline hover:text-pad">
                Privacy
              </a>
            </li>
          </ol>
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="mt-12 scroll-mt-4 border-t border-rule pt-8">
            <h2 id={`${s.id}-title`} className={heading}>
              {s.title}
            </h2>
            <h3 className={label}>What it does</h3>
            <p className="mt-1">{s.does}</p>
            <h3 className={label}>How it works</h3>
            <ul className="mt-1 list-disc space-y-2 pl-5">
              {s.how.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <h3 className={label}>Its limit</h3>
            <p className="mt-1 text-muted">{s.limit}</p>
          </section>
        ))}

        <section id="accuracy" aria-labelledby="accuracy-title" className="mt-12 scroll-mt-4 border-t border-rule pt-8">
          <h2 id="accuracy-title" className={heading}>
            Accuracy testing
          </h2>
          <h3 className={label}>What it does</h3>
          <p className="mt-1">Measures the checker on fictional mails, with scams and genuine mail mixed.</p>
          <h3 className={label}>How it works</h3>
          <ul className="mt-1 list-disc space-y-2 pl-5">
            <li>Each mail has an expected level: a scam must reach at least its minimum, and a genuine mail must stay at or under its maximum.</li>
            <li>Blind sets are written without seeing the fixes, committed before their first run and never edited after. Only blind scores count.</li>
            <li>Known misses stay in the tests as expected failures, with the cause. One goes red once it&apos;s fixed, and the mail is never edited instead.</li>
          </ul>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[32rem] border border-rule text-left text-sm">
              <caption className="sr-only">Accuracy results</caption>
              <thead className="bg-sheet">
                <tr>
                  <th scope="col" className="border-b border-rule p-3">
                    Test
                  </th>
                  <th scope="col" className="border-b border-rule p-3">
                    Scams caught
                  </th>
                  <th scope="col" className="border-b border-rule p-3">
                    False alarms
                  </th>
                </tr>
              </thead>
              <tbody>
                {ACCURACY.map(([test, caught, alarms]) => (
                  <tr key={test}>
                    <td className="border-b border-rule p-3 align-top">{test}</td>
                    <td className="border-b border-rule p-3 align-top">{caught}</td>
                    <td className="border-b border-rule p-3 align-top">{alarms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className={label}>Its limit</h3>
          <p className="mt-1 text-muted">
            These are small hand-written sets, not real inbox traffic. Scores that the engine has since been fixed against are no longer blind, so the first blind score is the one to quote.
          </p>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="mt-12 scroll-mt-4 border-t border-rule pt-8">
          <h2 id="privacy-title" className={heading}>
            Privacy
          </h2>
          <h3 className={label}>What it does</h3>
          <p className="mt-1">We don&apos;t save your mail, but its text goes to Google&apos;s AI to be read. A switch in the extension turns checking off at any time.</p>
          <h3 className={label}>How it works</h3>
          <dl className="mt-1 space-y-3">
            {PRIVACY.map(([term, detail]) => (
              <div key={term}>
                <dt className="font-bold">{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
          <h3 className={label}>Its limit</h3>
          <p className="mt-1 text-muted">Redaction is best effort and applies only to the Gemini call. Our server receives the mail as it was, and failures are logged on the server.</p>
        </section>

        <p className="mt-12 border-t border-rule pt-6">
          <Link href="/" className="font-bold underline hover:text-pad">
            ← Back to MAILicious
          </Link>
        </p>
      </div>
    </main>
  );
}
