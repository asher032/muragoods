import { redirect } from 'next/navigation';

// Consolidated into the canonical ecosystem profile. This URL now forwards
// so bookmarks and old links keep working with ONE identity.
export default function AccountProfileRedirect() {
  redirect('/profile');
}
