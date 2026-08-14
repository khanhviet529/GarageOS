const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#17324d"/>
  <path d="M14 37h36l-3 12H17L14 37Zm5-18h26l5 15H14l5-15Zm6 5-2 7h18l-2-7H25Z" fill="#f4b942"/>
  <circle cx="23" cy="49" r="4" fill="#f7fafc"/>
  <circle cx="41" cy="49" r="4" fill="#f7fafc"/>
</svg>`;

export function GET() {
  return new Response(ICON, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': 'image/svg+xml; charset=utf-8',
    },
  });
}
