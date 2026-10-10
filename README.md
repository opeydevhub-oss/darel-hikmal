# Darel Hikmah International Academy — School Website

A simple, professional website for **Darel Hikmah International Academy**, Abuja.

Built with plain **HTML5**, **CSS3** and **vanilla JavaScript**. There is no build step,
no framework, no package to install. Everything you need is in this folder.

- Motto: Education for Positive Change
- Established: January 2011
- Address: No. 66 Zone C Sokale, Duste Alhaji, Abuja, FCT, Nigeria

---

## 1. How to preview the website

**Option A — double-click `index.html`.** It opens in your browser. All pages, styles,
scripts and images use relative links, so this works straight from your hard drive.

**Option B — run a small local server (recommended while editing).** Open a terminal in
this folder and type:

```
python -m http.server 8000
```

Then visit `http://localhost:8000` in your browser. Press `Ctrl + C` in the terminal to
stop the server.

Any static host works for publishing (for example GitHub Pages, Netlify, Vercel or
Cloudflare Pages). Upload the whole folder and the site is live — no build settings needed.

---

## 2. File structure

```
DAREL-HIKMAH-SCHOOL-WEBSITE/
├── index.html          Home page
├── about.html          About the school, mission, values, leadership
├── programmes.html     Creche to Basic 5, Islamiyyah, e-learning classes
├── activities.html     Sports, cultural activities, educational visits
├── admissions.html     Admission enquiry form and contact options
├── portal.html         Portal home: the four portals explained
├── portal-login.html   Shared sign-in screen
├── portal-student.html Student dashboard (demonstration)
├── portal-parent.html  Parent dashboard (demonstration)
├── portal-staff.html   Teacher dashboard (demonstration)
├── portal-admin.html   Administrator dashboard (demonstration)
├── contact.html        Address, telephone, WhatsApp, email
├── css/
│   ├── style.css       Brand colours, base layout, shared components, motion
│   ├── responsive.css  Breakpoints (320, 400, 600, 768, 900, 1024, 1100, 1280, 1440)
│   └── portal.css      Portal screens only: menu, panels, tables, states
├── js/
│   ├── main.js         Menu, image fallbacks, reveal, form and all site motion
│   ├── portal-data.js  Fictional sample data for the portal screens
│   └── portal.js       Portal screens, sign-in seam, loading/empty/error states
├── images/             School logo and photographs
└── README.md           This file
```

---

## 3. Adding images

The school logo and photographs are in `images/`. If a file is ever missing or renamed,
its slot shows a clearly labelled placeholder instead of a broken image, so the page never
looks broken. **Drop a file with the matching name into `images/` and it appears
automatically — no code changes needed.**

| File name | Used for |
| --- | --- |
| `SCHOOL_LOGO.png` | Logo in the header and footer, and the browser tab icon |
| `SCHOOL_HERO_PHOTO.jpg` | **Background photo of the home page hero**, behind the text |
| `TEACHERS_AND_STUDENTS_PHOTO.jpg` | About the school, introduction section |
| `CLASSROOM_PHOTO.jpg` | Facilities and programmes sections |
| `ICT_ROOM_PHOTO.jpg` | ICT room, facilities and portal sections |
| `PLAYGROUND_PHOTO.jpg` | Playground, facilities section |
| `INTER_HOUSE_SPORTS_PHOTO.jpg` | Activities, inter-house sports |
| `CULTURAL_ACTIVITY_PHOTO.jpg` | Activities, cultural activities |
| `FIRE_SERVICE_VISIT_PHOTO.jpg` | Educational visit to the Federal Fire Service, FCT Abuja |
| `CENTRAL_MOSQUE_VISIT_PHOTO.jpg` | Educational visit to Abuja Central Mosque |

**Filename case matters when you publish.** Your computer's file system ignores case, so
`School_logo.png` works locally but fails on Linux hosting (GitHub Pages, Netlify, Vercel).
Always use the exact names above, in capital letters.

**About the hero background photo:** it covers the whole hero area and is cropped to fit
(`object-fit: cover`), so a wide landscape photo works best. A flat navy shade is painted
over it at 66% strength so the white text always stays readable, whatever photo you use.
To change that shade, edit `.hero__bg-overlay` in `css/style.css`. To change where the
photo is cropped from, edit `object-position` in `.hero .hero__bg img`.

Tips for good results:

- **Logo:** a square PNG with a transparent background works best (about 300 x 300 px).
- **Photos:** landscape orientation works best (about 1200 x 900 px). Any size is fine, the
  layout resizes images automatically without distortion.
- **Pupils' photographs:** only publish identifiable pupils with the school's and
  parents' permission.
- **Changing a path:** search a page for `images/` (Ctrl + F) to find every reference, or
  search and replace a file name across the HTML files.

---

## 4. Editing text

All wording lives in the HTML files. Open a file in any text editor (VS Code, Notepad++
or Notepad) and change the text between the tags.

Examples:

```html
<h1>Darel Hikmah International Academy</h1>   <!-- a heading -->
<p>Established January 2011.</p>              <!-- a paragraph -->
```

Text that repeats on every page (address, telephone numbers, email, navigation) is
copied into each page, so if you change the phone number, change it in all seven HTML
files. Searching for `08064738239` finds every place it appears.

The header shows only the logo, the school name, the motto and the navigation menu.
All contact details live in the footer of every page, and also in the contact section on
the home page, the enquiry buttons on the admissions page, and the contact page.

---

## 5. Editing colours

Open `css/style.css` and change the variables at the top:

```css
:root {
  --navy-700: #123066;   /* main brand blue  */
  --red-600:  #c8102e;   /* call-to-action red */
  --gold-500: #c9a227;   /* accent gold      */
}
```

Change these values and the whole site updates. Everything else refers to these names.

---

## 6. Editing contact details, links and the WhatsApp number

Telephone links use this pattern:

```html
<a href="tel:+2348064738239">08064738239</a>
```

Email links:

```html
<a href="mailto:darelhikmah@gmail.com">darelhikmah@gmail.com</a>
```

WhatsApp links (international format, no `+` and no spaces):

```html
<a href="https://wa.me/2348058519527">WhatsApp 08058519527</a>
```

The WhatsApp number is also set once at the top of `js/main.js`:

```js
var WHATSAPP_NUMBER = "2348058519527";
```

Change it there and in the links if the number changes.

---

## 7. What is not connected yet (important)

- **The admission form does not send anything.** It has no server. It only checks the
  fields you typed and then prepares a WhatsApp message for you to send yourself. It does
  not save, store or deliver enquiries.
- **The portal screens are a frontend demonstration.** The layouts, menus, tables and
  states are finished and working in your browser, but there is **no sign-in, no account
  and no server**. See section 7b for exactly what is real and what is not.
- **Some sections are marked "Information to be confirmed".** These are deliberate
  placeholders for details the school has not supplied yet, such as fees, term dates, age
  requirements, school office hours and the vision statement. Nothing has been invented.
  Replace those boxes with real information when you have it.

---

## 7b. The portal: what works and what does not

Six pages make up the portal:

| Page | What it is |
| --- | --- |
| `portal.html` | The portal home. Explains the four portals and what each one is for |
| `portal-login.html` | One shared sign-in screen for all four portals |
| `portal-student.html` | Student dashboard |
| `portal-parent.html` | Parent dashboard |
| `portal-staff.html` | Teacher dashboard |
| `portal-admin.html` | Administrator dashboard |

### What is real

- The screens, the four different menus, the tables, the badges and the summary figures.
- The **loading state** — grey placeholder rows while information is on its way.
- The **empty state** — a clear "nothing to show yet" panel instead of a blank space.
- The **error state** — a plain message saying what failed, with a button to try again.
- The **form messages** — every field that is wrong explains what to do about it.
- The **demonstration banner** on every portal page, so no screen can ever be mistaken for
  a working one.

### What is not real — please read this

- **No sign-in works.** `PortalAuth.signIn()` in `js/portal.js` returns an error on purpose.
  It never reads a password, never sends a request and never writes to your browser's
  storage.
- **No password is requested.** The password field on `portal-login.html` is
  **disabled**, so a real password cannot be typed into it by accident.
- **Nothing is saved.** The teacher's register, the demo buttons and every other control
  change what is on screen and nothing else.
- **All data is invented.** Pupils are written as "Pupil A" to "Pupil D" and staff as
  "Teacher One" onwards, so no real child or member of staff can be identified. Every
  panel carries a "Sample data" tag, and every table has a caption saying what it is.
- **No results are invented.** The results screens show the columns a report card will
  have, with the marks left blank and a note explaining why. The grade key underneath is
  curriculum information, not a score.
- **Fees are not real money.** Invoices carry placeholder amounts and the reference
  numbers are made up. No payment is taken and no bank or transfer details appear anywhere.

### Connecting a backend later (Supabase)

The portal was built so that connecting a real service does not mean rewriting it.

Every screen reads its information through one object, `PortalData`, in `js/portal.js`:

```js
PortalData.getDashboard(role)   // → { data, error }
PortalData.getResultsSubjects() // → { data, error }
PortalData.getRegister()        // → { data, error }
```

Each one currently returns sample data after a short delay. To connect Supabase, replace
the body of each function with a query — the return shape is already the same:

```js
PortalData.getDashboard = function (role) {
  return supabase.from("dashboards").select("*").eq("role", role).single();
};
```

The dashboards, tables, badges, empty states and error messages will then show real data
with no other changes. Sign-in works the same way: replace the body of `PortalAuth`
with the Supabase client.

Before any of that goes live, the school needs: secure accounts for each group, a database
of records, access rules that keep each group to its own information, payment records kept
by the school office rather than collected on this website, and a record of who changed
what. That work is not part of this frontend.

---

## 8. Responsive behaviour

The CSS is mobile-first: the base styles in `css/style.css` target small phones, and
`css/responsive.css` adds larger layouts as the screen grows.

Breakpoints: 400px, 600px, 768px, 900px, 1024px, 1100px (desktop navigation appears here),
1280px and 1440px, plus extra adjustments for screens narrower than 360px.

The site was tested in a browser at 320, 360, 390, 430, 540, 768, 900, 1024, 1100, 1280
and 1440 pixels wide: no horizontal page scrolling, no overlapping elements, tap targets at
least 44px high for every link and button that sits on its own line, and a working mobile
menu below 1100px. The home page hero photo covers the full hero area at every width
without stretching.

Links that run *inside a sentence* — for example a telephone number in the middle of a
paragraph — keep the height of the line they sit on. That is the one place the 44px rule
does not apply, and it matches the accessibility guidance for inline text links. If you
want a bigger hit area, give the link the `link-block` class.

The page also respects the operating system's "reduce motion" setting, and all links,
buttons and menus can be used with a keyboard, with a visible focus outline.

---

## 8b. Animations and motion

Motion is used to explain where you are and what changed, not to decorate. Everything is
short, one-way and tied to a real event (a scroll, a hover, a click, a page opening).

### On page load

| Effect | What it does |
| --- | --- |
| `rise-in` | The hero motto, heading, paragraph and buttons rise in one line at a time |
| `word-rise` | Each word of the home page `<h1>` slides up out of its own mask, 0.07s apart, so the heading is written rather than pasted in |
| `hero-slow-zoom` | The hero background photo eases from 1.05 to 1 scale over 14 seconds, once |
| `fade-in` | Each photograph fades in gently when its file finishes loading |

### While you scroll

| Effect | What it does |
| --- | --- |
| `.scroll-progress` | A thin gold line along the top of the header fills as you read the page |
| Hero depth | The hero text drifts up slowly and fades, which pushes the background photo back |
| `.reveal` | Sections, cards and photos fade up 14px as they enter the viewport |
| Heading rule | The gold line under a section `<h2>` draws in from the left once, when the heading is 60% visible |
| `.stage-rail` | On the programmes page, the dot of the stage you are reading turns red; the ones above it fill gold |
| Floating motifs | The open book, graduation cap, pencil, ruler and star drift slowly up and down behind the content |

### When you point, focus or click

| Effect | What it does |
| --- | --- |
| `.nav-indicator` | A gold line sits under the menu item you are on and slides to whichever item the pointer or keyboard focus moves to |
| Card hover | Cards, value cards and staff cards lift 3px on devices with a real pointer |
| Card photo | Card photographs zoom to 1.07 on hover |
| `.accordion` | Questions on the admissions page expand and collapse; the plus turns into a minus |
| `.to-top` | The back to top button fades and slides in after 500px of scrolling |

### When you move between pages

| Effect | What it does |
| --- | --- |
| `main.is-leaving` | The current page fades out and lifts 8px, then the next page opens |

### Where the code lives

All animation CSS is in one block at the end of `css/style.css` (see "Animations" and
"Scroll progress and page transitions"). The JavaScript that starts each effect is in
`js/main.js`; every set-up function is called from one `DOMContentLoaded` block at the
bottom:

```
setUpScrollProgress()   the gold reading-progress line
setUpHeroDepth()        hero text drift and fade on scroll
setUpHeroHeading()      splits the hero heading into masked words
setUpHeadingRules()     draws the gold rule under section headings
setUpNavIndicator()     sliding marker under the navigation
setUpStageRail()        programme stage dots
setUpAccordion()        admissions and portal questions
setUpPageTransition()   the soft fade between pages
```

To change a speed, edit the duration in the relevant rule: `0.7s` (hero words), `0.6s`
(hero lines and heading rule), `6.5s` to `11s` (floating motifs), `14s` (background photo),
`0.5s` (scroll reveal), `0.4s` (accordion), `0.3s` (navigation marker), `0.18s` (page fade).

### Floating school motifs

A few quiet line drawings — an open book, a graduation cap, a pencil, a ruler and a star —
drift up and down behind the content. They are the only motion on the page that runs for
as long as you stay there.

They are built to stay out of the way:

- **Decorative only.** Each group sits inside `<span class="float-layer" aria-hidden="true">`,
  so a screen reader never mentions them.
- **Their own layer.** `.float-layer` is `position: absolute` inside the section, and the
  real content sits on a layer above it. A motif can never cover a heading, a button,
  a table or a form field.
- **Kept to the edges.** `.float--tl`, `.float--tr`, `.float--mr`, `.float--br`,
  `.float--bl`, `.float--ml` and `.float--bc` place them around the outside of the text.
- **Different each one.** Duration, delay, distance and tilt are set per motif class, so
  they never look like one loop: the pencil moves 7s with a −1.2s delay, the cap moves 11s
  with a −2.5s delay, and so on.
- **Transform only.** The keyframes animate `translate3d` and `rotate`, never `top` or
  `left`, so the movement stays on the compositor and does not cost layout.
- **Gone on small screens.** Below 900px the whole layer is hidden, because a phone has no
  room to spare and the text matters more.
- **Off when motion is reduced.** `html.no-motion .float` and the reduced-motion block in
  `responsive.css` both switch them off completely, so they do not sit frozen mid-drift.

Motifs are placed on the home page hero and two further sections on the home page, plus
one section each on the about page, the programmes page and the portal page. To add one
somewhere else, copy any `<span class="float float--book float--tl">…</span>` block into a
section that is `position: relative`, and give it a different shape and position class.

### Accessibility and safety

- **Every animation starts from a hidden state defined inside its own keyframes**, so if
  animations are switched off the content simply appears as normal. Nothing can be left
  invisible, and the site still works with JavaScript disabled.
- **`prefers-reduced-motion: reduce` turns all of it off.** `js/main.js` adds
  `html.no-motion`, and `css/responsive.css` removes the reveals, the hero zoom, the word
  masks, the page fade, the heading rules, the floating motifs and the progress line. The
  reading-progress line, the page fade and the word splitting are also skipped in
  JavaScript, not just hidden with CSS.
- Cards side by side are staggered by `transitionDelay` (up to 0.28s). Add a `.reveal`
  class to a new element and it takes part automatically — no extra work.
- The navigation marker is hidden below 1100px, where the menu collapses to the burger
  button, because there is no menu row for it to sit under.

---

## 9. Publishing checklist

1. Confirm the logo and photographs in `images/` are the approved versions.
2. Replace every "Information to be confirmed" box with confirmed school information.
3. Have the school approve all wording and pupil images.
4. Check the contact details and WhatsApp number.
5. Decide whether the portal will go live. If so, connect a backend as described in
   section 7b and keep the demonstration banner until sign-in really works.
6. Connect a form service if you want the admission form to deliver enquiries.
7. Upload the folder to your hosting and open `index.html` online.

---

Darel Hikmah International Academy — Education for Positive Change