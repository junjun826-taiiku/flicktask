// Two apps share this page while the redesign is built: the new one at /next, the current one everywhere else.
// Each loads as its own chunk with its own CSS.
const isNext = location.pathname === '/next' || location.pathname.startsWith('/next/');
if (isNext) import('./next/main');
else import('./main-old');
