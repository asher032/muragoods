import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser } from '@/app/lib/session';
import { rateLimit } from '@/app/lib/rate-limit';

// Account profile API — identity comes exclusively from the signed session
// cookie. The ?email= parameter is gone: it allowed any visitor to read or
// overwrite any other user's profile (IDOR).

const MAX_AVATAR_CHARS = 900_000; // ~650KB image as data URL

// Usernames are a public handle: letters, digits, underscore and dot, no
// spaces, so a handle can be typed into a URL or a mention unambiguously.
const USERNAME_RE = /^[a-zA-Z0-9._]{3,32}$/;

export async function GET(req: Request) {
  try {
    const viewer = await getSessionUser(req);
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findOne({ email: viewer.email })
      .select('name username email userId avatar createdAt updatedAt coinBalance perks bio preferences discord linkedAccounts');
    if (!user) return NextResponse.json({ success: true, data: null });
    const linked = (user as { linkedAccounts?: { discordUserId?: string; discordUsername?: string; discordLinkedAt?: Date | null } }).linkedAccounts;
    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        displayName: user.name,
        username: user.username || '',
        email: user.email,
        // The canonical id. Stable for the life of the account and the key
        // every other surface stores.
        userId: user.userId,
        avatar: user.avatar || '',
        bio: (user as { bio?: string }).bio || '',
        preferences: (user as { preferences?: Record<string, unknown> }).preferences || {},
        createdAt: user.createdAt,
        updatedAt: (user as { updatedAt?: Date }).updatedAt || user.createdAt,
        coinBalance: user.coinBalance || 0,
        perks: user.perks || [],
        discord: {
          connected: Boolean(user.discord?.discordId || linked?.discordUserId),
          userId: user.discord?.discordId || linked?.discordUserId || '',
          username: user.discord?.username || linked?.discordUsername || '',
          linkedAt: user.discord?.linkedAt || linked?.discordLinkedAt || null,
        },
      },
    });
  } catch {
    console.error('[account/profile GET] failed');
    return NextResponse.json({ success: false, error: 'Could not load profile' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const viewer = await getSessionUser(req);
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const rl = rateLimit(`profile:${viewer.email}`, 20, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many updates — slow down' }, { status: 429 });

    await dbConnect();
    const body = await req.json().catch(() => ({}));

    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 40) {
        return NextResponse.json({ success: false, error: 'Name must be 2–40 characters' }, { status: 400 });
      }
      update.name = name;
    }

    // Public handle. Distinct from the display name so renaming yourself never
    // changes the address other people link to. Cleared by sending ''.
    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (username === '') {
        update.username = '';
      } else if (!USERNAME_RE.test(username)) {
        return NextResponse.json(
          { success: false, error: 'Username must be 3–32 characters (letters, numbers, _ or .)' },
          { status: 400 },
        );
      } else {
        // Uniqueness is enforced case-insensitively by a partial unique index;
        // check it here too so the error is readable rather than a raw E11000.
        // The collation MUST match the index's, or this check would pass for
        // "Ash" while the index rejects it for "ash".
        const taken = await User.findOne(
          { username, email: { $ne: viewer.email } },
          { collation: { locale: 'en', strength: 2 } },
        ).select('email').lean();
        if (taken) {
          return NextResponse.json({ success: false, error: 'That username is already taken' }, { status: 409 });
        }
        update.username = username;
      }
    }

    if (body.bio !== undefined) {
      const bio = String(body.bio).trim();
      if (bio.length > 200) {
        return NextResponse.json({ success: false, error: 'Bio must be under 200 characters' }, { status: 400 });
      }
      update.bio = bio;
    }

    if (body.avatar !== undefined) {
      const avatar = String(body.avatar);
      if (avatar && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(avatar)) {
        return NextResponse.json({ success: false, error: 'Avatar must be an image data URL' }, { status: 400 });
      }
      if (avatar.length > MAX_AVATAR_CHARS) {
        return NextResponse.json({ success: false, error: 'Image too large — pick one under 2MB' }, { status: 400 });
      }
      update.avatar = avatar;
    }

    // Structured preferences (theme, language, notifications, autoplay,
    // visibility toggles). Only known keys are accepted, values validated.
    if (body.preferences !== undefined) {
      const prefsIn = (body.preferences || {}) as Record<string, unknown>;
      const prefs: Record<string, unknown> = {};
      const boolKeys = ['notifications', 'autoplay', 'profilePublic', 'activityPublic', 'watchlistPublic'];
      for (const k of boolKeys) {
        if (prefsIn[k] !== undefined) prefs[k] = Boolean(prefsIn[k]);
      }
      if (prefsIn.theme !== undefined) {
        if (!['dark', 'light', 'system'].includes(String(prefsIn.theme))) {
          return NextResponse.json({ success: false, error: 'Invalid theme' }, { status: 400 });
        }
        prefs.theme = String(prefsIn.theme);
      }
      if (prefsIn.language !== undefined) {
        const lang = String(prefsIn.language);
        if (!/^[a-z-]{2,10}$/i.test(lang)) {
          return NextResponse.json({ success: false, error: 'Invalid language code' }, { status: 400 });
        }
        prefs.language = lang;
      }
      if (Object.keys(prefs).length > 0) update.preferences = prefs;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const user = await User.findOneAndUpdate(
      { email: viewer.email },
      { ...update, updatedAt: new Date() },
      { new: true, select: 'name username email userId avatar bio preferences createdAt updatedAt coinBalance' },
    );
    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        displayName: user.name,
        username: user.username || '',
        email: user.email,
        userId: user.userId,
        avatar: user.avatar || '',
        bio: (user as { bio?: string }).bio || '',
        preferences: (user as { preferences?: Record<string, unknown> }).preferences || {},
        createdAt: user.createdAt,
        updatedAt: (user as { updatedAt?: Date }).updatedAt,
        coinBalance: user.coinBalance || 0,
      },
    });
  } catch {
    console.error('[account/profile PATCH] failed');
    return NextResponse.json({ success: false, error: 'Could not update profile' }, { status: 500 });
  }
}
