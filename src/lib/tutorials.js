// Tutorial catalogue for the public Help Center (?help) and the in-app "?" HelpIcon.
//
// To add a tutorial: add an entry below. `video` is a file stem in public/tutorials/
// (<stem>.mp4 + optional <stem>.jpg poster); leave it out for a text-only guide.
// `id` is the deep-link key: <app url>?help=<id>

export const TUTORIAL_CATEGORIES = ["Getting started", "Jobs", "Bookings", "Vehicles"];

export const TUTORIALS = [
  {
    id: "new-workshop",
    title: "Set up a new workshop and take your first booking",
    category: "Getting started",
    module: "Workshop",
    summary: "Sign up, confirm your location, skip the welcome tour and add your first customer booking.",
    keywords: ["sign up", "signup", "register", "create account", "new workshop", "invite link", "trial", "location", "city", "country", "tour", "first booking"],
    video: "new-workshop",
    duration: "1:07",
    steps: [
      { title: "Open the sign-up form", text: "Workshops sign up through an invite link (it ends in ?ref= and a number). Opening it goes straight to the sign-up form." },
      { title: "Enter your details", text: "Type the workshop name, a username, a password and your phone number." },
      { title: "Confirm your location", text: "Click Auto-detect, then check the City and Country it fills in. Correct them if they are wrong." },
      { title: "Start the free trial", text: "Click the orange button. Your workspace takes a few seconds to load." },
      { title: "Skip the welcome tour", text: "A short tour appears for new workshops. Click Skip tour. You can replay it any time from the compass button at the bottom of the sidebar." },
      { title: "Add your first booking", text: "Open Bookings in the sidebar, click + Booking, fill in the customer, car and reason for the visit, then click Save Booking." },
    ],
    tips: ["New accounts get a 30-day free trial, no credit card needed."],
    related: ["add-booking", "skip-tour", "invite-workshop"],
  },
  {
    id: "book-in-car",
    title: "Book a car in and follow the job on the board",
    category: "Jobs",
    module: "Workshop",
    summary: "Book a customer's car in with its number plate, create the job card and move it along the Jobs board.",
    keywords: ["book in", "book in car", "job", "job card", "plate", "registration", "reg", "customer", "new job", "pending", "start", "board", "kanban"],
    video: "book-in-car",
    duration: "1:35",
    steps: [
      { title: "Sign in and skip the tour", text: "Choose Workshop on the login screen, enter your username and password, and click Skip tour if it appears." },
      { title: "Click Book In Car", text: "The button is at the top of the Jobs board." },
      { title: "Look up the plate", text: "Type the number plate and click Look Up. A returning car shows its history and any open jobs." },
      { title: "Create the job", text: "Click Create New Job, then fill in make, model, customer name, phone, mileage and the customer's complaint." },
      { title: "Save and add photos", text: "Click Save & Take Photos. Take the 3 reference photos with the phone camera, or click Skip." },
      { title: "Find the job on the board", text: "Search the board by plate. The new job sits in the Pending column." },
      { title: "Start the work", text: "Click Start when work begins and the job moves to In Progress." },
    ],
    tips: ["Searching the board by plate is the quickest way to find a car among many jobs.", "A plate that already has an open job offers to continue it instead of creating a duplicate."],
    related: ["match-vehicle", "add-booking"],
  },
  {
    id: "match-vehicle",
    title: "Match a car to the vehicle database",
    category: "Vehicles",
    module: "Workshop",
    summary: "Link a job's car to the right entry in the vehicle database so you can browse spare parts that fit it.",
    keywords: ["match", "match vehicle", "link vehicle", "vehicle database", "vehicle code", "model", "spare parts", "fitment", "browse parts", "spare shop"],
    video: "match-vehicle",
    duration: "1:24",
    steps: [
      { title: "Open the job", text: "Search the Jobs board for the plate and open the job card. Click Later if it asks for vehicle photos." },
      { title: "Click Link vehicle", text: "If the car was booked in with a loose model name such as BMW F30, the job card shows Link vehicle to browse spare parts." },
      { title: "Review the suggestions", text: "The Match Vehicle Model screen lists database vehicles, closest match first." },
      { title: "Narrow the list", text: "Type the model or code in the search box." },
      { title: "Pick the right car", text: "Tap a vehicle and compare its photos with the customer's car." },
      { title: "Confirm", text: "Click Confirm. The job now carries the vehicle code and shows how many spare parts fit." },
    ],
    tips: ["This button only appears for workshops linked to a spare shop.", "Once a job is linked, the button is replaced by the matched vehicle and its parts count."],
    related: ["book-in-car"],
  },
  {
    id: "supplier-quote",
    title: "Send a parts quotation request to a supplier",
    category: "Jobs",
    module: "Workshop",
    summary: "Ask a supplier for prices on the parts a job needs, by WhatsApp, with a link they use to reply.",
    keywords: ["supplier", "quotation", "quote", "parts request", "send quote", "send to supplier", "whatsapp", "prices", "parts quotation", "reply link", "quoting"],
    video: "supplier-quote",
    duration: "1:30",
    steps: [
      { title: "Open the job", text: "Search the Jobs board for the plate and open the job card. Click Later if it asks for vehicle photos." },
      { title: "Click Parts Quotation", text: "Then click Send Quote to open the Send to Supplier window." },
      { title: "List the parts", text: "Type each part you need and press Enter. Each one is added to the job as well." },
      { title: "Choose the supplier", text: "Pick a supplier from your list, or type a phone number." },
      { title: "Add a note (optional)", text: "Use the custom note for anything urgent, such as needed by tomorrow morning." },
      { title: "Check the message", text: "The preview shows the car, plate and parts list. The supplier also gets a link to reply with their prices." },
      { title: "Send it", text: "Click Send via WhatsApp. The request is saved in the send history and the job moves to Quoting." },
      { title: "Follow up", text: "In the send history, use Copy Link to share the reply link again, or Enter Quote to type in a price the supplier gave you." },
    ],
    tips: ["Copy Message sends the same text another way, for example by email.", "Every request stays in the send history, so you can see what was asked and when."],
    related: ["book-in-car", "match-vehicle"],
  },
  {
    id: "quotation-invoice-payment",
    title: "Quote parts and labour, get customer approval, invoice and payment",
    category: "Jobs",
    module: "Workshop",
    summary: "Build a quotation with parts and labour, send the customer an approval link, then turn it into an invoice and record the payment.",
    keywords: ["quotation", "quote", "parts", "labour", "labor", "oil", "antifreeze", "approve", "approval", "approval link", "customer approve", "deposit", "invoice", "convert to invoice", "payment", "record payment", "paid", "stock", "create new part", "mark accepted"],
    video: "quotation-invoice-payment",
    duration: "2:40",
    steps: [
      { title: "Open Parts Quotation", text: "Search the Jobs board for the plate, open the job card and click Parts Quotation." },
      { title: "Add a part you stock", text: "Click + Part and search, for example oil. Click your saved part, set the quantity, then click Add Part." },
      { title: "Add a part that is not in stock yet", text: "Search for it, click Create New Part, enter the name, your cost and your selling price, then Create & Select. Set the quantity and click Add Part. It is saved for next time." },
      { title: "Add labour", text: "Click + Labour, type the work and your rate, then click Add Labour. The table shows the parts subtotal, labour subtotal and the total." },
      { title: "Create the quotation", text: "Click Create Quotation for Customer. Check the customer, the lines and the dates, then click Create Quote." },
      { title: "Send it for approval", text: "Click Send for Approval, then Generate Approval Link. Copy the link or send it to the customer by WhatsApp. The customer needs no login." },
      { title: "The customer approves", text: "On their phone the customer sees every line and the total, ticks the terms box and clicks Approve & Confirm. They can also Decline." },
      { title: "See the result", text: "The quotation now shows Customer Approved this quotation, with the date and time." },
      { title: "Make the invoice", text: "Click Mark Accepted, then Convert to Invoice. Everything is pre-filled from the quotation. Check it and click Create Invoice." },
      { title: "Record the payment", text: "Click Record Payment. The amount, method and date are filled in. Change them if needed, then click Confirm Payment. The job shows Fully Paid." },
    ],
    tips: [
      "The approval window may have a deposit message pre-filled. If you keep it, the customer must upload proof of payment and tick the box before they can approve. Clear the message if you do not need a deposit.",
      "Click Quick Invoice to skip the quotation when the customer has already agreed the price.",
      "You can change a line on the quotation with Edit, or start a new version with New Quote.",
    ],
    related: ["book-in-car", "supplier-quote"],
  },
  {
    id: "add-booking",
    title: "Add a phone or walk-in booking",
    category: "Bookings",
    module: "Workshop",
    summary: "Record a customer booking by hand when they phone or walk in.",
    keywords: ["booking", "appointment", "walk-in", "phone booking", "schedule", "preferred date", "add booking"],
    steps: [
      { title: "Open Bookings", text: "Click Bookings in the sidebar." },
      { title: "Click + Booking", text: "It is at the top right of the Bookings list." },
      { title: "Fill in the form", text: "Customer name and phone are required. Add the vehicle registration, preferred date, make, model and the reason for the visit." },
      { title: "Save", text: "Click Save Booking. It appears in the list as Pending until you confirm it." },
    ],
    tips: ["Customers can also book themselves online with your booking link. See Share a booking link with customers."],
    related: ["booking-link", "new-workshop"],
  },
  {
    id: "booking-link",
    title: "Share a booking link with customers",
    category: "Bookings",
    module: "Workshop",
    summary: "Create a link customers use to book online by scanning their licence disc.",
    keywords: ["booking link", "customer booking", "online booking", "share link", "licence disc", "generate link", "whatsapp"],
    steps: [
      { title: "Open Bookings", text: "Click Bookings in the sidebar." },
      { title: "Generate the link", text: "In the Customer Booking Link box, click Generate Booking Link." },
      { title: "Share it", text: "Send the link to customers. They must scan their licence disc, so plates cannot be typed in by hand." },
    ],
    tips: ["Bookings made through the link land in your Bookings list for you to confirm."],
    related: ["add-booking"],
  },
  {
    id: "invite-workshop",
    title: "Invite another workshop",
    category: "Getting started",
    module: "Workshop",
    summary: "Share your personal invite link with another workshop owner so their sign-up is credited to you.",
    keywords: ["invite", "referral", "refer", "share", "ref", "friend", "another workshop"],
    steps: [
      { title: "Open Bookings", text: "The Invite Another Workshop box is on the Bookings page." },
      { title: "Copy or share the link", text: "Click Copy, or Share to send it straight to a chat." },
      { title: "They sign up with it", text: "When the other workshop signs up through your link, the system records that they came from you." },
    ],
    related: ["new-workshop"],
  },
  {
    id: "skip-tour",
    title: "Skip or replay the welcome tour",
    category: "Getting started",
    module: "Workshop",
    summary: "The welcome tour opens the first time a workshop signs in. Skip it, and replay it whenever you like.",
    keywords: ["tour", "skip tour", "welcome", "onboarding", "replay", "walkthrough", "compass"],
    steps: [
      { title: "Skip it", text: "On the welcome tour, click Skip tour. It will not open on its own again on that browser." },
      { title: "Replay it", text: "Click the compass button at the bottom of the sidebar (Take a Tour) to run the tour again." },
    ],
    related: ["new-workshop"],
  },
];

export const tutorialById = (id) => TUTORIALS.find(t => t.id === id) || null;

// Public deep link to a tutorial (or to the Help Center home when no id is given).
export const helpUrl = (id) => {
  const base = `${window.location.origin}${window.location.pathname}`;
  return id ? `${base}?help=${encodeURIComponent(id)}` : `${base}?help`;
};

// Where a tutorial's video / poster live. BASE_URL honours VITE_BASE_PATH.
export const videoSrc = (stem) => `${import.meta.env.BASE_URL}tutorials/${stem}.mp4`;
export const posterSrc = (stem) => `${import.meta.env.BASE_URL}tutorials/${stem}.jpg`;

// Ranked search: every query word must appear somewhere; title/keyword hits outrank step text.
export function searchTutorials(query, category = "All") {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = TUTORIALS.filter(t => category === "All" || t.category === category);
  if (!words.length) return pool;
  return pool
    .map(t => {
      const title = t.title.toLowerCase();
      const kw = t.keywords.join(" ").toLowerCase();
      const summary = t.summary.toLowerCase();
      const steps = t.steps.map(s => `${s.title} ${s.text}`).join(" ").toLowerCase();
      let score = 0;
      for (const w of words) {
        const hit = (title.includes(w) ? 8 : 0) + (kw.includes(w) ? 5 : 0) + (summary.includes(w) ? 3 : 0) + (steps.includes(w) ? 1 : 0);
        if (!hit) return { t, score: 0 };
        score += hit;
      }
      return { t, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.t);
}
