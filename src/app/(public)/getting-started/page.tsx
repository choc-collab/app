"use client";

import { useEffect, useState, type ReactNode } from "react";
import "./getting-started.css";

type Section = {
  id: string;
  num: string;
  title: string;
  teaser: string;
  render: () => ReactNode;
};

function Shot({
  label,
  src,
  tall,
  wide,
  note,
}: {
  label: string;
  src?: string;
  tall?: boolean;
  wide?: boolean;
  note?: string;
}) {
  const cls = ["shot", tall && "tall", wide && "wide", src && "shot-has-image"]
    .filter(Boolean)
    .join(" ");
  if (src) {
    return (
      <figure className={cls}>
        <img src={src} alt={label} loading="lazy" />
      </figure>
    );
  }
  return (
    <div className={cls}>
      <div className="inner">
        <b>{label}</b>
        {note && <div className="shot-note">{note}</div>}
      </div>
    </div>
  );
}

function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "tip" | "warn";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`callout ${kind}`}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — fall back to selecting the text
    }
  };
  return (
    <div className="code-block">
      <button
        type="button"
        onClick={handleCopy}
        className="code-block-copy"
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function StepList({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="step-list">
      {items.map((it, i) => (
        <li key={i}>
          <div className="n">{String(i + 1).padStart(2, "0")}</div>
          <div className="body">
            <strong>{it.title}.</strong> {it.body}
          </div>
        </li>
      ))}
    </ul>
  );
}

const SECTIONS: Section[] = [
  {
    id: "welcome",
    num: "01",
    title: "Welcome, and what this is",
    teaser: "A one-minute orientation so you know what you're looking at.",
    render: () => (
      <>
        <p className="sub">A one-minute orientation so you know what you&apos;re looking at.</p>
        <p>
          I built Choc-collab because my own recipes lived everywhere — spreadsheets, notebooks, PDFs, a Google doc,
          the occasional cocoa butter splattered paper. Rescaling a ganache for a different mould was a guessing
          game. I never really knew what each bonbon cost me to make.
        </p>
        <p>
          Choc-collab is an app that sits on your iPad, phone, or laptop
          and keeps your entire workshop in one place: ingredients, fillings, products, production
          plans, stock, collections, and a little bit of business intelligence. Your data lives in your
          browser — no account, no server, no lock-in. If you want to sync across devices later, you
          can bring your own Dexie Cloud database. Otherwise it works fully offline, for free and always will.
        </p>
        <Callout kind="tip" title="Five-minute promise">
          If you follow the quickstart below, you&apos;ll have a product, a filling, an ingredient, and
          a mock production plan in about five minutes. Then you can decide whether the app is worth
          the rest of the afternoon.
        </Callout>
      </>
    ),
  },
  {
    id: "hosted-or-local",
    num: "02",
    title: "Hosted or local — which one am I using?",
    teaser: "Same app, two ways to run it. A quick orientation before you dive in.",
    render: () => (
      <>
        <p className="sub">
          Choc-collab can be used in two ways. Both give you the same features;
          the difference is who runs the server — and whether your data can sync
          across devices.
        </p>
        <h3>Local (the default)</h3>
        <p>
          If someone gave you a folder, you cloned the repo, or you&apos;re running
          the app from a packaged download, you&apos;re on a local install. The app
          lives entirely in your browser: no account, no login, no server to talk
          to. Your data is stored in your browser&apos;s local database and never
          leaves the device.
        </p>
        <ul>
          <li>
            <strong>What&apos;s good:</strong> no account; no monthly fees; works
            offline forever; your data is physically on your device.
          </li>
          <li>
            <strong>What to watch out for:</strong> data is tied to this one
            browser on this one device. Clear your browser data and it&apos;s
            gone. No sync across iPad + laptop. <strong>Backup is essential</strong>
            {" "}— see section 15.
          </li>
        </ul>
        <h3>Hosted (with Dexie Cloud sync)</h3>
        <p>
          If you opened the app at a public URL (e.g. a{" "}
          <code>choc-collab</code> domain someone else is running) and were asked
          for an email to sign in, you&apos;re on a hosted version. Data still
          lives primarily in your browser, but it&apos;s also synced to a personal
          Dexie Cloud database so it&apos;s available on every device you sign in
          from.
        </p>
        <ul>
          <li>
            <strong>What&apos;s good:</strong> works across iPad + laptop
            automatically; survives a browser reset; the one-time-code email
            login means no password to lose.
          </li>
          <li>
            <strong>What to watch out for:</strong> your data is also stored by
            Dexie (the sync provider); their free tier is generous but has limits;
            read their{" "}
            <a href="https://dexie.org/cloud/docs/terms" target="_blank" rel="noreferrer">
              terms
            </a>{" "}
            before you store anything you wouldn&apos;t want a third party to
            hold. You can export a local backup at any time.
          </li>
        </ul>
        <Callout kind="note" title="How to tell which one you’re on">
          Look at the bottom of the side nav. &ldquo;Local only&rdquo; with a
          struck-through cloud icon means you&apos;re running locally. A
          signed-in email address means you&apos;re on a hosted / synced setup.
        </Callout>
      </>
    ),
  },
  {
    id: "install",
    num: "03",
    title: "Install it like a real app (PWA)",
    teaser: "iPad, phone, or desktop — all three work offline.",
    render: () => (
      <>
        <p className="sub">
          Choc-collab is a Progressive Web App. Installing it gives you a real app icon, a full-screen
          view without the browser chrome, and offline support.
        </p>
        <h3>On an iPad or iPhone</h3>
        <ol>
          <li>Open the app in Safari (not Chrome — on iOS only Safari can install PWAs).</li>
          <li>
            Tap the <strong>Share</strong> button (the square with the up arrow).
          </li>
          <li>
            Scroll down and pick <strong>Add to Home Screen</strong>.
          </li>
          <li>Give it a name — I call mine &ldquo;Workshop&rdquo; — and tap Add.</li>
        </ol>
        <Shot label="iOS install screenshot" note="Replace with a capture of the Safari Share sheet + Add to Home Screen." />
        <h3>On Android</h3>
        <p>
          In Chrome, open the three-dot menu and choose <strong>Install app</strong> (sometimes
          called &ldquo;Add to Home screen&rdquo;). The app also shows its own install banner on
          first visit.
        </p>
        <h3>On a Mac, Windows, or Linux desktop</h3>
        <p>
          In Chrome, Edge, or Brave, look for the little install icon at the right end of the address
          bar, or use the browser menu&apos;s <strong>Install Choc-collab</strong>. Safari on macOS
          14+ supports &ldquo;Add to Dock&rdquo; from the File menu.
        </p>
        <Callout kind="note" title="Why bother installing?">
          The installed app remembers its own state — if you force-quit your browser tabs at the end
          of the day, the workshop app stays open. You can also lock your iPad to just this app with
          Guided Access while you&apos;re at the bench with cocoa-butter hands.
        </Callout>
      </>
    ),
  },
  {
    id: "demo",
    num: "04",
    title: "Load the demo data first",
    teaser: "Poke around a fully populated workshop before entering your own.",
    render: () => (
      <>
        <p className="sub">
          If this is your first visit, I strongly recommend filling the app with example data before
          you start typing your own.
        </p>
        <ol>
          <li>
            Open the side nav and go to <strong>Settings</strong>.
          </li>
          <li>
            Scroll to the <em>Demo data</em> section.
          </li>
          <li>
            Tap <strong>Load demo data</strong>. A confirmation appears — accept it.
          </li>
        </ol>
        <p>
          The app populates a small sample workshop: a dozen ingredients, half a dozen fillings, a
          couple of moulds, a few products, and a finished batch in the Observatory so you can see the
          charts actually charting.
        </p>
        <Shot label="Settings → Load demo data" src="/docs/screenshots/settings-demo.png" />
        <Callout kind="warn" title="Clearing demo data">
          When you&apos;re ready, use <strong>Settings → Clear demo data</strong>. It only removes
          the examples I shipped; anything you&apos;ve entered yourself stays.
        </Callout>
      </>
    ),
  },
  {
    id: "preferences",
    num: "05",
    title: "Set your market region and currency",
    teaser: "So allergen lists, nutrition panels, and prices match your local reality.",
    render: () => (
      <>
        <p className="sub">Settings → Preferences. Two choices, but they ripple everywhere.</p>

        <h3>Market region</h3>
        <p>
          Different regions regulate allergens and nutrition labelling differently. The app
          supports five — pick the one that matches where you sell.
        </p>
        <ul>
          <li>
            <strong>EU</strong>
            <ul>
              <li>FIC 1169/2011, 14 allergens.</li>
              <li>kJ + kcal, &ldquo;Nutrition Declaration&rdquo; format.</li>
            </ul>
          </li>
          <li>
            <strong>UK</strong>
            <ul>
              <li>Same 14 allergens post-Brexit.</li>
              <li>Natasha&apos;s Law applies to PPDS products.</li>
            </ul>
          </li>
          <li>
            <strong>US</strong>
            <ul>
              <li>9 allergens under FALCPA + sesame under the FASTER Act.</li>
              <li>kcal only, &ldquo;Nutrition Facts&rdquo; with %DV.</li>
            </ul>
          </li>
          <li>
            <strong>AU</strong>
            <ul>
              <li>PEAL allergens (no celery, lupin, or mustard).</li>
              <li>kJ only, mandatory &ldquo;Contains:&rdquo; summary.</li>
            </ul>
          </li>
          <li>
            <strong>CA</strong>
            <ul>
              <li>11 allergens per Health Canada.</li>
              <li>Bilingual labels (EN/FR).</li>
            </ul>
          </li>
        </ul>

        <h3>Currency</h3>
        <p>
          Pick one of EUR, USD, CAD, GBP, or CHF. Every cost, margin, and shopping-list total
          across the app reformats instantly.
        </p>

        <Callout kind="tip" title="You can change your mind">
          These are just display preferences — your data isn&apos;t tied to a region. Switch at
          will if you ship to a new market.
        </Callout>
      </>
    ),
  },
  {
    id: "ingredient",
    num: "06",
    title: "Add your first ingredient",
    teaser: "Ingredients are the atoms. Get these right and everything above them behaves.",
    render: () => (
      <>
        <p className="sub">
          An ingredient is anything you buy: a single-origin couverture, cream, butter, fruit purée,
          praline paste. Go to <strong>The Pantry → Ingredients</strong> and hit the round{" "}
          <kbd>+</kbd> (or press <kbd>n</kbd> on your keyboard — there&apos;s a shortcut for that on
          every list page).
        </p>
        <StepList
          items={[
            {
              title: "Name and category",
              body:
                "Call it something you will recognise at 7 a.m. — \"Valrhona Caraïbe 66%\", not \"dark choc 3\". Pick a category (Chocolate, Fats, Sugars, Nuts, Liquids…).",
            },
            {
              title: "Composition",
              body:
                "For chocolates, enter cacao fat %, sugar %, solids %, alcohol %. The app uses these for ganache balancing later. For other ingredients, fill what you know — you can come back.",
            },
            {
              title: "Allergens",
              body:
                "Tick everything present. These cascade automatically through fillings into finished products, so get them right once.",
            },
            {
              title: "Nutrition (per 100 g)",
              body:
                "Only the fields your market requires are shown. Fill in kJ/kcal, fat, saturates, carbs, sugars, protein, salt/sodium as available — the app scales them into per-product figures later.",
            },
            {
              title: "Price",
              body:
                "Your last purchase price and pack size. The app computes cost-per-gram and keeps a price history, so ingredient price changes ripple into your product margins automatically.",
            },
          ]}
        />
        <Shot label="Ingredient detail — Callebaut 811 Dark Chocolate" src="/docs/screenshots/ingredient-edit.png" />
        <Callout kind="note" title="Bulk import via CSV">
          Entering 80 ingredients by hand is no one&apos;s idea of a morning.{" "}
          <strong>Ingredients → the three-dot menu → Import CSV</strong>. A template is available as
          a download inside the dialog; column names must match the fields exactly. The importer
          validates and flags duplicates before touching your database.
        </Callout>
      </>
    ),
  },
  {
    id: "filling",
    num: "07",
    title: "Build a filling",
    teaser: "A reusable recipe — ganache, caramel, praline, pâte de fruit.",
    render: () => (
      <>
        <p className="sub">
          Fillings are the second layer of the pantry. They exist on their own so one filling can
          be used across many products without being re-typed.
        </p>

        <ol>
          <li>
            <strong>The Pantry → Fillings → New.</strong>
            <ul>
              <li>Give it a name.</li>
              <li>
                Pick a category — Ganaches, Pralines, Caramels, Fruit-Based, Croustillants, or add
                your own.
              </li>
            </ul>
          </li>
          <li>
            <strong>Add ingredients.</strong> Drag and drop them onto the filling. Each row is
            inline-editable — tap the weight and the unit to change them.
          </li>
          <li>
            <strong>Nest other fillings inside this one.</strong> Below the ingredient list there&apos;s
            a <em>Nested fillings</em> section. Tap <em>+ Add nested filling</em> and pick another
            filling — useful when one recipe sits inside another (a caramel base inside another caramel). The picker
            blocks options that would close a loop with a <em>Cycle</em> badge, so you can&apos;t
            accidentally make A nest B nest A. Cost, allergens, and nutrition flow through every
            nesting level automatically — editing the inner filling re-snapshots cost on every
            product that uses it (transitively), and a new allergen on a leaf ingredient cascades
            up to every host filling that contains it. Production plans that include a host filling
            also schedule the nested batches: you&apos;ll see <em>Make caramel base</em> as its own
            step before <em>Make caramel ganache</em>, with weights scaled to the host&apos;s portion
            of the recipe.
          </li>
          <li>
            <strong>Allergens compute themselves.</strong> You&apos;ll see the derived list under
            the card header — no need to re-tick anything.
          </li>
          <li>
            <strong>Cook-loss? Record the measured yield.</strong> Caramels, pâtes de fruit and
            anything you reduce on the stove lose mass while cooking. Weigh the pan before and
            after once, enter the cooked weight in <em>Measured yield (g)</em>, and the app uses
            that as the base for rescaling from then on — asking for <em>600&nbsp;g of caramel</em>
            in a production plan produces 600&nbsp;g on the scale after reducing, not 600&nbsp;g of
            raw ingredients that cook down to a smaller batch. Ganaches and pralinés that
            don&apos;t reduce can leave the field blank.
          </li>
          <li>
            <strong>Changing an existing recipe?</strong> Hit <strong>Fork version</strong>.
            <ul>
              <li>The app shows which products currently use this filling.</li>
              <li>You decide whether to fork or overwrite.</li>
              <li>Forking preserves the old version, so history stays intact.</li>
              <li>
                If this filling is nested inside another, the fork panel shows a heads-up listing
                the host fillings — those keep using the old version. Open each host separately if
                you want to swap in the new one. Archiving a filling that&apos;s still nested
                somewhere is blocked for the same reason: clean up the host first, or the
                aggregations would lose a leg.
              </li>
            </ul>
          </li>
        </ol>

        <Shot label="Filling detail — Salted Caramel recipe" src="/docs/screenshots/filling-editor.png" />
      </>
    ),
  },
  {
    id: "product",
    num: "08",
    title: "Compose a product",
    teaser: "A shell, one or more fillings, a mould, and a few flags.",
    render: () => (
      <>
        <p className="sub">
          A product is everything a chocolatier thinks of as &ldquo;a bonbon&rdquo; or &ldquo;a
          bar&rdquo;: a shell-making chocolate, one or more fillings, a mould, and a set of labels
          (allergens, popularity, shelf life, vegan flag, tags).
        </p>
        <StepList
          items={[
            {
              title: "Shell",
              body:
                "Pick the shell chocolate from your ingredient library (only ingredients in the \"Chocolate\" category appear here). Set the shell percentage — default is 37%, but moulded products accept 15–50%, and bar products can go anywhere.",
            },
            {
              title: "Fillings",
              body:
                "Add one or more fillings. Distribute the fill volume by percentage (default) or by grams per cavity. The app re-totals as you go and warns if you drift from 100%.",
            },
            {
              title: "Mould",
              body:
                "Pick a mould from your library. This is what drives production scaling — the app multiplies fill weight and shell weight by the mould's cavity count and cavity volume.",
            },
            {
              title: "Decoration",
              body:
                "Optional: define shell-decoration steps (airbrushing, sponging, splatter, transfer sheets…) pulled from your decoration-material inventory. These become scheduled production steps later.",
            },
            {
              title: "Labels",
              body: "Popularity, tags, shelf life, vegan flag, low-stock threshold. All optional, all searchable.",
            },
          ]}
        />
        <Shot label="Product detail — Gianduja Bar composition" src="/docs/screenshots/product-composition.png" />
      </>
    ),
  },
  {
    id: "production",
    num: "09",
    title: "Plan a production run",
    teaser: "Pick products, pick moulds, let the app do the scaling.",
    render: () => (
      <>
        <p className="sub">The Workshop → Production → New. A step-by-step wizard walks you through a batch.</p>
        <StepList
          items={[
            {
              title: "Pick products and mould them",
              body:
                "Select the products you want to produce. For each, choose a mould and a quantity (moulds, not pieces — the app knows cavity counts). For the rare case where a product is poured into more than one mould type, or only part of a mould, open the \"Alternative mould setup\" disclosure on the product card to add extra moulds or enter an exact cavity count.",
            },
            {
              title: "Or: fillings-only and hybrid plans",
              body:
                "You can skip products entirely and plan standalone filling batches — useful for topping up shelf-stable fillings (pâtes de fruits, pralines) before the products that use them. Product batches and standalone filling batches can coexist in the same plan (\"hybrid\") so a big production day only needs one checklist.",
            },
            {
              title: "Review scaling",
              body:
                "The app shows you the total fill weight, shell weight, and ingredient demand. Shared fillings across products are consolidated into one step with combined weight. Fillings with a measured yield recorded are scaled from cooked weight, so target grams always refer to what comes out of the pan.",
            },
            {
              title: "Step-by-step checklist",
              body:
                "Colour → shell → filling → fill → cap → post-cap decoration → unmould. Colour steps are auto-scheduled across all products in the plan to minimise cocoa-butter colour switches.",
            },
            {
              title: "Record as you go",
              body:
                "Tick off steps with one tap. Low-stock warnings surface inline if you're running out of anything. At the fill step, you can register leftover filling in grams — that goes into stock for future plans to reuse.",
            },
            {
              title: "Unmould and close",
              body:
                "Record actual yield (defaults to expected; adjust for breakage). The app writes a plain-text batch summary you can export and archive.",
            },
          ]}
        />
        <Shot label="Production list — an active batch mid-flight" src="/docs/screenshots/production-wizard.png" />
      </>
    ),
  },
  {
    id: "stock",
    num: "10",
    title: "Stock, freezer, and leftovers",
    teaser: "What you have, what's frozen, what's expiring.",
    render: () => (
      <>
        <p className="sub">
          Every finished batch contributes to product stock; every unused gram of filling
          contributes to filling stock.
        </p>

        <ul>
          <li>
            <strong>Product stock.</strong>
            <ul>
              <li>Sell-by dates calculated from each product&apos;s shelf life.</li>
              <li>FIFO deduction keeps the numbers honest.</li>
              <li>You can reconcile manually with a count.</li>
            </ul>
          </li>
          <li>
            <strong>Filling stock.</strong>
            <ul>
              <li>Leftovers from production are available as &ldquo;use stock&rdquo; in future plans.</li>
              <li>Deducted FIFO, same as products.</li>
            </ul>
          </li>
          <li>
            <strong>Freezer.</strong>
            <ul>
              <li>Freeze products or fillings with a preserved shelf-life value.</li>
              <li>Frozen items stop counting toward low-stock alerts.</li>
              <li>Defrost restores them with an adjusted sell-by.</li>
            </ul>
          </li>
        </ul>
        <Shot label="Stock — products with sell-by pills and freezer status" src="/docs/screenshots/stock-products.png" />
      </>
    ),
  },
  {
    id: "collections",
    num: "11",
    title: "Collections and pricing",
    teaser: "Curate seasonal sets; see every box's margin at a glance.",
    render: () => (
      <>
        <p className="sub">
          A collection is a curated group of products — a spring range, a Valentine&apos;s box, a
          permanent signature set. Each collection has box offerings: which products go in which size
          box, at what retail price.
        </p>
        <p>
          The Pricing &amp; Margins dashboard compares every box configuration across every
          collection, ranked by margin health. Green means you&apos;re making money. Amber means
          it&apos;s tight. Red means you&apos;re paying to make the box.
        </p>
        <Shot label="Easter 2026 collection with box pricing and margins" src="/docs/screenshots/collection-pricing.png" />
      </>
    ),
  },
  {
    id: "shop",
    num: "12",
    title: "The Shop — selling boxes (and giving them away)",
    teaser: "Fill a box from stock, log the sale, track give-aways at cost.",
    render: () => (
      <>
        <p className="sub">
          Once a collection has at least one box price, the Shop lights up. It&apos;s the
          counter-side companion to everything you&apos;ve built up to here: the place where
          finished pieces leave the workshop and turn into revenue (or, sometimes, into
          give-aways you still want to track).
        </p>

        <h3>The shop landing</h3>
        <p>
          The top strip shows today at a glance — boxes sold, revenue, bonbons out the door,
          and your seven-day average box price. Below that, two tabs:
        </p>
        <ul>
          <li>
            <strong>Ready to sell.</strong> Boxes you&apos;ve filled and packed but not yet
            handed over. Identical boxes group together so a 30-box morning batch shows as one
            row with a quantity stepper, not thirty rows. Each row carries an optional
            customer note (name, pickup time, gift tag) and a one-tap <em>Sell</em> button.
          </li>
          <li>
            <strong>Recent activity.</strong> Sold boxes and give-aways interleaved by time,
            filterable by today / 7 days / 30 days / all. A sold box gets a 24-hour <em>Undo</em>
            window in case you tap the wrong row.
          </li>
        </ul>

        <h3>Filling a box</h3>
        <p>
          Tap <strong>+ New box</strong> and the wizard walks you through three steps:
        </p>
        <StepList items={[
          { title: "Pick a collection × box size", body: "You'll see every collection-and-packaging combo that has a sell price. Bonbon boxes and snack-bar packs both show up here; single-bar wrappers don't (those are handled by the production wizard's Package step). If a packaging is missing, it's because no collection has it priced yet — go to the collection and add it." },
          { title: "Fill the cavities", body: "Each cavity becomes a tap target. Pick from the products in stock for that collection; the cavity preview colours each piece so you can spot a half-empty box at a glance. Stock decrements as you fill — you can't oversell." },
          { title: "Confirm and prepare", body: "Add an optional customer note, confirm. The box lands in Ready to sell at the collection's retail price, with stock already reserved." },
        ]} />

        <h3>Give-aways</h3>
        <p>
          The lilac <strong>Log give-away</strong> button next to <em>+ New box</em> is for
          everything that leaves without payment: tastings, charity donations, samples to a
          new account, friends-and-family. You can give away a packed box, a snack-bar pack,
          a single bar, or just loose pieces — and choose whether they come from stock or
          off-the-books. Give-aways are valued at <strong>ingredient cost</strong> (not retail),
          so they show up in your reporting as a real expense without inflating revenue.
        </p>
        <Callout kind="tip" title="Why track give-aways at all?">
          A surprising amount of margin walks out the door as samples and gifts. Logging
          them — even roughly — means the Observatory&apos;s numbers reflect what the workshop
          actually consumed, not just what got paid for.
        </Callout>

        <h3>What the Shop does behind the scenes</h3>
        <ul>
          <li><strong>Pulls from stock.</strong> Filling a box reserves the pieces; selling it commits the deduction. Voiding a prepared box returns them to stock.</li>
          <li><strong>Uses collection pricing.</strong> Retail price comes from the collection × packaging pair you set up in section 11. Change the price on the collection and future boxes pick it up; already-prepared boxes keep the price they were prepared at.</li>
          <li><strong>Feeds the Observatory.</strong> Every sale and give-away flows into the reporting in section 13 — daily revenue, margin trends, and the mismatch between what you made and what you sold.</li>
        </ul>
      </>
    ),
  },
  {
    id: "observatory",
    num: "13",
    title: "The Observatory — your numbers in one place",
    teaser: "Pricing health, production trends, product-cost breakdowns, and shop sales.",
    render: () => (
      <>
        <p className="sub">
          The Observatory is the reporting hub. Everything the app has quietly learned from your
          ingredients, products, batches, stock, and shop — laid out as numbers and charts so
          you can tell whether the business is actually working.
        </p>

        <h3>What&rsquo;s in there</h3>
        <p>Four views, reached from <strong>Observatory</strong> in the side nav:</p>
        <ul>
          <li>
            <strong>Pricing &amp; Margins.</strong>
            <ul>
              <li>Every box, across every collection, ranked by margin health.</li>
              <li>Green = making money. Amber = tight. Red = you&apos;re paying to make the box.</li>
              <li>Use this to spot boxes where retail price has drifted behind ingredient inflation.</li>
            </ul>
          </li>
          <li>
            <strong>Production Stats.</strong>
            <ul>
              <li>Historical batch counts by product and collection.</li>
              <li>Trends over time — what you&apos;re actually making, not what you think you are.</li>
              <li>Useful when deciding what to cut from next season&apos;s range.</li>
            </ul>
          </li>
          <li>
            <strong>Product Cost.</strong>
            <ul>
              <li>Full cost breakdown for any product: shell, filling ingredients, decoration, overhead share.</li>
              <li>Side-by-side comparison with similar products — so you can see why the salted caramel costs 40c more than the passion fruit.</li>
            </ul>
          </li>
          <li>
            <strong>Shop Insights.</strong>
            <ul>
              <li>Pick a window (7 days through all time, plus a custom range) and optionally narrow to one collection.</li>
              <li>Headline tiles: revenue, bonbons + bars sold, average box price, and the current top seller.</li>
              <li>Stacked revenue chart broken down by collection, monthly or weekly.</li>
              <li>Four leaderboards — best-selling bonbons, best-selling bars, best-selling box sizes, and collections by revenue — each with a <em>↑ Rising / ↓ Easing / Dormant / New</em> trend chip versus the previous comparable window.</li>
              <li>This is the &ldquo;what&apos;s actually moving off the counter&rdquo; view — the counterpart to Production Stats, which shows what you&apos;re making.</li>
            </ul>
          </li>
        </ul>

        <Callout kind="note" title="It needs data to be useful">
          If you haven&apos;t entered ingredient prices or run production plans yet, the charts
          will be sparse. Load the demo data (section 04) to see the full thing in action before
          committing to your own.
        </Callout>

      </>
    ),
  },
  {
    id: "allergens",
    num: "14",
    title: "Allergens and nutrition",
    teaser: "Enter once at the ingredient level. The app does the rest.",
    render: () => (
      <>
        <p className="sub">
          Allergens cascade from ingredients, through fillings, into products. Nutrition aggregates
          the same way, weighted by each ingredient&apos;s actual share of the finished piece.
        </p>
        <p>
          On every product page, the <strong>Allergens</strong> tab shows the derived list and lets
          you add facility-level &ldquo;may contain&rdquo; advisories (e.g. &ldquo;made in a workshop
          that handles peanuts&rdquo;) in Settings.
        </p>
        <p>
          The <strong>Nutrition</strong> tab shows the per-100g and per-piece panels formatted for
          your chosen market: EU Nutrition Declaration (kJ + kcal), US Nutrition Facts (with %DV),
          Australian NIP (kJ per 100g and per piece), Canadian Valeur nutritive.
        </p>
        <Callout kind="warn" title="Legal disclaimer">
          The app does the arithmetic; you are still responsible for label accuracy. Always verify
          against your supplier specs before printing a sellable label.
        </Callout>
      </>
    ),
  },
  {
    id: "backup",
    num: "15",
    title: "Backup, restore, and cloud sync",
    teaser: "Your data is yours. Treat it that way.",
    render: () => (
      <>
        <p className="sub">
          Because everything lives locally in your browser, <strong>backup is your job.</strong> The
          good news: it&apos;s one tap.
        </p>
        <h3>Export a backup</h3>
        <ol>
          <li>
            Settings → <strong>Export backup</strong> — writes a <code>.json</code> file containing
            every ingredient, filling, product, mould, plan, and setting. Store it somewhere that
            isn&apos;t your iPad (iCloud Drive, Dropbox, USB stick).
          </li>
          <li>Do this weekly, or after any session where you entered a lot of data. It takes two seconds.</li>
        </ol>
        <h3>Restore</h3>
        <p>
          Settings → <strong>Import backup</strong>. Pick the JSON file. The importer warns before
          overwriting an existing database.
        </p>
        <h3>Automatic safety snapshots</h3>
        <p>
          You don&apos;t need to remember to export before risky moves. Choc-collab auto-downloads a
          JSON snapshot to your Downloads folder before three things: importing a backup (in case
          the file is bad), deleting all data (in case you misclicked), and any app update that
          changes the data format (in case the migration goes sideways). The files are named so you
          can tell them apart — anything starting with <code>choc-collab-snapshot-before-</code> is
          one of these. Keep the latest few; delete the rest when you feel like it.
        </p>
        <p>
          Settings → <strong>Device Storage</strong> also shows whether your browser has promised
          not to evict the app&apos;s data under storage pressure. If it hasn&apos;t, tap{" "}
          <strong>Request persistent storage</strong> — browsers like Safari and Firefox usually
          only grant it on a tap, not automatically.
        </p>
        <h3>Optional: Dexie Cloud sync</h3>
        <p>
          If you want your workshop on both an iPad <em>and</em> a laptop, you can connect a
          personal Dexie Cloud database (their free tier covers a single chocolatier comfortably).
          It&apos;s not a one-click setting inside the app — sync is baked in at deploy time, so
          you&apos;ll host your own copy of Choc-collab on Vercel with a Dexie Cloud URL plugged in.
          Non-technical-friendly, takes about twenty minutes the first time.
        </p>
        <p>
          Full walkthrough: <strong>Section 15 — Setting up Dexie Cloud sync</strong>.
        </p>
        <Callout kind="note" title="My own setup">
          I started local-only, but I work across my workshop iPad and a laptop, so I switched to
          Dexie Cloud. Recipes show up on whichever device I pick up, and I still export a JSON
          backup every so often for peace of mind.
        </Callout>
      </>
    ),
  },
  {
    id: "dexie-cloud",
    num: "16",
    title: "Setting up Dexie Cloud sync (step by step)",
    teaser: "The bit that lets your iPad and laptop see the same data. Twenty minutes, no code.",
    render: () => (
      <>
        <p className="sub">
          This section is for anyone who wants their data to sync across devices — iPad, laptop,
          phone — without a shared server run by me. You&apos;ll end up with your own copy of
          Choc-collab, hosted on Vercel&apos;s free tier, syncing to your own Dexie Cloud database.
          Nothing here requires writing code. If you can copy-paste and click buttons, you can do
          this.
        </p>

        <Callout kind="tip" title="What you&rsquo;ll need before you start">
          <ul>
            <li>An email address (for Dexie Cloud and Vercel sign-in).</li>
            <li>A GitHub account (free — <a href="https://github.com/signup" target="_blank" rel="noreferrer">github.com/signup</a>).</li>
            <li>About twenty minutes.</li>
            <li>Node.js installed on your computer for <em>one</em> command later — download at {" "}
              <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a> if you
              don&apos;t have it. (This is the only mildly technical bit. It&apos;s a two-minute installer.)
            </li>
          </ul>
        </Callout>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part A · Create your Dexie Cloud database</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: get a Database URL you&apos;ll paste into Vercel in Part D.</em>
          </p>
          <ol>
            <li>
              Go to{" "}
              <a href="https://manager.dexie.cloud/" target="_blank" rel="noreferrer">
                manager.dexie.cloud
              </a>
              {" "}and sign in with your email — one-time code, no password.
            </li>
            <li>
              Click <strong>Create Database</strong>.
              <ul>
                <li>Give it a name, e.g. &ldquo;My Workshop&rdquo;.</li>
                <li>Pick the region closest to you.</li>
              </ul>
            </li>
            <li>
              When it&apos;s ready, copy the <strong>Database URL</strong> — it looks like{" "}
              <code>https://z1a2b3c4d.dexie.cloud</code>.
            </li>
          </ol>
          <Callout kind="tip" title="Keep this tab open">
            You&apos;ll come back to the Database URL twice — in Part D and again in Part E — and
            you&apos;ll also use this tab for Part B.
          </Callout>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part B · Lock your database down to just you</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: only the emails you approve can sign in — no strangers using your quota.</em>
          </p>
          <p>
            By default, Dexie Cloud lets anyone who knows your Database URL sign in with their own
            email. They won&apos;t see your data (each user gets their own isolated space), but
            they will chew up your free-tier quota. Two minutes of config closes this.
          </p>
          <ol>
            <li>
              Still in{" "}
              <a href="https://manager.dexie.cloud/" target="_blank" rel="noreferrer">
                manager.dexie.cloud
              </a>
              , open your database.
            </li>
            <li>
              Open the <strong>Users</strong> (or <strong>Manage users</strong>) tab.
            </li>
            <li>
              <strong>Add yourself first.</strong> Click <strong>Invite</strong> (or{" "}
              <strong>Add user</strong>) and enter the exact email you&apos;ll sign in with later.
              <ul>
                <li>
                  Give yourself admin rights if there&apos;s a role option — you&apos;ll want them
                  for any future user-management.
                </li>
              </ul>
            </li>
            <li>
              <strong>Turn off open sign-up.</strong> Look for a setting along the lines of{" "}
              <em>Allow anonymous users</em>, <em>Open registration</em>, or <em>Invite-only</em>,
              and flip it so only invited emails can sign in.
            </li>
            <li>
              Want collaborators (staff, partner, recipe-testing friend)? Invite them now, one
              email at a time.
            </li>
          </ol>
          <Callout kind="warn" title="Invite yourself before locking sign-up">
            If you disable open sign-up <em>before</em> adding your own email, you&apos;ll be
            locked out of your own database on Part G. Order matters.
          </Callout>
          <Callout kind="note" title="Free-tier note">
            Dexie Cloud&apos;s free tier covers a single active user. Inviting a second or third
            person may nudge you into a paid plan — check their current pricing before inviting
            your whole team.
          </Callout>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part C · Fork the Choc-collab repo on GitHub</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: get your own copy of the project so Vercel has something to deploy.</em>
          </p>
          <p>
            A &ldquo;fork&rdquo; is just your own copy of the project. It&apos;s free, takes ten
            seconds, and you never need to edit any code in it.
          </p>
          <ol>
            <li>
              Go to{" "}
              <a href="https://github.com/choc-collab/app" target="_blank" rel="noreferrer">
                github.com/choc-collab/app
              </a>
              .
            </li>
            <li>
              Click <strong>Fork</strong> (top right). Leave all defaults → <strong>Create fork</strong>.
            </li>
            <li>
              You&apos;ll now have a copy at <code>github.com/&lt;your-username&gt;/app</code>.
            </li>
          </ol>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part D · Deploy your fork to Vercel</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: a live URL for your app, wired up to your Dexie database.</em>
          </p>
          <ol>
            <li>
              Go to{" "}
              <a href="https://vercel.com/signup" target="_blank" rel="noreferrer">
                vercel.com/signup
              </a>
              {" "}and sign in with GitHub. Pick the Hobby (free) plan.
            </li>
            <li>
              Click <strong>Add New… → Project</strong>, then pick your <code>app</code> fork from
              the list.
            </li>
            <li>
              On the import screen, expand <strong>Environment Variables</strong> and add one:
              <ul>
                <li>
                  <strong>Name:</strong> <code>NEXT_PUBLIC_DEXIE_CLOUD_URL</code>
                </li>
                <li>
                  <strong>Value:</strong> the Database URL from Part A
                </li>
              </ul>
            </li>
            <li>
              Click <strong>Deploy</strong>. First build takes 2–3 minutes — go make an espresso.
            </li>
            <li>
              When it finishes, Vercel gives you a URL like{" "}
              <code>https://app-&lt;your-fork&gt;.vercel.app</code>. Copy it for Part E.
            </li>
          </ol>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part E · Whitelist your Vercel URL in Dexie Cloud</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: tell Dexie your Vercel URL is allowed to connect. One command.</em>
          </p>
          <p>
            Dexie Cloud refuses connections from domains it doesn&apos;t recognise. You need to
            whitelist your new Vercel URL.
          </p>
          <ol>
            <li>
              Open a terminal — <strong>Terminal.app</strong> on macOS, <strong>PowerShell</strong>{" "}
              on Windows.
            </li>
            <li>Run this command, replacing the URL with your Vercel URL from Part D:</li>
          </ol>
          <CodeBlock>{`npx dexie-cloud whitelist add https://app-<your-fork>.vercel.app`}</CodeBlock>
          <p>
            The first time you run this, a browser window opens asking you to sign in to your
            Dexie Cloud account. Follow the prompts — the command finishes on its own.
          </p>
          <Callout kind="tip" title="Custom domain later? Whitelist it too.">
            If you point a custom domain (like <code>workshop.myname.com</code>) at your Vercel
            deploy, rerun the command with the custom domain. You can whitelist as many origins as
            you like.
          </Callout>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part F · Turn on auto-updates from upstream</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: when I ship a fix, your deploy updates itself. No code, just a file paste.</em>
          </p>
          <p>
            I push updates to the main Choc-collab repo, not to your fork. A tiny GitHub Actions
            workflow can pull those updates into your fork nightly, and Vercel redeploys
            automatically.
          </p>
          <ol>
            <li>
              In your fork on GitHub, click <strong>Add file → Create new file</strong>.
            </li>
            <li>
              Name the file exactly <code>.github/workflows/sync-upstream.yml</code>.
              <ul>
                <li>The slashes create the folders automatically.</li>
              </ul>
            </li>
            <li>Paste this content:</li>
          </ol>
          <CodeBlock>{`name: Sync fork with upstream

on:
  schedule:
    - cron: '0 6 * * *'   # every day at 06:00 UTC
  workflow_dispatch:       # lets you trigger it manually too

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Merge upstream main
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git remote add upstream https://github.com/choc-collab/app.git
          git fetch upstream
          git checkout main
          git merge upstream/main --ff-only
          git push origin main
`}</CodeBlock>
          <ol start={4}>
            <li>
              Click <strong>Commit changes</strong>. Done.
            </li>
          </ol>
          <p>
            Every morning at 06:00 UTC your fork pulls the latest, Vercel redeploys, and your app
            is up to date.
          </p>
          <Callout kind="note" title="Want to pull an update right now?">
            Go to the <strong>Actions</strong> tab in your fork → &ldquo;Sync fork with
            upstream&rdquo; → <strong>Run workflow</strong>.
          </Callout>
        </div>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ marginTop: 0 }}>Part G · Sign in from your devices</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            <em>Goal: actually use the thing you just built.</em>
          </p>
          <ol>
            <li>Open your Vercel URL on your iPad, laptop, or phone.</li>
            <li>Enter your email. You&apos;ll get a one-time code by email — paste it in.</li>
            <li>
              That&apos;s it. Data added on one device appears on the others within a few seconds.
            </li>
          </ol>
          <p>Offline is fine too — it&apos;ll sync when you&apos;re back online.</p>
        </div>

        <Callout kind="note" title="How to check it&rsquo;s working">
          Open the side nav. The bottom strip should show your signed-in email, not &ldquo;Local
          only&rdquo; with a struck-through cloud. Add a test ingredient on one device; it should
          appear on the other within a few seconds.
        </Callout>

        <h3 style={{ marginTop: 36 }}>Troubleshooting</h3>
        <details>
          <summary>Vercel build fails</summary>
          <p>
            Check that the env var name is exactly <code>NEXT_PUBLIC_DEXIE_CLOUD_URL</code> — the
            <code> NEXT_PUBLIC_</code> prefix is required or the browser won&apos;t see it. In
            Vercel, open your project → Settings → Environment Variables, verify, then click
            <strong> Redeploy</strong>.
          </p>
        </details>
        <details>
          <summary>&ldquo;Blocked by CORS&rdquo; or login fails silently</summary>
          <p>
            You skipped Part E. Rerun the <code>npx dexie-cloud whitelist add</code> command with
            your Vercel URL. If you have multiple URLs (preview deploys, custom domain), whitelist
            each one.
          </p>
        </details>
        <details>
          <summary>&ldquo;This email isn&rsquo;t allowed&rdquo; when I try to sign in</summary>
          <p>
            You locked the database in Part B but haven&apos;t invited the email you&apos;re trying
            to sign in with. Go back to{" "}
            <a href="https://manager.dexie.cloud/" target="_blank" rel="noreferrer">
              manager.dexie.cloud
            </a>
            {" "}→ your database → Users, and invite the address. If you&apos;ve locked yourself
            out entirely (no admin email invited at all), Dexie Cloud&apos;s database owner can
            still manage users from the Manager with the account that created the DB.
          </p>
        </details>
        <details>
          <summary>My fork isn&rsquo;t pulling updates</summary>
          <p>
            Check the <strong>Actions</strong> tab in your fork. If the workflow failed, it&apos;s
            usually because you&apos;ve manually changed files in the fork, which creates a merge
            conflict. Simplest fix: delete your fork and re-fork fresh — your data isn&apos;t
            stored in the repo, it&apos;s in your Dexie Cloud database, so nothing is lost.
          </p>
        </details>
        <details>
          <summary>Do I have to pay for anything?</summary>
          <p>
            For a single chocolatier: no. Vercel Hobby is free. Dexie Cloud&apos;s free tier covers
            a single active user comfortably. GitHub public repos are free. If you grow beyond
            that (multiple staff, big datasets), both Dexie and Vercel have paid plans —
            you&apos;ll know when you hit the limits because they tell you clearly.
          </p>
        </details>
      </>
    ),
  },
  {
    id: "shortcuts",
    num: "17",
    title: "Keyboard shortcuts",
    teaser: "Small, but they add up.",
    render: () => (
      <>
        <p className="sub">If you use a keyboard, these save real time.</p>
        <ul>
          <li>
            <kbd>n</kbd> — on any list page, opens the &ldquo;new&rdquo; form for that section (new
            ingredient, new filling, new product…).
          </li>
          <li>
            <kbd>/</kbd> — focus the search box.
          </li>
          <li>
            <kbd>Esc</kbd> — close a modal or cancel an inline edit.
          </li>
          <li>
            <kbd>Enter</kbd> — save an inline-edited name. <kbd>Esc</kbd> discards.
          </li>
          <li>
            <kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd> — open the section switcher from anywhere.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "faq",
    num: "18",
    title: "Troubleshooting and FAQ",
    teaser: "The things I've been asked most.",
    render: () => (
      <>
        <details open>
          <summary>I entered data and then it disappeared.</summary>
          <p>
            Most often this is a browser that aggressively clears &ldquo;website data&rdquo; — Safari
            in Private mode, some privacy extensions, or clearing cache. Install the app as a PWA
            (section 03) and keep it installed; that makes your data much stickier. Also: export a
            backup weekly.
          </p>
        </details>
        <details>
          <summary>Can anyone see my recipes or business data — including you?</summary>
          <p>
            <strong>No — and in the default setup, it&apos;s not a question of trust, it&apos;s
            architectural.</strong> Choc-collab has no server I run. There is no admin panel,
            no &ldquo;all users&rdquo; dashboard on my end, no database on my laptop with your
            recipes in it. I literally cannot see your data because there&apos;s nowhere for me
            to see it from.
          </p>
          <p>What that means in each of the two ways to run the app:</p>
          <ul>
            <li>
              <strong>Local install.</strong> Your data lives in your browser&apos;s local
              database, on your device only. Nothing is sent anywhere. Turn off the internet and
              the app still works identically.
            </li>
            <li>
              <strong>Self-hosted with Dexie Cloud sync.</strong> Your data syncs to <em>your own</em>{" "}
              Dexie Cloud database — registered to your email, on your Dexie account, under your
              quota. I have no login to it. Dexie (the company that runs Dexie Cloud) does hold
              the synced data on their servers; read their{" "}
              <a href="https://dexie.org/cloud/docs/terms" target="_blank" rel="noreferrer">
                terms
              </a>
              {" "}if that matters to you.
            </li>
          </ul>
          <p>
            You can verify all of this yourself: the app is open source at{" "}
            <a href="https://github.com/choc-collab/app" target="_blank" rel="noreferrer">
              github.com/choc-collab/app
            </a>
            . There&apos;s no hidden telemetry, no analytics beaconing back to me, no
            phone-home. If you ever catch me adding any, open an issue and shame me loudly.
          </p>
        </details>
        <details>
          <summary>Is this built for a team, or just for one chocolatier?</summary>
          <p>
            <strong>Just for one.</strong> Choc-collab is designed top-to-bottom for a single
            chocolatier running their own workshop. There&apos;s no concept of a shared workshop,
            shared pantry, or team workspace inside the app — by design.
          </p>
          <p>What that means in practice:</p>
          <ul>
            <li>
              <strong>Same person, multiple devices — works great.</strong> Sign in with the same
              email on your iPad, laptop, and phone; Dexie Cloud keeps them in sync. This is the
              intended setup for anyone who wants more than local-only.
            </li>
            <li>
              <strong>Multiple people sharing one workshop — not supported.</strong> If you invite
              a second user through Dexie Cloud&apos;s user management, they can sign in to your
              hosted instance, but they&apos;ll land in their own isolated workshop. Your
              ingredients, fillings, and products don&apos;t appear for them, and vice versa.
            </li>
            <li>
              <strong>Roles and permissions — none.</strong> There&apos;s no &ldquo;admin vs
              baker&rdquo; distinction, no read-only view for a business partner, no audit log of
              who changed what.
            </li>
          </ul>
          <p>
            This is intentional. Most artisan chocolate businesses are one or two people; a full
            team-collab product would be overkill, and the single-user model is what keeps the
            architecture simple, hosting friendly to Dexie&apos;s free tier, and the privacy story
            clean — no shared database means nothing to get into each other&apos;s.
          </p>
          <p>
            If you genuinely need a second person viewing or editing the same data, the
            practical workaround today is sharing a single login across devices. If your business
            grows to the point where that doesn&apos;t cut it, tell me. Multi-user support
            isn&apos;t on the roadmap, but demand could change that.
          </p>
        </details>
        <details>
          <summary>My fillings&apos; allergens look wrong.</summary>
          <p>
            Allergens cascade from ingredients. Open the ingredient in question, verify the checklist,
            and the filling will recompute the next time you open it.
          </p>
        </details>
        <details>
          <summary>The production wizard says I don&apos;t have enough of something I just bought.</summary>
          <p>
            The stock panel on each ingredient is manual — mark it &ldquo;restocked&rdquo; after a
            delivery. The shopping list is also there to catch this.
          </p>
        </details>
        <details>
          <summary>I don&rsquo;t see any chocolate in the &ldquo;shell&rdquo; dropdown on the product recipe page.</summary>
          <p>
            Shell-chocolate dropdowns only list ingredients you&apos;ve explicitly marked as{" "}
            <em>shell capable</em>. This is so your picker isn&apos;t cluttered with every
            chocolate in your pantry — only the couverture ones that are actually viable for
            tempering a shell.
          </p>
          <p>To fix it:</p>
          <ol>
            <li>
              Open the ingredient you want to use (Ingredients → pick the chocolate). Its
              category must be <strong>Chocolate</strong> — the shell-capable checkbox only
              appears for that category.
            </li>
            <li>
              Tick <strong>&ldquo;Can be used as shell chocolate (couverture)&rdquo;</strong> and save.
            </li>
            <li>
              Back on the product recipe, it&apos;ll now show up in the shell dropdown.
            </li>
          </ol>
          <p>
            If the checkbox doesn&apos;t appear, double-check the ingredient&apos;s category is{" "}
            <strong>Chocolate</strong> (not &ldquo;Couverture&rdquo;, &ldquo;Cocoa butter&rdquo;,
            or similar — those are separate categories).
          </p>
        </details>
        <details>
          <summary>I need bar-style products (chocolate bars, not moulded bonbons).</summary>
          <p>
            Create a product category with shell-percentage range <code>0–100</code>. Bar-style
            categories hide the shell ingredient when set at 100% and hide the fillings list when set
            at 0%. The data model supports it fully; I just haven&apos;t built a dedicated Bar UI yet.
          </p>
        </details>
        <details>
          <summary>Who is behind this app?</summary>
          <p>
            Hi — I&apos;m Lizi, a small artisan chocolatier with a long background in software development and consulting, living in a tiny village in the Netherlands. I make bonbons, bars, and the occasional
            questionable experiment under{" "}
            <a href="https://www.instagram.com/l.artisan.chocolates" target="_blank" rel="noreferrer">
              @l.artisan.chocolates
            </a>
            {" "}on Instagram. Choc-collab started as my own tool — the thing I kept wishing existed at an affordable price
            while juggling spreadsheets, a notebook, and a recipe Google doc in the middle of a
            tempering session. Once it was usable, it felt wrong to keep it to myself, so here it
            is. If you want to see what I&apos;m making with it, the Instagram is the best window.
          </p>
        </details>
        <details>
          <summary>Why is this app free?</summary>
          <p>
            Because the chocolate community gave me everything I know, and I&apos;d like to hand
            some of it back. I learned a lot of what I know about tempering, ganache ratios, shell
            thickness, shelf life — not from a course, but from chocolatiers who shared openly.
            Chocolatiers like{" "}
            <a href="https://www.instagram.com/sosase_chocolat?igsh=YTZoMDhvZ2dycGd3" target="_blank" rel="noreferrer">
              James Parsons (SoSaSe Chocolat)
            </a>
            {" "}put extraordinary craft knowledge online for free, and it changed what I was able
            to make at home. This app is my version of that: a tool I needed and couldn&apos;t find,
            released to anyone else who needs it. No ads, no account wall, no premium tier dangled
            in your face. If it saves you an afternoon of spreadsheet gymnastics, that&apos;s the
            whole point.
          </p>
        </details>
        <details>
          <summary>Can I contribute?</summary>
          <p>
            Yes, please — this is meant to be a community project, not a solo one. A few concrete
            ways to help:
          </p>
          <ul>
            <li>
              <strong>Code.</strong> Bug fixes, features, polish — pull requests welcome at{" "}
              <a href="https://github.com/choc-collab/app" target="_blank" rel="noreferrer">
                github.com/choc-collab/app
              </a>
              . Open an issue first for anything non-trivial so we can talk through scope.
            </li>
            <li>
              <strong>Ingredient composition data.</strong> One of the things I want to crowd-source
              is a shared library of ingredients with their fat / sugar / water / cocoa solids
              composition, so new users don&apos;t have to type in every chocolate from scratch. In
              future, you&apos;ll be able to pick which library to seed from when you set up the
              app. If you have a well-curated ingredient list, that&apos;s gold.
            </li>
            <li>
              <strong>Mould and decoration seed data.</strong> A shared database of common moulds
              (dimensions, cavity counts, shell-weight references) and decoration techniques/designs
              would save everyone a lot of manual entry. Same idea — you load from a community set
              rather than starting blank.
            </li>
            <li>
              <strong>Setup and onboarding help.</strong> If you got through the install / Dexie
              Cloud setup and something tripped you up, tell me. The friction you remember is the
              friction the next person is about to hit.
            </li>
          </ul>
          <p>
            Easiest starting point for any of the above: open an issue describing what you want to
            contribute, or email <code>choccollab@proton.me</code>.
          </p>
        </details>
        <details>
          <summary>I want a feature / I found a bug.</summary>
          <p>
            <a href="https://github.com/choc-collab/app/issues" target="_blank" rel="noreferrer">
              Open an issue on the repo
            </a>
            , or email me at <code>choccollab@proton.me</code>. I read every message. Be
            specific — screenshots help.
          </p>
          <p>
            A note on feature requests: I build Choc-collab in my spare time, and I can&apos;t
            promise to implement everything that gets suggested. I&apos;ll read every request and
            think about it, but whether it ships comes down to whether it fits the direction of
            the app, whether I&apos;d use it myself, and whether I have the time. Expect a
            &ldquo;not right now&rdquo; or &ldquo;probably never&rdquo; on plenty of things —
            it&apos;s not personal.
          </p>
          <p>
            The best way to get a feature you want is to open a pull request, or to fork the
            app and build it yourself — it&apos;s open source for exactly that reason. Bugs are
            a different story: I prioritise those and try to fix anything that corrupts data or
            blocks core workflows.
          </p>
        </details>
        <details>
          <summary>
            <span>What should I <em>not</em> expect from a free app?</span>
          </summary>
          <p>
            Choc-collab is a free, open-source, one-person project. That shapes what you can
            reasonably expect from it — and what you can&apos;t. Nothing here is a secret; I
            want to be upfront so you can decide if it&apos;s right for you.
          </p>
          <ul>
            <li>
              <strong>No warranty, no support contract.</strong> The MIT license ships
              &ldquo;AS IS&rdquo; — if the app loses data, miscalculates a cost, or breaks on
              a browser update, there&apos;s no one you can invoice. I fix bugs when I find
              time, not on a schedule.
            </li>
            <li>
              <strong>Backups are your responsibility.</strong> The app offers exports and
              auto-snapshots (see section 15), but I can&apos;t recover data for you. If your
              iPad dies and you never exported, the data is gone. Treat a weekly backup like
              closing the till.
            </li>
            <li>
              <strong>Allergens and nutrition are calculation aids, not certified labels.</strong>
              {" "}The arithmetic is mine; the legal liability for what goes on a sellable
              product is yours. Always cross-check against supplier specs before printing
              anything a customer will read. (This is true of paid apps too — but worth saying
              plainly.)
            </li>
            <li>
              <strong>No uptime SLA on hosted versions.</strong> If you self-host on Vercel,
              availability is Vercel&apos;s problem and your problem, not mine. If I run a
              public hosted version in future, it&apos;ll be best-effort — no 99.9% promise.
            </li>
            <li>
              <strong>Features and fixes move at hobby pace.</strong> See the feature-request
              answer above. This isn&apos;t a product team; it&apos;s me between batches.
            </li>
          </ul>
          <p>
            None of this is unusual for open-source software. I&apos;m saying it plainly here
            because running it in a commercial kitchen raises the stakes, and I&apos;d rather
            you go in clear-eyed.
          </p>
        </details>
      </>
    ),
  },
];

const HUB_GROUPS = [
  { title: "Get set up", ids: ["welcome", "hosted-or-local", "install", "demo", "preferences"] },
  { title: "Build your pantry", ids: ["ingredient", "filling", "product"] },
  { title: "Run the workshop", ids: ["production", "stock", "collections", "shop", "observatory"] },
  { title: "Labels, backup, reference", ids: ["allergens", "backup", "dexie-cloud", "shortcuts", "faq"] },
];

const HUB_ACCENTS: Record<string, string> = {
  welcome: "cocoa", "hosted-or-local": "mint", install: "blue", demo: "butter", preferences: "taupe",
  ingredient: "sage", filling: "peach", product: "cocoa",
  production: "terracotta", stock: "taupe", collections: "butter", shop: "peach", observatory: "sage",
  allergens: "mint", backup: "lilac", "dexie-cloud": "mint", shortcuts: "taupe", faq: "blue",
};

const HUB_ICONS: Record<string, ReactNode> = {
  welcome:     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5"/></svg>,
  "hosted-or-local": <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M15 8a2.5 2.5 0 0 1 1.8 4.3H8.5a2 2 0 0 1-.3-4A3 3 0 0 1 14 8h1Z"/></svg>,
  install:     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14"/></svg>,
  demo:        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 6h16v12H4zM4 10h16M8 14h4"/></svg>,
  preferences: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>,
  ingredient:  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M8 3v4M16 3v4M5 11h14M5 7h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1z"/></svg>,
  filling:     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 2h12l-2 7H8zM8 9c-2 3-3 6-3 9a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3c0-3-1-6-3-9"/></svg>,
  product:     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M9 6V4a3 3 0 0 1 6 0v2"/></svg>,
  production:  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>,
  stock:       <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4M21 7v10l-9 4"/></svg>,
  collections: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  shop:        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>,
  observatory: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 20h16M6 20V10M10 20V6M14 20v-8M18 20V4"/></svg>,
  allergens:   <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>,
  backup:      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.7 1 6.3 2.7L21 8M21 3v5h-5"/></svg>,
  "dexie-cloud": <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 18a4 4 0 0 0 1-7.87A5 5 0 0 0 8.2 9.5 4 4 0 0 0 7 17.5M12 13v7m0 0-3-3m3 3 3-3"/></svg>,
  shortcuts:   <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>,
  faq:         <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></svg>,
};

export default function GettingStartedPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? SECTIONS.find((s) => s.id === openId) ?? null : null;

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setOpenId(hash);
    }
    const onHashChange = () => {
      const h = window.location.hash.slice(1);
      if (h && SECTIONS.some((s) => s.id === h)) setOpenId(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <div className="docs max-w-5xl mx-auto px-6">
      <div className="hero">
        <div className="kicker">Help · getting started · reference</div>
        <h1>Find what you need, jump straight in.</h1>
        <p className="lede">
          Everything you need to know about Choc-collab, organised by what you&apos;re trying to do.
          Each card opens the full guide — read it in order your first time, then come back to
          whichever section you need next.
        </p>
        <div className="cta-row">
          <button className="btn-primary" onClick={() => setOpenId("welcome")}>
            New here? Start with &ldquo;Welcome&rdquo;
          </button>
          <button className="btn-secondary" onClick={() => setOpenId("faq")}>
            Troubleshooting
          </button>
        </div>
      </div>

      <div className="section wide">
        {HUB_GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 32 }}>
            <div className="mono-label" style={{ marginBottom: 10 }}>
              {g.title}
            </div>
            <div className="card-grid">
              {g.ids.map((id) => {
                const s = SECTIONS.find((x) => x.id === id);
                if (!s) return null;
                const accent = HUB_ACCENTS[id] || "cocoa";
                return (
                  <button
                    key={id}
                    type="button"
                    className="card"
                    onClick={() => setOpenId(id)}
                  >
                    <div
                      className="ico"
                      style={{
                        background: `var(--accent-${accent}-bg)`,
                        color: `var(--accent-${accent}-ink)`,
                      }}
                    >
                      {HUB_ICONS[id]}
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.teaser}</p>
                    <div className="arrow">{s.num} →</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="hub-modal" onClick={() => setOpenId(null)}>
          <div className="hub-modal-inner" onClick={(e) => e.stopPropagation()}>
            <button
              className="hub-modal-close"
              onClick={() => setOpenId(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="hub-modal-kicker">Section {open.num}</div>
            <h2 className="hub-modal-title">{open.title}</h2>
            {open.render()}
            <div className="hub-modal-nav">
              {(() => {
                const i = SECTIONS.findIndex((s) => s.id === open.id);
                const prev = SECTIONS[i - 1];
                const next = SECTIONS[i + 1];
                return (
                  <>
                    {prev && (
                      <button className="btn-secondary" onClick={() => setOpenId(prev.id)}>
                        ← {prev.title}
                      </button>
                    )}
                    {next && (
                      <button
                        className="btn-primary spacer"
                        onClick={() => setOpenId(next.id)}
                      >
                        {next.title} →
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
