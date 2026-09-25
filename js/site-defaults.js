/*
 * Editable site content: the wording and photos she can change from the admin
 * (Admin -> Homepage & About). The page HTML already contains these same defaults,
 * so the site looks right even before anything is saved; saved values simply
 * replace them (see site-content.js). Each `key` matches a data-cms* attribute
 * in the page HTML. If you change default wording in the HTML, change it here too.
 *
 * Field types: text, textarea, image, url, email.
 */
window.TG_SITE = (function () {
  const sections = [
    {
      id: 'home', label: 'Homepage', page: '/',
      groups: [
        { title: 'Top banner', hint: 'The big photo and headline visitors see first.', fields: [
          { key: 'home.heroImage', label: 'Banner photo', type: 'image', folder: 'site', def: '/images/banner-hero.jpg' },
          { key: 'home.eyebrow', label: 'Small label', type: 'text', max: 40, def: 'Travel Journal' },
          { key: 'home.title', label: 'Headline', type: 'textarea', max: 120, rows: 2, def: 'Stories From Everywhere Between Home and the Next Departure Gate' },
          { key: 'home.subtitle', label: 'Sub-headline', type: 'textarea', max: 200, rows: 2, def: 'Honest travel guides, food finds, and a few lessons learned the hard way — one country at a time.' },
          { key: 'home.cta', label: 'Button text', type: 'text', max: 24, def: 'Read the Blog' },
        ] },
        { title: 'Introduction', hint: 'The "Hello, I\'m Tearri" section under the banner.', fields: [
          { key: 'home.introImage', label: 'Photo', type: 'image', folder: 'site', def: '/images/Homescreen feature image.JPG' },
          { key: 'home.greeting', label: 'Greeting (cursive)', type: 'text', max: 40, def: "Hello, I'm Tearri" },
          { key: 'home.introHeading', label: 'Heading', type: 'textarea', max: 140, rows: 2, def: 'I write about the places I go and the things I get wrong along the way' },
          { key: 'home.introText', label: 'Paragraph', type: 'textarea', max: 500, rows: 4, def: "This blog started as a way to remember my own trips and turned into something bigger — a collection of guides, food crawls, and slow-travel stories for anyone plotting their next trip. No sponsored fluff, just what I'd tell a friend." },
          { key: 'home.introButton', label: 'Button text', type: 'text', max: 24, def: 'More About Me' },
        ] },
        { title: 'Latest posts heading', fields: [
          { key: 'home.latestEyebrow', label: 'Small label', type: 'text', max: 40, def: 'Fresh Off the Plane' },
          { key: 'home.latestTitle', label: 'Heading', type: 'text', max: 40, def: 'Latest Posts' },
        ] },
      ],
    },
    {
      id: 'about', label: 'About page', page: '/about/',
      groups: [
        { title: 'About you', fields: [
          { key: 'about.photo', label: 'Photo', type: 'image', folder: 'site', def: '/images/About_Me_Profile_Photo.JPG' },
          { key: 'about.eyebrow', label: 'Small label', type: 'text', max: 30, def: 'About Me' },
          { key: 'about.heading', label: 'Heading', type: 'text', max: 60, def: "Hi, I'm Tearri." },
          { key: 'about.p1', label: 'First paragraph', type: 'textarea', max: 700, rows: 5, def: "Travelling has been my thing since I was a kid. Not in a casual way, either — I mean the kind of dream where you're spending hours looking at pictures of places you have no real plan of getting to yet, just because you like knowing they're out there. That never really went away, it just kept getting longer lists attached to it." },
          { key: 'about.p2', label: 'Second paragraph', type: 'textarea', max: 700, rows: 5, def: "This blog is me actually doing something with all of that. Every time I go somewhere new, I'm paying attention — what I got right, what I'd skip next time, the place everyone hypes up that wasn't worth the wait, and the one nobody mentioned that turned into my favorite part of the whole trip. Country by country, that's what's going here: the honest version, not the highlight reel." },
        ] },
        { title: '"What to expect" section', fields: [
          { key: 'about.expectEyebrow', label: 'Small label', type: 'text', max: 30, def: 'What To Expect' },
          { key: 'about.expectHeading', label: 'Heading', type: 'text', max: 60, def: "What You'll Find Here" },
          { key: 'about.expectText', label: 'Paragraph', type: 'textarea', max: 400, rows: 4, def: "Country by country — the lessons I picked up along the way, the mistakes worth learning from before you make them yourself, and the places I'd actually tell a friend to go, not just the ones that look good in a photo." },
        ] },
      ],
    },
    {
      id: 'blog', label: 'Blog page', page: '/blog/',
      groups: [
        { title: 'Blog banner', fields: [
          { key: 'blog.banner', label: 'Banner photo', type: 'image', folder: 'site', def: '/images/blog-banner.jpg' },
          { key: 'blog.eyebrow', label: 'Small label', type: 'text', max: 30, def: 'All Stories' },
          { key: 'blog.title', label: 'Title', type: 'text', max: 40, def: 'The Blog' },
          { key: 'blog.subtitle', label: 'Sub-title', type: 'textarea', max: 200, rows: 2, def: 'Every post, sorted newest first. Filter by category or search for a place, dish, or trip type.' },
        ] },
      ],
    },
    {
      id: 'contact', label: 'Contact & footer', page: '/about/',
      groups: [
        { title: 'Contact section', hint: 'The teal "Say hello" band near the bottom of the home and About pages.', fields: [
          { key: 'contact.eyebrow', label: 'Small label', type: 'text', max: 30, def: 'Say Hello' },
          { key: 'contact.heading', label: 'Heading', type: 'textarea', max: 120, rows: 2, def: 'Got a Question, a Tip, or Just Want to Say Hi?' },
          { key: 'contact.blurb', label: 'Paragraph', type: 'textarea', max: 300, rows: 3, def: "I read every message — whether it's about a trip you're planning, a place I should add to the list, or just to talk travel." },
          { key: 'contact.email', label: 'Email address', type: 'email', max: 120, def: 'admin.tearrigrundy@gmail.com' },
          { key: 'contact.instagram', label: 'Instagram link', type: 'url', max: 200, def: 'https://www.instagram.com/tearrigrundy' },
        ] },
        { title: 'Footer', fields: [
          { key: 'footer.tagline', label: 'Footer tagline', type: 'textarea', max: 200, rows: 2, def: 'Travel stories, food finds, and honest guides from wherever the passport gets stamped next.' },
        ] },
      ],
    },
  ];

  const defaults = {};
  sections.forEach((s) => s.groups.forEach((g) => g.fields.forEach((f) => {
    const [a, b] = f.key.split('.');
    (defaults[a] = defaults[a] || {})[b] = f.def;
  })));

  return { sections, defaults };
})();
