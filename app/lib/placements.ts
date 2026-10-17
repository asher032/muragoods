/**
 * AdSense placement catalog.
 *
 * One source of truth for where ads are eligible on the public side of
 * Muragoods. Nothing sensitive (checkout, auth, admin, dashboards,
 * payment, private profiles) is in this list.
 *
 * Slot IDs are intentionally NOT filled in here. Create the units in the
 * AdSense dashboard, then paste the real `adSlotId` values into the
 * components that opt into each placement. Until then every placement
 * renders reserved space only and does not send an ad request.
 */

/** Homepage: one responsive unit between the feature showcase and the CTA band. */
export const HOMEPAGE_MID = '';

/** Menu: one responsive unit below the product grid, above the footer CTA. */
export const MENU_BELOW_GRID = '';

/** Murastream home: one responsive unit between the hero and the first row. */
export const MURASTREAM_HOME_HERO_BOTTOM = '';

/** Murastream home: one unit below the drama showcase, before Load More. */
export const MURASTREAM_HOME_BELOW_DRAMA = '';

/** Individual movie/episode pages: one responsive unit in a sidebar-like band below the player area — never inside the player frame or control bar. */
export const MURASTREAM_PLAYER_PAGE_MID = '';

/**
 * Page types that are explicitly NOT eligible for ads right now.
 *
 * Keep this list honest. When the product adds new public pages, decide
 * here whether they are ad-eligible before adding a slot.
 */
export const EXCLUDED_FROM_ADS = [
  '/checkout',
  '/checkout/*',
  '/api/*',
  '/login',
  '/signup',
  '/forgot-password',
  '/verify-email',
  '/account/*',
  '/order/*',
  '/receipt/*',
  '/profile/*',
  '/admin/*',
  '/dashboard/*',
  '/murastream/watch',
  '/murastream/watch/*',
  '/murastream/settings',
  '/murastream/downloads',
];
