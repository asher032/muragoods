import { redirect } from 'next/navigation';

// Murastream reads the same canonical Muragoods profile — there is no
// separate stream profile. This URL forwards to it.
export default function MuraStreamProfileRedirect() {
  redirect('/profile');
}
