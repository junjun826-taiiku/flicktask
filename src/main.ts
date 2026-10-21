// 当日モード (/events/:id/live) has its own small shell; everything else is the app.
// Each loads as its own chunk with its own CSS.
if (/^\/events\/[^/]+\/live\/?$/.test(location.pathname)) import('./main-live');
else import('./next/main');
