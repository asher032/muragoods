import { redirect } from 'next/navigation';

// There is ONE orders page. This second route existed alongside /orders with
// its own fetch and its own logout button, which is exactly how two account
// systems appear for one person. Old links and bookmarks keep working; they
// land on the canonical page.
export default function AccountOrdersRedirect() {
  redirect('/orders');
}